import {expect,test} from 'bun:test';
import {objetivoMensual,estadoPago} from '../monthly-expenses';
test('un recibo antiguo variable no hereda octubre',()=>{
 const old=objetivoMensual({variable:true,plantilla:7528,configurado:null,pagado:4100,esHistorico:true});
 expect(old.monto).toBe(4100);expect(estadoPago(4100,old).estado).toBe('pagado');
});
test('un gasto mensual explícito conserva el faltante',()=>{
 const obj=objetivoMensual({variable:true,plantilla:7528,configurado:6000,pagado:4000,esHistorico:true});
 expect(estadoPago(4000,obj).pendiente).toBe(2000);
});
test('período variable histórico sin factura no genera deuda artificial',()=>{
 const obj=objetivoMensual({variable:true,plantilla:7528,configurado:null,pagado:0,esHistorico:true});
 expect(estadoPago(0,obj).estado).toBe('sin_definir');
});
test('fijo respeta su importe histórico generado',()=>{
 const obj=objetivoMensual({variable:false,plantilla:4500,configurado:null,pagado:3000,esHistorico:true,historicoGenerado:3000});
 expect(obj.monto).toBe(3000);
});