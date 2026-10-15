export type Periodo = { mes: number; anio: number };

export function mexicoPeriod(at: Date = new Date()): Periodo {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: 'numeric'
  }).formatToParts(at);
  const pick = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { mes:pick('month'), anio:pick('year') };
}

// Trece meses de cuenta. Desde marzo 2026 hasta marzo 2027; después,
// deslizar la ventana para conservar doce meses anteriores y el actual.
export function estadoCuentaWindow(now: Periodo = mexicoPeriod()): Periodo[] {
  const elapsed = (now.anio - 2026) * 12 + (now.mes - 3);
  const start = Math.max(0, elapsed - 12);
  return Array.from({ length: 13 }, (_, i) => {
    const month = start + i + 2;
    return { mes: month % 12 + 1, anio: 2026 + Math.floor(month / 12) };
  });
}
