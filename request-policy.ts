// Limitador simple por instancia; reduce abuso, no sustituye autenticación.
export type WindowEntry = { until: number; count: number };
export function makeRateLimiter(clock: () => number = Date.now) {
  const entries = new Map<string, WindowEntry>();
  return (key: string, limit: number, windowMs: number): boolean => {
    const now = clock();
    const existing = entries.get(key);
    if (!existing || now >= existing.until) {
      entries.set(key, { count: 1, until: now + windowMs });
    } else {
      if (existing.count >= limit) return false;
      existing.count++;
    }
    if (entries.size > 5000) {
      for (const [k, v] of entries) if (v.until <= now) entries.delete(k);
    }
    return true;
  };
}
export function eligibleUnit(unit: string, active: boolean, enabled: string[]) {
  return active && (enabled.length === 0 || enabled.includes(unit));
}
