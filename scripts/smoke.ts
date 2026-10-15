import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root=mkdtempSync(join(tmpdir(),'tuxpan-smoke-'));
const port=31873;
const server=Bun.spawn({
  cmd:['bun','run','index.ts'],stdout:'pipe',stderr:'pipe',
  env:{...process.env,PORT:String(port),DB_PATH:join(root,'smoke.sqlite'),
    UPLOAD_DIR:join(root,'uploads'),INITIAL_ADMIN_PASSWORD:'CI-Test-Admin-123456'}
});
const base=`http://127.0.0.1:${port}`;
let cookie='';
async function req(path:string,options:RequestInit={}) {
 const res=await fetch(base+path,{...options,headers:{...(cookie?{Cookie:cookie}:{}),
   ...(options.headers||{})}});
 const raw=await res.text();
 let body:any;try{body=JSON.parse(raw)}catch{body=raw}
 return {res,body};
}
async function json(path:string,method:string,body:object){
 return req(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
}
async function multipart(path:string,values:Record<string,string>){
 const fd=new FormData();
 for(const [k,v] of Object.entries(values))fd.append(k,v);
 return req(path,{method:'POST',body:fd});
}
async function main(){
 let ready=false;
 for(let i=0;i<100;i++){
  try{const r=await req('/api/unidades');if(r.res.ok){ready=true;break;}}catch{}
  await Bun.sleep(100);
 }
 if(!ready){
  server.kill();
  const err=await new Response(server.stderr).text();
  const out=await new Response(server.stdout).text();
  throw new Error('No arrancó el servidor con SQLite temporal:\n'+out+'\n'+err);
 }
 const unidades=await req('/api/unidades');
 assert(!unidades.body.includes('201'),'201 no debe reintroducirse en instalación nueva');
 const login=await json('/api/auth/login','POST',{username:'admin',password:'CI-Test-Admin-123456'});
 assert.equal(login.res.status,200,JSON.stringify(login.body));
 cookie=login.res.headers.get('set-cookie')?.split(';')[0]||'';
 assert(cookie.startsWith('sid='),'Sin sesión admin');
 const expenses=await req('/api/gastos/plantilla');
 const luz=expenses.body.find((x:any)=>x.concepto==='Servicio de luz');
 assert(luz?.id,'No existe gasto de luz');
 let value=await json(`/api/gastos/plantilla/${luz.id}/objetivo`,'PUT',{mes:10,anio:2026,monto:7528});
 assert.equal(value.res.status,200);
 const paid=await multipart(`/api/gastos/plantilla/${luz.id}/pagos`,{mes:'9',anio:'2026',monto:'4100',fecha:'2026-09-15'});
 assert.equal(paid.res.status,200,JSON.stringify(paid.body));
 const sept=await req(`/api/gastos/plantilla/${luz.id}/pagos?mes=9&anio=2026`);
 const oct=await req(`/api/gastos/plantilla/${luz.id}/pagos?mes=10&anio=2026`);
 assert.equal(sept.body.monto,4100);
 assert.equal(sept.body.estado,'pagado');
 assert.equal(oct.body.monto,7528);
 const create=await json('/api/condominios','POST',{unidad:'PRUEBA-CI',propietario:'Prueba temporal',cuota_mensual:5500});
 assert.equal(create.res.status,200,JSON.stringify(create.body));
 const id=create.body.id;
 let p=await multipart('/api/pagos',{condominio_id:String(id),mes:'10',anio:'2026',monto:'2000'});
 assert.equal(p.res.status,200,JSON.stringify(p.body));
 const arrears=await req('/api/pagos/deudores?anio=2026');
 const due=arrears.body.find((x:any)=>x.id===id);
 assert.equal(due?.faltantes_mes?.find((x:any)=>x.mes===10)?.pendiente,3500);
 p=await multipart('/api/pagos',{condominio_id:String(id),mes:'10',anio:'2026',monto:'5500'});
 assert.equal(p.res.status,409,'No debe reemplazar sin confirmación');
 p=await multipart('/api/pagos',{condominio_id:String(id),mes:'10',anio:'2026',monto:'5500',confirm_replace:'1'});
 assert.equal(p.res.status,200);
 const pagoDetalle=await req(`/api/condominios/${id}`);
 assert.equal(pagoDetalle.body.pagos.find((x:any)=>x.mes===10&&x.anio===2026)?.monto,5500);
 const dropped=await req(`/api/condominios/${id}`,{method:'DELETE'});
 assert(dropped.body.desactivado,'Un despacho con pagos debe preservarse como inactivo');
 const empty=await json('/api/condominios','POST',{unidad:'PRUEBA-VACIA',propietario:'Temporal',cuota_mensual:0});
 assert.equal(empty.res.status,200);
 const removed=await req(`/api/condominios/${empty.body.id}`,{method:'DELETE'});
 assert(removed.body.eliminado,'Unidad sin historial se debe borrar físicamente');
 const publics=await req('/api/unidades');
 assert(!publics.body.includes('PRUEBA-CI')&&!publics.body.includes('PRUEBA-VACIA'));
 console.log('✓ Smoke: seed, login, factura variable, pagos parciales, confirmación y alta/baja');
}
try{await main()}finally{server.kill();rmSync(root,{recursive:true,force:true});}
