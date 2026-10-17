import { Timegrapher } from '../src/dsp/timegrapher.ts';
import { synth, type SynthOptions } from './synth.ts';

interface Case extends Partial<SynthOptions> { name: string; autoBph?: boolean; allowNoAmp?: boolean }

const base: SynthOptions = {
  fs: 48000, seconds: 30, bph: 28800, rate: 5, beatErrorMs: 0.4, amplitude: 280, liftAngle: 52, noise: 0.02,
};

const cases: Case[] = [
  { name: '28800 clean, +5 s/d', },
  { name: '28800 auto-BPH', autoBph: true },
  { name: '21600 NH35-like, +18 s/d, BE 1.2', bph: 21600, rate: 18, beatErrorMs: 1.2, amplitude: 250, liftAngle: 53, autoBph: true },
  { name: '18000 vintage, −40 s/d, low amp', bph: 18000, rate: -40, amplitude: 190, liftAngle: 50, autoBph: true },
  { name: '36000 hi-beat, +2 s/d', bph: 36000, rate: 2, amplitude: 300, liftAngle: 49, autoBph: true },
  { name: '28800 fast +300 s/d (magnetised)', rate: 300, autoBph: true },
  { name: '28800 heavy noise + hum + clicks', noise: 0.08, hum: 0.3, clicks: 3, autoBph: true, allowNoAmp: true },
  { name: '28800 moderate noise + hum + clicks', noise: 0.04, hum: 0.3, clicks: 2, autoBph: true },
  { name: '28800 drops 15%', dropProb: 0.15, autoBph: true },
  { name: '44.1 kHz input', fs: 44100, autoBph: true },
  { name: '28800 two 12 ms audio glitches', glitches: [11.3, 21.7], autoBph: true },
  { name: '28800 glitch −7 ms + drops', glitches: [15.2], stepMs: -7, dropProb: 0.1, autoBph: true },
  { name: '25200 , −8 s/d, BE 2.5', bph: 25200, rate: -8, beatErrorMs: 2.5, amplitude: 230, autoBph: true },
];

let fail = 0;
for (const c of cases) {
  const o: SynthOptions = { ...base, ...c } as SynthOptions;
  const pcm = synth(o);
  const tg = new Timegrapher({ sampleRate: o.fs, bph: c.autoBph ? null : o.bph, liftAngle: o.liftAngle, windowSeconds: 30 });
  // feed in 4096-sample chunks and analyse periodically, like the app
  let r = tg.analyze();
  for (let i = 0; i < pcm.length; i += 4096) {
    tg.push(pcm.subarray(i, Math.min(pcm.length, i + 4096)));
    if ((i / 4096) % 6 === 0) r = tg.analyze();
  }
  r = tg.analyze();
  const errRate = r.rate == null ? NaN : r.rate - o.rate;
  const errBe = r.beatError == null ? NaN : r.beatError - o.beatErrorMs;
  const errAmp = r.amplitude == null ? NaN : r.amplitude - o.amplitude;
  const ok = r.bph === o.bph && Math.abs(errRate) < 0.5 && Math.abs(errBe) < 0.15 && (Math.abs(errAmp) < 12 || (c.allowNoAmp === true && r.amplitude == null));
  if (!ok) fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(40)} bph=${r.bph} state=${r.state} ` +
    `rate=${r.rate?.toFixed(2)} (Δ${errRate.toFixed(2)})  BE=${r.beatError?.toFixed(2)} (Δ${errBe.toFixed(2)})  ` +
    `amp=${r.amplitude?.toFixed(0)} (Δ${errAmp.toFixed(0)})  q=${(r.quality * 100).toFixed(0)}% ${r.beats}/${r.expected} jit=${r.jitterMs?.toFixed(3)}ms`,
  );
}
console.log(fail ? `\n${fail} failing case(s)` : '\nall cases pass');
process.exit(fail ? 1 : 0);
