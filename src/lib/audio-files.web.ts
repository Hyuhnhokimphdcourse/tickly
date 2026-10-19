/** Web helpers for the diagnostic recording and for measuring from an audio file. */
export const audioFilesSupported = true;

/** Share (iOS share sheet) or download a WAV file. Must be called from a tap. */
export async function shareWav(wav: Uint8Array, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([wav as BlobPart], { type: 'audio/wav' });
  const file = new File([blob], name, { type: 'audio/wav' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Let the user pick an audio file (Voice Memos m4a, wav, …) and decode it to mono PCM. */
export function pickAudio(): Promise<{ pcm: Float32Array; sampleRate: number; name: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.m4a,.wav,.mp3,.aac,.caf';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) { resolve(null); return; }
      try {
        const buf = await f.arrayBuffer();
        const AC = window.AudioContext;
        const ac = new AC();
        const audio = await ac.decodeAudioData(buf);
        void ac.close();
        const ch0 = audio.getChannelData(0);
        resolve({ pcm: new Float32Array(ch0), sampleRate: audio.sampleRate, name: f.name });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
