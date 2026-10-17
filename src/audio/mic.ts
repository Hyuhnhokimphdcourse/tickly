import TickMic from '../../modules/tick-mic/src/TickMicModule';
import { base64ToArrayBuffer } from './base64';
import type { MicHandlers, MicPermission, MicSession } from './mic.types';

/** No-op on iOS native; see mic.web.ts. */
export function primeAudio() {}

export function micPermission(): MicPermission {
  return TickMic.getPermissionStatus();
}

export async function requestMic(): Promise<boolean> {
  return TickMic.requestPermission();
}

export async function startMic(h: MicHandlers): Promise<MicSession> {
  const audioSub = TickMic.addListener('onAudio', e => {
    const buf = base64ToArrayBuffer(e.data);
    h.onSamples(new Float32Array(buf, 0, Math.floor(buf.byteLength / 4)), e.sampleRate);
  });
  const intSub = TickMic.addListener('onInterruption', e => {
    if (e.type === 'began') h.onInterrupted?.();
  });
  try {
    const sampleRate = await TickMic.start({ preferredSampleRate: 48000, bufferSize: 4096, useBottomMic: true });
    return {
      sampleRate,
      stop() {
        TickMic.stop();
        audioSub.remove();
        intSub.remove();
      },
    };
  } catch (err) {
    audioSub.remove();
    intSub.remove();
    throw err;
  }
}
