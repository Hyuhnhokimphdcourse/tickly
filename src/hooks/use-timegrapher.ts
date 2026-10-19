import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { micPermission, primeAudio, requestMic, startMic } from '@/audio/mic';
import type { MicSession } from '@/audio/mic.types';
import { Timegrapher, type TimegrapherResult } from '@/dsp/timegrapher';

export type RunPhase = 'idle' | 'running' | 'done';

export interface StartParams {
  bph: number | null;
  liftAngle: number | null;
  /** measurement length after the signal first locks */
  seconds: number;
}

/** Live input diagnostics, so a user (and we) can see whether ticks reach the analyser at all. */
export interface InputDiag {
  /** peak level over the last ~0.5 s, dBFS */
  peakDb: number | null;
  /** RMS level over the last ~0.5 s, dBFS */
  rmsDb: number | null;
  /** seconds of audio received */
  seconds: number;
  /** wall-clock seconds since the microphone was started */
  wall: number;
  sampleRate: number | null;
  info: string;
  /** normalised tick envelope of the last second */
  scope: number[];
}

const KEEP_AWAKE_TAG = 'timegrapher';
const RAW_SECONDS = 20;

function haptic(kind: 'lock' | 'done') {
  if (Platform.OS === 'web') return;
  if (kind === 'lock') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

const db = (v: number) => (v > 0 ? 20 * Math.log10(v) : -120);

/** Ring buffer of the most recent raw samples, for the diagnostic recording. */
class Ring {
  buf: Float32Array;
  pos = 0;
  filled = 0;
  constructor(readonly sampleRate: number, seconds: number) {
    this.buf = new Float32Array(Math.round(sampleRate * seconds));
  }
  push(x: Float32Array) {
    for (let i = 0; i < x.length; i++) {
      this.buf[this.pos] = x[i];
      this.pos = (this.pos + 1) % this.buf.length;
    }
    this.filled = Math.min(this.buf.length, this.filled + x.length);
  }
  last(n: number): Float32Array {
    n = Math.min(n, this.filled);
    const out = new Float32Array(n);
    let p = (this.pos - n + this.buf.length) % this.buf.length;
    for (let i = 0; i < n; i++) { out[i] = this.buf[p]; p = (p + 1) % this.buf.length; }
    return out;
  }
}

/** 32-bit float WAV: quiet inputs (ticks of a few 16-bit LSB) survive without quantisation. */
export function pcmToWav(pcm: Float32Array, sampleRate: number): Uint8Array {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 1, true); // format 3 = IEEE float
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 32, true);
  w(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) v.setFloat32(44 + i * 4, pcm[i], true);
  return new Uint8Array(buf);
}

export function useTimegrapher() {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [result, setResult] = useState<TimegrapherResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockElapsed, setLockElapsed] = useState(0);
  const [diag, setDiag] = useState<InputDiag | null>(null);
  const tgRef = useRef<Timegrapher | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const ringRef = useRef<Ring | null>(null);
  const levelRef = useRef({ peak: 0, sumSq: 0, n: 0, total: 0, sr: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockAtRef = useRef<number | null>(null);
  const startedRef = useRef(0);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    const tg = tgRef.current;
    if (tg) setResult(tg.analyze());
    teardown();
    setPhase(p => (p === 'running' ? 'done' : p));
  }, [teardown]);

  const start = useCallback(async (p: StartParams) => {
    primeAudio(); // must run synchronously inside the tap (iOS WebKit)
    setError(null);
    setResult(null);
    setDiag(null);
    setLockElapsed(0);
    lockAtRef.current = null;
    tgRef.current = null;
    ringRef.current = null;
    levelRef.current = { peak: 0, sumSq: 0, n: 0, total: 0, sr: 0 };
    if (micPermission() !== 'granted') {
      const ok = await requestMic();
      if (!ok) {
        setError('마이크 권한이 없습니다. 설정 앱에서 이 브라우저(또는 앱)의 마이크 접근을 허용해 주세요.');
        return;
      }
    }
    try {
      micRef.current = await startMic({
        onSamples: (pcm, sr) => {
          if (!tgRef.current) {
            tgRef.current = new Timegrapher({ sampleRate: sr, bph: p.bph, liftAngle: p.liftAngle, windowSeconds: p.seconds });
            ringRef.current = new Ring(sr, RAW_SECONDS);
          }
          tgRef.current.push(pcm);
          ringRef.current?.push(pcm);
          const L = levelRef.current;
          L.sr = sr;
          L.total += pcm.length;
          for (let i = 0; i < pcm.length; i++) {
            const a = Math.abs(pcm[i]);
            if (a > L.peak) L.peak = a;
            L.sumSq += pcm[i] * pcm[i];
          }
          L.n += pcm.length;
        },
        onInterrupted: () => stop(),
      });
    } catch (e) {
      setError(`마이크를 시작하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    startedRef.current = Date.now();
    setPhase('running');
    timerRef.current = setInterval(() => {
      const L = levelRef.current;
      const tg = tgRef.current;
      setDiag({
        peakDb: L.n ? db(L.peak) : null,
        rmsDb: L.n ? db(Math.sqrt(L.sumSq / L.n)) : null,
        seconds: L.sr ? L.total / L.sr : 0,
        wall: (Date.now() - startedRef.current) / 1000,
        sampleRate: L.sr || null,
        info: micRef.current?.info?.() ?? '',
        scope: tg ? tg.envTail(1, 240) : [],
      });
      L.peak = 0; L.sumSq = 0; L.n = 0;
      if (!tg) return;
      const r = tg.analyze();
      setResult(r);
      if (r.state === 'locked' && lockAtRef.current == null) {
        lockAtRef.current = r.elapsed;
        haptic('lock');
      }
      if (lockAtRef.current != null) {
        const done = r.elapsed - lockAtRef.current;
        setLockElapsed(done);
        if (done >= p.seconds && r.rate != null) {
          haptic('done');
          teardown();
          setPhase('done');
        }
      }
    }, 400);
  }, [stop, teardown]);

  /** WAV of the most recent raw input (diagnostic recording), or null if nothing was captured. */
  const recording = useCallback((seconds = 15): { wav: Uint8Array; sampleRate: number } | null => {
    const ring = ringRef.current;
    if (!ring || ring.filled < ring.sampleRate) return null;
    return { wav: pcmToWav(ring.last(Math.round(seconds * ring.sampleRate)), ring.sampleRate), sampleRate: ring.sampleRate };
  }, []);

  /** Analyse a recorded file (mono PCM) offline with the same engine. */
  const analyzePcm = useCallback((pcm: Float32Array, sampleRate: number, p: Omit<StartParams, 'seconds'>) => {
    teardown();
    const tg = new Timegrapher({ sampleRate, bph: p.bph, liftAngle: p.liftAngle, windowSeconds: pcm.length / sampleRate });
    const ring = new Ring(sampleRate, Math.min(RAW_SECONDS, pcm.length / sampleRate + 1));
    let r = tg.analyze();
    for (let i = 0; i < pcm.length; i += 4096) {
      const chunk = pcm.subarray(i, Math.min(pcm.length, i + 4096));
      tg.push(chunk);
      ring.push(chunk);
      if ((i / 4096) % 6 === 0) r = tg.analyze();
    }
    r = tg.analyze();
    tgRef.current = tg;
    ringRef.current = ring;
    let peak = 0, ss = 0;
    for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; ss += pcm[i] * pcm[i]; }
    setDiag({ peakDb: db(peak), rmsDb: db(Math.sqrt(ss / Math.max(1, pcm.length))), seconds: pcm.length / sampleRate, wall: pcm.length / sampleRate, sampleRate, info: '녹음 파일', scope: tg.envTail(1, 240) });
    setResult(r);
    setError(r.rate == null ? '이 녹음에서는 비트를 고정하지 못했습니다. 진단 녹음을 보내 주시면 원인을 확인하겠습니다.' : null);
    setPhase('done');
  }, [teardown]);

  const reset = useCallback(() => {
    teardown();
    tgRef.current = null;
    setResult(null);
    setDiag(null);
    setPhase('idle');
    setError(null);
  }, [teardown]);

  return { phase, result, error, lockElapsed, diag, start, stop, reset, recording, analyzePcm };
}
