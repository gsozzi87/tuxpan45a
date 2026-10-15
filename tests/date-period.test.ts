import { test, expect } from 'bun:test';
import { mexicoPeriod, estadoCuentaWindow } from '../date-period';

test('usa el mes de Ciudad de México aunque el servidor opere en UTC', () => {
  expect(mexicoPeriod(new Date('2026-11-01T04:30:00Z'))).toEqual({ mes:10, anio:2026 });
  expect(mexicoPeriod(new Date('2027-01-01T03:00:00Z'))).toEqual({ mes:12, anio:2026 });
});
test('mantiene la ventana inicial de marzo de 2026 a marzo de 2027', () => {
  const periods = estadoCuentaWindow({ mes:10, anio:2026 });
  expect(periods).toHaveLength(13);
  expect(periods[0]).toEqual({mes:3,anio:2026});
  expect(periods.at(-1)).toEqual({mes:3,anio:2027});
});
test('avanza el estado de cuenta automáticamente después de marzo de 2027', () => {
  const periods = estadoCuentaWindow({ mes:4, anio:2027 });
  expect(periods[0]).toEqual({mes:4,anio:2026});
  expect(periods.at(-1)).toEqual({mes:4,anio:2027});
});
