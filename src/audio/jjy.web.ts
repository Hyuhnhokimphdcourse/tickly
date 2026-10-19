import { JJY_HIGH_SECONDS, JJY_TONE, jjyFrame } from '@/lib/jjy';

export const jjySupported = typeof window !== 'undefined' && typeof AudioContext !== 'undefined';

export interface JjySession {
  stop(): void;
  /** current symbol being sent and the frame's JST time, for the UI */
  status(): { symbol: string; second: number; minuteMs: number } | null;
}

/**
 * Play a JJY timecode as an audio tone (3rd harmonic on the carrier) through earphones/speaker.
 * Must be called synchronously inside a tap (iOS WebKit).
 */
export function startJjy(carrier: 40 | 60): JjySession {
  // iOS WebKit plays Web Audio in the "ambient" session, which the ring/silent switch mutes; it only
  // became audible once the microphone (play-and-record session) was running. Ask for a playback
  // session where the Audio Session API exists, otherwise route through an <audio> element, which
  // iOS plays even in silent mode.
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  const hasSession = !!nav.audioSession;
  if (hasSession) { try { nav.audioSession!.type = 'playback'; } catch { /* read-only */ } }
  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = JJY_TONE[carrier];
  const amp = ctx.createGain();
  amp.gain.value = 0;
  osc.connect(amp);
  let el: HTMLAudioElement | null = null;
  if (hasSession) amp.connect(ctx.destination);
  else {
    const dest = ctx.createMediaStreamDestination();
    amp.connect(dest);
    el = new Audio();
    el.srcObject = dest.stream;
    void el.play().catch(() => amp.connect(ctx.destination));
  }
  osc.start();

  /** audio-clock time at which wall-clock `ms` is heard */
  const ctxAt = (ms: number) => {
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime != null && ts.performanceTime != null && ts.performanceTime > 0) {
      const wallNow = performance.timeOrigin + ts.performanceTime;
      return ts.contextTime + (ms - wallNow) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) + (ms - Date.now()) / 1000;
  };

  let scheduledTo = 0; // wall-clock second (ms) up to which symbols are scheduled
  let current: { symbol: string; second: number; minuteMs: number } | null = null;
  const tick = () => {
    const now = Date.now();
    const sNow = Math.floor(now / 1000) * 1000;
    current = { symbol: String(jjyFrame(sNow)[new Date(sNow).getUTCSeconds()]), second: new Date(sNow).getUTCSeconds(), minuteMs: sNow - (sNow % 60000) };
    if (scheduledTo < sNow + 1000) scheduledTo = sNow + 1000;
    while (scheduledTo <= now + 4000) {
      const s = scheduledTo;
      const sec = new Date(s).getUTCSeconds();
      const sym = jjyFrame(s)[sec];
      const t0 = ctxAt(s);
      if (t0 > ctx.currentTime + 0.01) {
        amp.gain.setValueAtTime(1, t0);
        amp.gain.setValueAtTime(0.1, t0 + JJY_HIGH_SECONDS[String(sym)]);
      }
      scheduledTo += 1000;
    }
  };
  tick();
  const timer = setInterval(tick, 500);
  return {
    stop() {
      clearInterval(timer);
      try { osc.stop(); } catch { /* already stopped */ }
      if (el) { el.pause(); el.srcObject = null; }
      void ctx.close().catch(() => {});
      if (hasSession) { try { nav.audioSession!.type = 'auto'; } catch { /* ignore */ } }
    },
    status: () => current,
  };
}
