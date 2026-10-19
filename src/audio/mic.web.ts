import type { MicHandlers, MicPermission, MicSession } from './mic.types';

// Browser path (GitHub Pages build, iPhone Chrome/Safari): getUserMedia with voice processing off.
let lastPermission: MicPermission = 'undetermined';
let ctx: AudioContext | null = null;

/**
 * iOS WebKit only lets an AudioContext start inside the user's tap. Call this synchronously at the
 * top of the tap handler, before any await.
 */
export function primeAudio() {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
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
  const track = stream.getAudioTracks()[0];
  const trackRate = track?.getSettings?.().sampleRate;
  primeAudio();
  // WebKit can deliver silence when the context rate differs from the capture rate: match them.
  // While the page is capturing, WebKit allows a new context to start without another tap.
  if (ctx && trackRate && Math.abs(ctx.sampleRate - trackRate) > 1) {
    try {
      await ctx.close();
      ctx = new AudioContext({ sampleRate: trackRate });
    } catch { /* keep the primed context */ }
  }
  const ac = ctx as AudioContext;
  if (ac.state !== 'running') await ac.resume().catch(() => {});
  const onState = () => { if (ac.state !== 'running' && ac.state !== 'closed') void ac.resume().catch(() => {}); };
  ac.addEventListener('statechange', onState);

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
  track?.addEventListener('ended', () => h.onInterrupted?.());
  return {
    sampleRate: ac.sampleRate,
    info: () => `${ac.state} · ${Math.round(ac.sampleRate / 100) / 10} kHz${trackRate ? ` (mic ${Math.round(trackRate / 100) / 10})` : ''} · ${track?.label || 'mic'}`,
    stop() {
      ac.removeEventListener('statechange', onState);
      proc.disconnect();
      src.disconnect();
      sink.disconnect();
      stream.getTracks().forEach(t => t.stop());
      // keep the AudioContext alive for the next measurement (gesture rule)
    },
  };
}
