/**
 * Format a number with fixed decimal places, ensuring -0 / -0.0 / -0.00
 * is always rendered cleanly as 0 / 0.0 / 0.00.
 */
export function fmtFixed(val: number, digits = 1): string {
  if (!Number.isFinite(val)) return '—';
  const threshold = 0.5 * Math.pow(10, -digits);
  const safe = Math.abs(val) < threshold ? 0 : val;
  const out = safe.toFixed(digits);
  return out === '-0' || out.startsWith('-0.') && Number(out) === 0
    ? (0).toFixed(digits)
    : out;
}

/**
 * Format a signed diff delta (e.g., "+1.2 s", "-0.4 km", "0.0 m") without -0.0.
 */
export function fmtSignedDelta(val: number, unit: string, digits = 1): string {
  const threshold = 0.5 * Math.pow(10, -digits);
  const safe = Math.abs(val) < threshold ? 0 : val;
  const sign = safe > 0 ? '+' : '';
  return `${sign}${fmtFixed(safe, digits)} ${unit}`;
}
