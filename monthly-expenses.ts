export function objetivoMensual(a:{variable:boolean;plantilla:number;configurado:number|null;pagado:number;esHistorico:boolean;historicoGenerado?:number|null}) {
 if (a.configurado!==null&&Number.isFinite(a.configurado))return {monto:a.configurado,fuente:'mes' as const};
 if(a.variable&&a.esHistorico) return a.pagado>0?{monto:a.pagado,fuente:'historico' as const}:{monto:null,fuente:'sin_definir' as const};
 if(!a.variable&&a.esHistorico&&a.historicoGenerado!=null&&Number.isFinite(a.historicoGenerado))return {monto:a.historicoGenerado,fuente:'historico' as const};
 return {monto:a.plantilla,fuente:'plantilla' as const};
}
export function estadoPago(pagado:number, objetivo:{monto:number|null}){
 if(objetivo.monto===null)return {pendiente:0,porcentaje:0,estado:'sin_definir'};
 const pendiente=Math.max(0,Math.round((objetivo.monto-pagado)*100)/100);
 return {pendiente,porcentaje:objetivo.monto>0?Math.min(100,Math.round(pagado/objetivo.monto*100)):100,
 estado:pendiente<=0.009?'pagado':pagado>0?'parcial':'pendiente'};
}