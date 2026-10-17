/**
 * Synthetic mechanical-watch tick generator for testing the timegrapher.
 * Each beat = 3 short decaying bursts (unlock, impulse, lock). The time from the 1st to the
 * 3rd sound is the pulse τ derived from the target amplitude: τ = (T/π)·asin(LA / (2A)).
 */
export interface SynthOptions {
  fs: number;
  seconds: number;
  bph: number;
  rate: number; // s/d (+ = fast)
  beatErrorMs: number;
  amplitude: number; // degrees
  liftAngle: number;
  noise: number; // white-noise RMS relative to tick peak 1.0
  hum?: number; // 60 Hz hum amplitude
  jitterMs?: number;
  dropProb?: number; // probability a beat is missing
  clicks?: number; // random spurious clicks per second
  seed?: number;
  /** times (s) at which every later beat is delayed by stepMs (audio glitch) */
  glitches?: number[];
  stepMs?: number;
}

export function synth(o: SynthOptions): Float32Array {
  let s = o.seed ?? 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = Math.round(o.fs * o.seconds);
  const out = new Float32Array(n);
  const Pn = 3600 / o.bph;
  const P = Pn / (1 + o.rate / 86400);
  const T = 2 * P;
  const tau = (T / Math.PI) * Math.asin(o.liftAngle / (2 * o.amplitude));
  const be = o.beatErrorMs / 1000; // tic-to-toc = P - be... per tg: be = T/2 - tic_to_toc
  const burst = (t0: number, amp: number, f: number) => {
    const i0 = Math.floor(t0 * o.fs);
    const len = Math.round(0.0015 * o.fs);
    for (let i = 0; i < len && i0 + i < n; i++) {
      if (i0 + i < 0) continue;
      const tt = i / o.fs;
      out[i0 + i] += amp * Math.exp(-tt / 0.00025) * Math.sin(2 * Math.PI * f * tt + rnd());
    }
  };
  for (let k = 0; ; k++) {
    // even beats at 2jP, odd beats shifted so that tic_to_toc = P - be
    const base = 0.05 + k * P;
    const step = (o.glitches ?? []).filter(g => g < base).length * (o.stepMs ?? 12) / 1000;
    const tk = base + step + (k % 2 === 1 ? -be : 0) + (o.jitterMs ?? 0.02) / 1000 * gauss();
    if (tk > o.seconds) break;
    if (o.dropProb && rnd() < o.dropProb) continue;
    const g = 0.8 + 0.2 * rnd();
    burst(tk, 0.35 * g, 5200);
    burst(tk + tau * 0.4, 0.55 * g, 4300);
    burst(tk + tau, 1.0 * g, 3600);
  }
  for (let i = 0; i < n; i++) {
    out[i] += o.noise * gauss() + (o.hum ?? 0) * Math.sin(2 * Math.PI * 60 * i / o.fs);
  }
  if (o.clicks) {
    const m = Math.round(o.clicks * o.seconds);
    for (let j = 0; j < m; j++) burst(rnd() * o.seconds, 0.6 + 0.6 * rnd(), 3000 + 3000 * rnd());
  }
  return out;
}
