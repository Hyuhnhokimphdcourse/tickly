import type { PrecisionEntry } from './types';
import { DAY_MS } from './util';

export interface PrecisionFit {
  rate: number; // s/d
  intercept: number;
  se: number | null;
  n: number;
  spanDays: number;
  xs: number[]; // days since first entry
  ys: number[]; // offsets, s
}

/** Least-squares slope of offset vs. elapsed days = observed daily rate. */
export function fitPrecision(entries: PrecisionEntry[]): PrecisionFit | null {
  if (entries.length < 2) return null;
  const pts = entries.slice().sort((a, b) => a.t - b.t);
  const t0 = pts[0].t;
  const xs = pts.map(p => (p.t - t0) / DAY_MS);
  const ys = pts.map(p => p.off);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  if (sxx === 0) return null;
  const rate = sxy / sxx;
  const intercept = my - rate * mx;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (intercept + rate * xs[i])) ** 2;
  const se = n > 2 ? Math.sqrt(ss / (n - 2) / sxx) : null;
  return { rate, intercept, se, n, spanDays: xs[n - 1] - xs[0], xs, ys };
}

/**
 * Offset of the watch against the device clock when the user taps as the seconds hand
 * passes 12 with the minute hand on `targetMin` (minutes since midnight, 12-hour wrap).
 */
export function offsetFor(targetMin: number, tapMs: number): number {
  const H12 = 12 * 3600e3;
  const d = new Date(tapMs);
  const ref = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
  let diff = (((targetMin * 60000 - ref) % H12) + H12) % H12;
  if (diff > H12 / 2) diff -= H12;
  return diff / 1000;
}
