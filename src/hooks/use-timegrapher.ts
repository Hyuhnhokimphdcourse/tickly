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

const KEEP_AWAKE_TAG = 'timegrapher';

function haptic(kind: 'lock' | 'done') {
  if (Platform.OS === 'web') return;
  if (kind === 'lock') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function useTimegrapher() {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [result, setResult] = useState<TimegrapherResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockElapsed, setLockElapsed] = useState(0);
  const tgRef = useRef<Timegrapher | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockAtRef = useRef<number | null>(null);

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
    primeAudio(); // must run synchronously inside the tap (iOS Safari)
    setError(null);
    setResult(null);
    setLockElapsed(0);
    lockAtRef.current = null;
    tgRef.current = null;
    if (micPermission() !== 'granted') {
      const ok = await requestMic();
      if (!ok) {
        setError('마이크 권한이 없습니다. 설정 앱 > 개인정보 보호 > 마이크에서 허용해 주세요.');
        return;
      }
    }
    try {
      micRef.current = await startMic({
        onSamples: (pcm, sr) => {
          if (!tgRef.current) {
            tgRef.current = new Timegrapher({ sampleRate: sr, bph: p.bph, liftAngle: p.liftAngle, windowSeconds: p.seconds });
          }
          tgRef.current.push(pcm);
        },
        onInterrupted: () => stop(),
      });
    } catch (e) {
      setError(`마이크를 시작하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    setPhase('running');
    timerRef.current = setInterval(() => {
      const tg = tgRef.current;
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

  const reset = useCallback(() => {
    teardown();
    tgRef.current = null;
    setResult(null);
    setPhase('idle');
    setError(null);
  }, [teardown]);

  return { phase, result, error, lockElapsed, start, stop, reset };
}
