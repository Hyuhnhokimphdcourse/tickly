/**
 * Acoustic timegrapher core (platform-independent, pure TypeScript).
 *
 * Pipeline: high-pass → squared envelope → decimate → BPH detection (autocorrelation)
 *           → beat peak picking → first-sound onset → robust fit t_k = a + b·k + c·(−1)^k
 *
 * Conventions (same as the open-source timegrapher "tg", vacaboja/tg src/algo.c):
 *   period T     = one full balance oscillation = 2 beats
 *   beat error   = |T/2 − tic_to_toc|  (half the difference of the two half-periods)
 *   amplitude    = LA / (2·sin(π·τ / T)), τ = time from 1st sound (unlock) to last sound (lock)
 *   rate (s/d)   = 86400 · (P_nominal / P_measured − 1), P = beat interval
 */

export const STANDARD_BPH = [12000, 14400, 18000, 19800, 21600, 25200, 28800, 36000, 43200, 72000];

export type LockState = 'idle' | 'listening' | 'searching' | 'locked' | 'weak' | 'noisy' | 'lost';

export interface DiagramPoint {
  /** seconds since start */
  t: number;
  /** deviation from the nominal grid, ms (slope = rate) */
  x: number;
  /** 0 = tic, 1 = toc */
  parity: 0 | 1;
  /** relative loudness 0..1 (dot size) */
  a: number;
}

export interface TimegrapherResult {
  state: LockState;
  bph: number | null;
  bphAuto: boolean;
  rate: number | null; // s/d
  beatError: number | null; // ms
  amplitude: number | null; // degrees
  quality: number; // 0..1 share of expected beats that were accepted
  beats: number; // accepted beats in analysis window
  expected: number;
  elapsed: number; // seconds of audio
  diagram: DiagramPoint[];
  /** residual scatter of the fit, ms (precision indicator) */
  jitterMs: number | null;
}

export interface TimegrapherOptions {
  sampleRate: number;
  /** fixed BPH, or null to auto-detect */
  bph?: number | null;
  /** lift angle in degrees, or null (amplitude not computed) */
  liftAngle?: number | null;
  /** analysis window, seconds (beats older than this are ignored for rate/BE/amp) */
  windowSeconds?: number;
}

interface Beat {
  /** time of the loudest sound (parabolic-refined), seconds — used for tracking and rate */
  t: number;
  /** first-sound time (half-height rising edge), seconds — used for beat error */
  t1: number;
  /** pulse length (first→last sound) in seconds, or NaN */
  pulse: number;
  /** peak envelope value */
  peak: number;
}

const ENV_TARGET_RATE = 12000;

class Biquad {
  private b0: number; private b1: number; private b2: number; private a1: number; private a2: number;
  private z1 = 0; private z2 = 0;
  constructor(type: 'hp' | 'lp', fc: number, fs: number, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (type === 'hp') {
      this.b0 = (1 + cos) / 2 / a0; this.b1 = -(1 + cos) / a0; this.b2 = (1 + cos) / 2 / a0;
    } else {
      this.b0 = (1 - cos) / 2 / a0; this.b1 = (1 - cos) / a0; this.b2 = (1 - cos) / 2 / a0;
    }
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  step(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

function percentile(arr: ArrayLike<number>, from: number, to: number, ps: number[], stride = 1): number[] {
  const n = Math.max(0, Math.floor((to - from) / stride));
  const tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) tmp[i] = arr[from + i * stride];
  tmp.sort();
  return ps.map(p => (n ? tmp[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))] : 0));
}

export class Timegrapher {
  readonly fs: number;
  readonly fsEnv: number;
  private decim: number;
  private hp1: Biquad; private hp2: Biquad; private lp: Biquad;
  private env: Float32Array;
  private envLen = 0;
  private decCount = 0;
  private samples = 0;

  private fixedBph: number | null;
  private detectedBph: number | null = null;
  liftAngle: number | null;
  private windowSeconds: number;

  private beats: Beat[] = [];
  private scanFrom = 0; // env index from which peaks are still to be scanned
  private lastPeakIdx = -1e9;
  private lastPeakVal = 0;
  private lastAnalysis: TimegrapherResult | null = null;
  private lockedOnce = false;

  constructor(opts: TimegrapherOptions) {
    this.fs = opts.sampleRate;
    this.decim = Math.max(1, Math.round(this.fs / ENV_TARGET_RATE));
    this.fsEnv = this.fs / this.decim;
    this.hp1 = new Biquad('hp', 1500, this.fs);
    this.hp2 = new Biquad('hp', 1500, this.fs);
    this.lp = new Biquad('lp', Math.min(2500, this.fsEnv * 0.4), this.fs);
    this.env = new Float32Array(Math.ceil(this.fsEnv * 20));
    this.fixedBph = opts.bph ?? null;
    this.liftAngle = opts.liftAngle ?? null;
    this.windowSeconds = opts.windowSeconds ?? 30;
  }

  get bph(): number | null { return this.fixedBph ?? this.detectedBph; }
  get elapsed(): number { return this.samples / this.fs; }

  setBph(bph: number | null) {
    this.fixedBph = bph;
    this.resetBeats();
  }

  private resetBeats() {
    this.beats = [];
    // rescan what is still in the envelope buffer, so a (re)detected BPH can lock immediately
    this.scanFrom = Math.max(1, this.envLen - Math.round(this.fsEnv * Math.min(this.windowSeconds, 20)));
    this.lastPeakIdx = -1e9;
  }

  /** Feed mono PCM samples (−1..1). */
  push(chunk: Float32Array) {
    const need = this.envLen + Math.ceil(chunk.length / this.decim) + 2;
    if (need > this.env.length) {
      const grown = new Float32Array(Math.max(need, this.env.length * 2));
      grown.set(this.env.subarray(0, this.envLen));
      this.env = grown;
    }
    for (let i = 0; i < chunk.length; i++) {
      const h = this.hp2.step(this.hp1.step(chunk[i]));
      const e = this.lp.step(h * h);
      if (++this.decCount >= this.decim) {
        this.decCount = 0;
        this.env[this.envLen++] = e > 0 ? Math.sqrt(e) : 0;
      }
    }
    this.samples += chunk.length;
  }

  /** Auto-detect BPH from the last few seconds of envelope. */
  private detectBph(): number | null {
    const secs = Math.min(6, this.envLen / this.fsEnv);
    if (secs < 2.5) return null;
    const pool = Math.max(1, Math.round(this.fsEnv / 1000)); // ~1 kHz coarse envelope
    const start = this.envLen - Math.floor(secs * this.fsEnv);
    const n = Math.floor((this.envLen - start) / pool);
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = 0; j < pool; j++) { const v = this.env[start + i * pool + j]; if (v > m) m = v; }
      c[i] = m;
    }
    // widen each tick to ~6 ms so tic/toc stay aligned in the autocorrelation despite beat error
    const cr = this.fsEnv / pool; // coarse rate, Hz
    const half = Math.max(1, Math.round(0.003 * cr));
    const sm = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n + half; i++) {
      if (i < n) acc += c[i];
      if (i - 2 * half - 1 >= 0) acc -= c[i - 2 * half - 1];
      const j = i - half;
      if (j >= 0 && j < n) sm[j] = acc;
    }
    // remove slow loudness drift (handling noise, breathing) with a centred 0.2 s moving average,
    // otherwise it correlates at every short lag and biases detection toward high BPH
    const W = Math.max(3, Math.round(0.1 * cr));
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + sm[i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - W), b = Math.min(n, i + W + 1);
      c[i] = sm[i] - (pre[b] - pre[a]) / (b - a);
    }
    const ac = (lag: number) => {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += c[i] * c[i + lag];
      return s / (n - lag);
    };
    let e0 = 0; for (let i = 0; i < n; i++) e0 += c[i] * c[i]; e0 /= n;
    if (e0 <= 0) return null;
    const scoreAt = (periodS: number) => {
      const lo = Math.floor(periodS * cr * 0.994), hi = Math.ceil(periodS * cr * 1.006);
      let best = -Infinity;
      for (let l = lo; l <= hi; l++) if (l > 0 && l < n / 2) best = Math.max(best, ac(l));
      return best / e0;
    };
    const scored = STANDARD_BPH.map(bph => {
      const P = 3600 / bph;
      return { bph, P, s: scoreAt(P) + 0.5 * scoreAt(2 * P) };
    });
    const best = scored.reduce((a, b) => (b.s > a.s ? b : a));
    if (!(best.s > 0.25)) return null;
    // prefer the shortest period that explains the signal almost as well (avoid sub-harmonics)
    const ok = scored.filter(x => x.s >= 0.8 * best.s).sort((a, b) => a.P - b.P);
    return ok[0].bph;
  }

  /**
   * Incrementally collect beat candidates: one per acoustic event (the strongest local maximum
   * within a short refractory span), with first-sound time and pulse length measured on it.
   * Spurious clicks are allowed here; the phase tracker in analyze() rejects them.
   */
  private scanBeats(P: number) {
    const fe = this.fsEnv;
    const tauMax = this.pulseMax(P);
    const end = this.envLen - Math.ceil((tauMax + 0.006) * fe); // margin so the event is complete
    if (end <= this.scanFrom) return;
    const lvFrom = Math.max(0, end - Math.round(3 * fe));
    const [p20, floor, p80, top] = percentile(this.env, lvFrom, end, [0.2, 0.5, 0.8, 0.995], 2);
    const noise = Math.max(1e-9, (p80 - p20) / 1.68); // σ of the envelope in the quiet part
    const thr = floor + Math.max(0.25 * (top - floor), 6 * noise);
    const refr = Math.round(Math.min(0.45 * P, tauMax + 0.004) * fe);
    for (let i = Math.max(1, this.scanFrom); i < end; i++) {
      const v = this.env[i];
      if (v < thr || v < this.env[i - 1] || v < this.env[i + 1]) continue;
      if (i - this.lastPeakIdx < refr) {
        if (v > this.lastPeakVal && this.beats.length) this.beats.pop(); // louder part of the same event
        else continue;
      }
      const m = this.measureEvent(i, v, floor, noise, tauMax);
      this.beats.push(m);
      this.lastPeakIdx = i;
      this.lastPeakVal = v;
    }
    this.scanFrom = end;
    const keepFrom = this.elapsed - this.windowSeconds * 2;
    if (this.beats.length && this.beats[0].t < keepFrom) {
      let k = 0; while (k < this.beats.length && this.beats[k].t < keepFrom) k++;
      this.beats.splice(0, k);
    }
  }

  /** Rising-edge crossing time (s) of `level` scanning backwards from index `from`. */
  private riseCross(from: number, level: number, lo: number): number {
    let j = from;
    while (j > lo && this.env[j - 1] >= level) j--;
    const a = this.env[j - 1] ?? 0, b = this.env[j];
    const f = b > a ? (level - a) / (b - a) : 1;
    return (j - 1 + Math.min(1, Math.max(0, f))) / this.fsEnv;
  }

  private measureEvent(i: number, v: number, floor: number, noise: number, tauMax: number): Beat {
    const fe = this.fsEnv;
    // 1) first sound: earliest sustained activity in [peak − tauMax − 2 ms, peak]
    const onThr = floor + Math.max(0.12 * (v - floor), 5 * noise);
    const w0 = Math.max(1, i - Math.ceil((tauMax + 0.002) * fe));
    const sustain = Math.max(2, Math.round(0.00025 * fe));
    let on = i;
    for (let j = w0; j < i; j++) {
      if (this.env[j] < onThr) continue;
      let ok = true;
      for (let k = 1; k <= sustain && j + k <= i; k++) if (this.env[j + k] < onThr) { ok = false; break; }
      if (ok) { on = j; break; }
    }
    // local peak of the first sound
    let p1 = on;
    while (p1 < i && this.env[p1 + 1] >= this.env[p1]) p1++;
    // 2) last sound: latest significant local maximum after the first sound, within tauMax
    const lastThr = floor + Math.max(0.35 * (v - floor), 7 * noise);
    let p3 = p1;
    const pEnd = Math.min(this.envLen - 2, on + Math.ceil(tauMax * fe));
    for (let j = p1 + 1; j <= pEnd; j++) {
      const x = this.env[j];
      if (x >= lastThr && x >= this.env[j - 1] && x > this.env[j + 1]) p3 = j;
    }
    // times: half-height rising edges of each sound, so envelope-shape delays cancel in τ
    const t1 = this.riseCross(p1, floor + 0.5 * (this.env[p1] - floor), w0);
    const lo3 = Math.max(p1 + 1, p3 - Math.ceil(0.002 * fe));
    const t3 = p3 > p1 ? this.riseCross(p3, floor + 0.5 * (this.env[p3] - floor), lo3) : NaN;
    const pulse = t3 - t1;
    // loudest-sound time with parabolic refinement
    let tp = i;
    if (i > 0 && i < this.envLen - 1) {
      const a = this.env[i - 1], b = this.env[i], c = this.env[i + 1];
      const d = a - 2 * b + c;
      if (d < 0) tp = i + (0.5 * (a - c)) / d;
    }
    return { t: tp / fe, t1, pulse: pulse > 0.0015 ? pulse : NaN, peak: v };
  }

  /** longest plausible pulse (amplitude ≥ 120° at LA 60°) */
  private pulseMax(P: number): number {
    const T = 2 * P;
    return (T / Math.PI) * Math.asin(Math.min(1, 60 / (2 * 120)));
  }

  /**
   * Phase-locked tracking: from a seed event, predict each next beat from a running line fit
   * (with tic/toc offset) and accept the candidate nearest the prediction inside ±12 % of P.
   * Several seeds are tried; the track with the most beats wins.
   */
  private track(cands: Beat[], P: number, tEnd: number): { b: Beat; k: number }[] {
    if (cands.length < 4) return [];
    const firstWin = cands[0].t + Math.max(2 * P, 1.5);
    const seeds = cands
      .map((c, idx) => ({ c, idx }))
      .filter(x => x.c.t <= firstWin)
      .sort((a, b) => b.c.peak - a.c.peak)
      .slice(0, 6);
    let best: { b: Beat; k: number }[] = [];
    for (const { idx } of seeds) {
      const acc: { b: Beat; k: number }[] = [{ b: cands[idx], k: 0 }];
      let ptr = idx + 1, k = 1, misses = 0;
      let slope = P, icpt = cands[idx].t, off = 0;
      const win = 0.12 * P;
      while (true) {
        const par = k % 2 === 0 ? 1 : -1;
        const tPred = icpt + slope * k + par * off;
        if (tPred > tEnd) break;
        while (ptr < cands.length && cands[ptr].t < tPred - win) ptr++;
        let pick = -1, dmin = Infinity;
        for (let q = ptr; q < cands.length && cands[q].t <= tPred + win; q++) {
          const d = Math.abs(cands[q].t - tPred);
          if (d < dmin) { dmin = d; pick = q; }
        }
        if (pick >= 0) {
          acc.push({ b: cands[pick], k });
          ptr = pick + 1;
          misses = 0;
          // refit on the last ≤ 40 accepted beats
          const tail = acc.slice(-40);
          if (tail.length >= 3) {
            let n = 0, sk = 0, st = 0, skk = 0, skt = 0;
            for (const x of tail) { n++; sk += x.k; st += x.b.t; skk += x.k * x.k; skt += x.k * x.b.t; }
            const den = n * skk - sk * sk;
            if (den > 0) {
              slope = (n * skt - sk * st) / den;
              icpt = (st - slope * sk) / n;
              let se = 0, ne = 0, so = 0, no = 0;
              for (const x of tail) {
                const r = x.b.t - (icpt + slope * x.k);
                if (x.k % 2 === 0) { se += r; ne++; } else { so += r; no++; }
              }
              off = ne && no ? (se / ne - so / no) / 2 : 0;
              icpt += ne && no ? (se / ne + so / no) / 2 : 0;
            }
          }
        } else if (++misses > 10) break;
        k++;
      }
      if (acc.length > best.length) best = acc;
    }
    return best;
  }

  /** Last `seconds` of the tick envelope, max-pooled to `points`, normalised to 0..1 (for a live scope). */
  envTail(seconds: number, points: number): number[] {
    const n = Math.min(this.envLen, Math.round(seconds * this.fsEnv));
    if (n <= 0) return [];
    const start = this.envLen - n;
    const per = Math.max(1, Math.floor(n / points));
    const out: number[] = [];
    let mx = 1e-12;
    for (let i = 0; i + per <= n; i += per) {
      let m = 0;
      for (let j = 0; j < per; j++) { const v = this.env[start + i + j]; if (v > m) m = v; }
      out.push(m);
      if (m > mx) mx = m;
    }
    return out.map(v => v / mx);
  }

  analyze(): TimegrapherResult {
    const elapsed = this.elapsed;
    const base: TimegrapherResult = {
      state: 'listening', bph: this.bph, bphAuto: this.fixedBph == null, rate: null, beatError: null,
      amplitude: null, quality: 0, beats: 0, expected: 0, elapsed, diagram: [], jitterMs: null,
    };
    if (this.fixedBph == null && !this.lockedOnce) {
      const d = this.detectBph();
      if (d != null && d !== this.detectedBph) { this.detectedBph = d; this.resetBeats(); }
    }
    const bph = this.bph;
    if (bph == null) {
      base.state = elapsed < 2.5 ? 'listening' : 'searching';
      return (this.lastAnalysis = base);
    }
    base.bph = bph;
    const P = 3600 / bph;
    this.scanBeats(P);

    const winFrom = elapsed - this.windowSeconds;
    const cands = this.beats.filter(b => b.t >= winFrom);
    const tEnd = cands.length ? cands[cands.length - 1].t + P * 0.2 : elapsed;
    const tracked = this.track(cands, P, tEnd);
    const spanStart = cands.length ? cands[0].t : elapsed;
    const expected = Math.max(1, Math.round((tEnd - spanStart) / P));
    base.expected = expected;
    if (tracked.length < 8) {
      base.state = elapsed < 3 ? 'listening' : cands.length > expected * 1.8 ? 'noisy' : this.lockedOnce ? 'lost' : 'weak';
      return (this.lastAnalysis = base);
    }
    const bs = tracked.map(x => x.b);
    const ks = tracked.map(x => x.k);

    // audio glitches (dropped/inserted samples) shift every later beat by a constant: find these
    // steps, give each segment its own intercept, and fit one shared rate and tic/toc offset.
    const use = bs.map(() => true);
    const seg = segmentSteps(bs, ks, use);
    const nSeg = seg.length ? seg[seg.length - 1] + 1 : 1;
    if (nSeg > 12) {
      base.state = 'noisy';
      return (this.lastAnalysis = base);
    }
    const counts = new Array(nSeg).fill(0);
    seg.forEach((g, i) => { if (use[i]) counts[g]++; });
    seg.forEach((g, i) => { if (counts[g] < 6) use[i] = false; });

    let a: number[] = new Array(nSeg).fill(0), b = P, c = 0, sigma = 0;
    for (let iter = 0; iter < 6; iter++) {
      const fr = fitSegmented(bs, ks, use, seg, nSeg);
      if (!fr) break;
      ({ a, b, c } = fr);
      const res = bs.map((x, i) => x.t - (a[seg[i]] + b * ks[i] + c * (ks[i] % 2 === 0 ? 1 : -1)));
      const absUsed = res.filter((_, i) => use[i]).map(Math.abs).sort((x, y) => x - y);
      sigma = (absUsed[Math.floor(absUsed.length / 2)] || 0) * 1.4826;
      const lim = Math.max(0.0003, 4 * sigma);
      let changed = false;
      for (let i = 0; i < bs.length; i++) {
        const nu = counts[seg[i]] >= 6 && Math.abs(res[i]) <= lim;
        if (nu !== use[i]) { use[i] = nu; changed = true; }
      }
      if (!changed) break;
    }
    const nUsed = use.filter(Boolean).length;
    const quality = Math.min(1, nUsed / expected);
    base.quality = quality;
    base.beats = nUsed;
    base.jitterMs = sigma * 1000;

    const t0 = bs[0].t;
    const peakMax = Math.max(...bs.map(x => x.peak)) || 1;
    base.diagram = bs
      .map((x, i) => ({
        t: x.t,
        x: (x.t - (t0 + ks[i] * P)) * 1000,
        parity: (ks[i] % 2 === 0 ? 0 : 1) as 0 | 1,
        a: x.peak / peakMax,
      }))
      .filter((_, i) => use[i]);

    if (nUsed < 8 || quality < 0.35) {
      base.state = cands.length > expected * 1.8 ? 'noisy' : this.lockedOnce ? 'lost' : 'weak';
      return (this.lastAnalysis = base);
    }

    this.lockedOnce = true;
    base.state = quality >= 0.6 ? 'locked' : cands.length > expected * 1.8 ? 'noisy' : 'weak';
    base.rate = 86400 * (P / b - 1);
    // beat error from first-sound times: parity medians of residuals to the common rate line
    {
      const ev: number[] = [], od: number[] = [];
      for (let i = 0; i < bs.length; i++) {
        if (!use[i]) continue;
        const r = bs[i].t1 - a[seg[i]] - b * ks[i]; // per-segment intercept: glitch steps must not leak into BE
        (ks[i] % 2 === 0 ? ev : od).push(r);
      }
      const med = (v: number[]) => { const s = v.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      if (ev.length >= 4 && od.length >= 4) base.beatError = Math.abs(med(ev) - med(od)) * 1000;
    }

    if (this.liftAngle) {
      const T = 2 * b;
      const tic: number[] = [], toc: number[] = [];
      for (let i = 0; i < bs.length; i++) if (use[i] && isFinite(bs[i].pulse)) (ks[i] % 2 === 0 ? tic : toc).push(bs[i].pulse);
      const med = (v: number[]) => { const s = v.slice().sort((x, y) => x - y); return s.length >= 4 ? s[Math.floor(s.length / 2)] : NaN; };
      const amps = [med(tic), med(toc)]
        .filter(p => isFinite(p) && p > 0)
        .map(p => this.liftAngle! / (2 * Math.sin((Math.PI * p) / T)));
      if (amps.length) {
        const A = amps.reduce((x, y) => x + y, 0) / amps.length;
        if (A >= 120 && A <= 360) base.amplitude = A;
      }
    }
    return (this.lastAnalysis = base);
  }
}

/**
 * Split a beat sequence at sudden constant shifts (audio glitches). Uses parity-corrected
 * successive-interval deviations; an isolated outlier beat (spike) is dropped instead of splitting.
 * Returns a segment id per beat (non-decreasing).
 */
function segmentSteps(bs: Beat[], ks: number[], use: boolean[]): number[] {
  const n = bs.length;
  const seg = new Array<number>(n).fill(0);
  if (n < 6) return seg;
  const par = (k: number) => (k % 2 === 0 ? 1 : -1);
  const med = (v: number[]) => { const s = v.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const p2: number[] = [];
  for (let i = 2; i < n; i++) { const dk = ks[i] - ks[i - 2]; if (dk > 0 && dk % 2 === 0) p2.push((bs[i].t - bs[i - 2].t) / dk); }
  if (!p2.length) return seg;
  const Ph = med(p2);
  const cs: number[] = [];
  for (let i = 1; i < n; i++) { const dk = ks[i] - ks[i - 1]; if (dk % 2 === 1) cs.push((bs[i].t - bs[i - 1].t - Ph * dk) / (2 * par(ks[i]))); }
  const ch = cs.length ? med(cs) : 0;
  const d: number[] = [0];
  for (let i = 1; i < n; i++) {
    const dk = ks[i] - ks[i - 1];
    d.push(bs[i].t - bs[i - 1].t - Ph * dk - ch * (par(ks[i]) - par(ks[i - 1])));
  }
  const sd = 1.4826 * med(d.slice(1).map(Math.abs));
  const thr = Math.max(0.0008, 10 * sd);
  let g = 0;
  for (let i = 1; i < n; i++) {
    const big = Math.abs(d[i]) > thr;
    const nextBig = i + 1 < n && Math.abs(d[i + 1]) > thr;
    if (big && nextBig && Math.sign(d[i]) !== Math.sign(d[i + 1]) && Math.abs(d[i] + d[i + 1]) < thr) {
      use[i] = false; // spike: one displaced beat
      seg[i] = g;
      // the following interval is measured from the bad beat; neutralise it
      d[i + 1] = 0;
      continue;
    }
    if (big) g++;
    seg[i] = g;
  }
  return seg;
}

/** LS fit t = a[seg] + b·k + c·s with one intercept per segment. */
function fitSegmented(bs: Beat[], ks: number[], use: boolean[], seg: number[], nSeg: number): { a: number[]; b: number; c: number } | null {
  const m = nSeg + 2; // unknowns: a_0..a_{nSeg-1}, b, c
  const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const y = new Array<number>(m).fill(0);
  const k0 = ks[0];
  let n = 0;
  for (let i = 0; i < bs.length; i++) {
    if (!use[i]) continue;
    n++;
    const row = new Array<number>(m).fill(0);
    row[seg[i]] = 1;
    row[nSeg] = ks[i] - k0;
    row[nSeg + 1] = ks[i] % 2 === 0 ? 1 : -1;
    for (let p = 0; p < m; p++) {
      if (row[p] === 0) continue;
      y[p] += row[p] * bs[i].t;
      for (let q = 0; q < m; q++) A[p][q] += row[p] * row[q];
    }
  }
  if (n < 6) return null;
  for (let gI = 0; gI < nSeg; gI++) if (A[gI][gI] === 0) { A[gI][gI] = 1; y[gI] = 0; } // empty segment
  const x = solve(A, y);
  if (!x) return null;
  const b = x[nSeg], c = x[nSeg + 1];
  return { a: x.slice(0, nSeg).map(v => v - b * k0), b, c };
}

function solve(A: number[][], y: number[]): number[] | null {
  const n = y.length;
  const M = A.map((r, i) => [...r, y[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let q = col; q <= n; q++) M[r][q] -= f * M[col][q];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Human-readable state labels (Korean UI). */
export const STATE_LABEL: Record<LockState, string> = {
  idle: '대기',
  listening: '듣는 중',
  searching: 'BPH 찾는 중',
  locked: '고정됨',
  weak: '신호 약함',
  noisy: '잡음 과다',
  lost: '신호 놓침',
};
