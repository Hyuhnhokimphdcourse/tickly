/**
 * JJY standard-time timecode (NICT). One symbol per second, high amplitude from the start of
 * the second for: marker 0.2 s, bit 1 → 0.5 s, bit 0 → 0.8 s; low (10 %) for the rest.
 * The frame transmitted during a minute encodes that minute (JST = UTC+9, same as KST).
 * Source: https://jjy.nict.go.jp/jjy/trans/index.html
 */
export type JjySymbol = 'M' | 0 | 1;

export const JJY_HIGH_SECONDS: Record<string, number> = { M: 0.2, 1: 0.5, 0: 0.8 };

const MARKERS = new Set([0, 9, 19, 29, 39, 49, 59]);

function bcd(v: number, weights: number[]): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  for (const w of weights) { if (v >= w) { out.push(1); v -= w; } else out.push(0); }
  return out;
}

function dayOfYear(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
}

/** 60 symbols for the minute starting at `ms` (any time inside the minute works). */
export function jjyFrame(ms: number): JjySymbol[] {
  const j = new Date(ms + 9 * 3600 * 1000); // JST fields via UTC getters
  const min = j.getUTCMinutes(), hr = j.getUTCHours();
  const doy = dayOfYear(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
  const yy = j.getUTCFullYear() % 100, wd = j.getUTCDay();
  const f: JjySymbol[] = new Array(60).fill(0);
  for (const s of MARKERS) f[s] = 'M';
  const put = (at: number, bits: (0 | 1)[]) => bits.forEach((b, i) => { f[at + i] = b; });
  const mBits = [...bcd(Math.floor(min / 10) * 10, [40, 20, 10]), 0 as const, ...bcd(min % 10, [8, 4, 2, 1])];
  put(1, mBits);
  const hBits = [...bcd(Math.floor(hr / 10) * 10, [20, 10]), 0 as const, ...bcd(hr % 10, [8, 4, 2, 1])];
  put(12, hBits);
  const h = Math.floor(doy / 100), t = Math.floor((doy % 100) / 10), u = doy % 10;
  put(22, bcd(h * 100, [200, 100]));
  put(25, bcd(t * 10, [80, 40, 20, 10]));
  put(30, bcd(u, [8, 4, 2, 1]));
  const ones = (b: (0 | 1)[]) => b.reduce<number>((a, x) => a + x, 0);
  f[36] = (ones(hBits) % 2) as 0 | 1; // PA1: even parity of hour
  f[37] = (ones(mBits) % 2) as 0 | 1; // PA2: even parity of minute
  put(41, bcd(Math.floor(yy / 10) * 10, [80, 40, 20, 10]));
  put(45, bcd(yy % 10, [8, 4, 2, 1]));
  put(50, bcd(wd, [4, 2, 1]));
  return f;
}

/** Decoder used by the tests: fields back out of a frame. */
export function decodeJjy(f: JjySymbol[]) {
  const v = (from: number, w: number[]) => w.reduce((a, x, i) => a + (f[from + i] === 1 ? x : 0), 0);
  return {
    minute: v(1, [40, 20, 10]) + v(5, [8, 4, 2, 1]),
    hour: v(12, [20, 10]) + v(15, [8, 4, 2, 1]),
    doy: v(22, [200, 100]) + v(25, [80, 40, 20, 10]) + v(30, [8, 4, 2, 1]),
    year: v(41, [80, 40, 20, 10]) + v(45, [8, 4, 2, 1]),
    weekday: v(50, [4, 2, 1]),
  };
}

/** Audio tone whose 3rd harmonic lands on the JJY carrier (40 kHz → 13.333 kHz, 60 kHz → 20 kHz). */
export const JJY_TONE: Record<40 | 60, number> = { 40: 40000 / 3, 60: 60000 / 3 };
