import type { MicHandlers, MicPermission, MicSession } from './mic.types';

// Browser fallback (development and testing): getUserMedia with all voice processing off.
let lastPermission: MicPermission = 'undetermined';
let ctx: AudioContext | null = null;

/**
 * iOS Safari only lets an AudioContext start inside the user's tap. Call this synchronously at the
 * top of the tap handler, before any await.
 */
export function primeAudio() {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* unsupported */ }
}

export function micPermission(): MicPermission {
  return lastPermission;
}

export async function requestMic(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    lastPermission = 'granted';
    return true;
  } catch {
    lastPermission = 'denied';
    return false;
  }
}

export async function startMic(h: MicHandlers): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  lastPermission = 'granted';
  primeAudio();
  const ac = ctx as AudioContext;
  if (ac.state === 'suspended') await ac.resume().catch(() => {});
  const src = ac.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally available and adequate for 4096-sample blocks.
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const sink = ac.createGain();
  sink.gain.value = 0;
  proc.onaudioprocess = ev => {
    const ch = ev.inputBuffer.getChannelData(0);
    h.onSamples(new Float32Array(ch), ac.sampleRate);
  };
  src.connect(proc);
  proc.connect(sink);
  sink.connect(ac.destination);
  return {
    sampleRate: ac.sampleRate,
    stop() {
      proc.disconnect();
      src.disconnect();
      sink.disconnect();
      stream.getTracks().forEach(t => t.stop());
      // keep the AudioContext alive for the next measurement (Safari gesture rule)
    },
  };
}
