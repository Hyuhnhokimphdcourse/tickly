/** Native: diagnostic recording export and file measurement are web-only for now. */
export const audioFilesSupported = false;

export async function shareWav(_wav: Uint8Array, _name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  return 'cancelled';
}

export async function pickAudio(): Promise<{ pcm: Float32Array; sampleRate: number; name: string } | null> {
  return null;
}
