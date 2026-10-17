export const DAY_MS = 86400e3;
export const YEAR_MS = 365.25 * DAY_MS;

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const pad = (n: number) => String(n).padStart(2, '0');

export function fmtRate(r: number | null | undefined, digits?: number): string {
  if (r == null || !isFinite(r)) return '—';
  const d = digits ?? (Math.abs(r) < 10 ? 1 : 0);
  const v = Math.abs(r).toFixed(d);
  return (r > 0.05 ? '+' : r < -0.05 ? '−' : '±') + v;
}
export const fmtSigned = (v: number, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
export const fmtMs = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : v.toFixed(1));
export const fmtDeg = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : Math.round(v).toString());

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function num(v: string | number | null | undefined): number | null {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}
export const watchName = (w: { brand: string; model: string }) => [w.brand, w.model].filter(Boolean).join(' ') || '이름 없는 시계';
