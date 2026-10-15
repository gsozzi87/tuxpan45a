export class PaymentValidationError extends Error {}
export function parsePaymentInput(input: Record<string, any>) {
  const id = Number(input.condominio_id);
  const mes = Number(input.mes);
  const anio = Number(input.anio);
  const amount = Number(input.monto);
  const tipo = input.tipo_pago || 'ordinario';
  const ext = input.gasto_ext_id ? Number(input.gasto_ext_id) : null;
  if (!Number.isSafeInteger(id) || id < 1 ||
      !Number.isInteger(mes) || mes < 1 || mes > 12 ||
      !Number.isInteger(anio) || anio < 2026 || anio > 2100) {
    throw new PaymentValidationError('Condominio, mes o año inválidos.');
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new PaymentValidationError('El importe debe ser positivo y válido.');
  }
  if (tipo !== 'ordinario' && tipo !== 'extraordinario') {
    throw new PaymentValidationError('Tipo de pago inválido.');
  }
  if (tipo === 'extraordinario' && (!Number.isSafeInteger(ext) || ext! < 1)) {
    throw new PaymentValidationError('Seleccione un gasto extraordinario.');
  }
  if (tipo === 'ordinario' && ext !== null) {
    throw new PaymentValidationError('Un pago ordinario no puede asociarse a un gasto extraordinario.');
  }
  const fields = ['fecha_pago','metodo_pago','referencia','numero_recibo','notas'];
  for (const field of fields) {
    if (input[field] != null && (typeof input[field] !== 'string' || input[field].length > (field === 'notas' ? 4000 : 200))) {
      throw new PaymentValidationError('Campos del pago demasiado largos o inválidos.');
    }
  }
  if (input.fecha_pago && !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_pago)) {
    throw new PaymentValidationError('Fecha de pago inválida.');
  }
  return { condoId:id, mes, anio, monto:Math.round(amount * 100) / 100, tipo, gastoExtId:ext };
}
