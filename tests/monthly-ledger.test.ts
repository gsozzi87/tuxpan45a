import {describe,expect,test} from 'bun:test';
import {rangoMeses,crearDistribucion,periodoId} from '../monthly-ledger';

describe('Cobertura de meses',()=>{
 test('mayo a diciembre son ocho cuotas, sin duplicar ingresos',()=>{
   const m=rangoMeses({mes:5,anio:2026},{mes:12,anio:2026});
   expect(m).toHaveLength(8);
   const plan=crearDistribucion(m.map(x=>({...x,cuota:1750,acreditado:0})));
   expect(plan.total).toBe(14000);
   expect(plan.aplicaciones.map(x=>x.mes)).toEqual([5,6,7,8,9,10,11,12]);
 });
 test('acepta rangos entre años',()=>{
   expect(rangoMeses({mes:11,anio:2026},{mes:2,anio:2027}).map(x=>x.mes)).toEqual([11,12,1,2]);
 });
 test('evita cobrar meses ya cubiertos y sólo toma el saldo',()=>{
   const x=crearDistribucion([{mes:8,anio:2026,cuota:1900,acreditado:1900},{mes:9,anio:2026,cuota:1900,acreditado:400}]);
   expect(x.total).toBe(1500);expect(x.aplicaciones).toHaveLength(1);
 });
 test('rechaza fechas imposibles, rangos excesivos y pagos dobles',()=>{
   expect(()=>periodoId(2026,13)).toThrow();
   expect(()=>rangoMeses({mes:1,anio:2026},{mes:3,anio:2028})).toThrow();
   expect(()=>crearDistribucion([{mes:4,anio:2026,cuota:1750,acreditado:1750}])).toThrow();
 });
});