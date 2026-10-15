import { test, expect } from 'bun:test';
import { parsePaymentInput } from '../payment-policy';

const valid = { condominio_id:'4', mes:'10', anio:'2026', monto:'1250.50' };
test('acepta pago ordinario válido', () => {
  expect(parsePaymentInput(valid)).toMatchObject({ condoId:4, mes:10, anio:2026, monto:1250.5, tipo:'ordinario', gastoExtId:null });
});
test('rechaza importes no finitos o negativos', () => {
  for (const monto of ['NaN','Infinity','0','-1','-0.3']) {
    expect(() => parsePaymentInput({...valid,monto})).toThrow();
  }
});
test('rechaza meses fuera de rango y años inválidos', () => {
  for (const mes of ['0','13','1.2']) expect(() => parsePaymentInput({...valid,mes})).toThrow();
  expect(() => parsePaymentInput({...valid,anio:'2025'})).toThrow();
});
test('requiere referencia del gasto para pagos extraordinarios', () => {
  expect(() => parsePaymentInput({...valid,tipo_pago:'extraordinario'})).toThrow();
  expect(parsePaymentInput({...valid,tipo_pago:'extraordinario',gasto_ext_id:'9'}).gastoExtId).toBe(9);
  expect(() => parsePaymentInput({...valid,gasto_ext_id:'9'})).toThrow();
});
test('normaliza centavos', () => {
  expect(parsePaymentInput({...valid,monto:'10.245'}).monto).toBe(10.25);
});
