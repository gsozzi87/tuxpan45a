/** Cuotas y aplicaciones: cobrar una vez, acreditar varios períodos. */
export type MesContable = {mes:number;anio:number};
export function periodoId(anio:number, mes:number):number {
  if(!Number.isInteger(anio)||anio<2026||anio>2100||!Number.isInteger(mes)||mes<1||mes>12)
    throw new Error('Período inválido');
  return anio*12+mes;
}
export function rangoMeses(desde:MesContable,hasta:MesContable):MesContable[] {
  const a=periodoId(desde.anio,desde.mes),b=periodoId(hasta.anio,hasta.mes);
  if(b<a||b-a>=24)throw new Error('Elegí un rango entre 1 y 24 meses');
  return Array.from({length:b-a+1},(_,i)=>{
    const index=a+i-1;
    return {anio:Math.floor(index/12),mes:index%12+1};
  });
}
export function centavos(value:number):number {
  if(!Number.isFinite(value)||value<0||value>1e9)throw new Error('Importe inválido');
  return Math.round(value*100);
}
export function crearDistribucion(items:Array<{mes:number;anio:number;cuota:number;acreditado:number}>){
  if(!items.length||items.length>24)throw new Error('Rango inválido');
  const vistos=new Set<number>();
  const aplicaciones=items.map(({mes,anio,cuota,acreditado})=>{
    const key=periodoId(anio,mes);
    if(vistos.has(key))throw new Error('Período duplicado');
    vistos.add(key);
    const due=centavos(cuota),used=centavos(acreditado);
    return {mes,anio,monto:Math.max(0,due-used)/100};
  });
  const pendientes=aplicaciones.filter(x=>x.monto>0);
  if(!pendientes.length)throw new Error('Estos meses ya están cubiertos');
  return {aplicaciones:pendientes,total:pendientes.reduce((s,x)=>s+centavos(x.monto),0)/100};
}
