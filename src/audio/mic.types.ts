export type MicPermission = 'granted' | 'denied' | 'undetermined';

export interface MicSession {
  sampleRate: number;
  /** short human-readable input description for diagnostics */
  info?: () => string;
  stop(): void;
}

export interface MicHandlers {
  onSamples: (pcm: Float32Array, sampleRate: number) => void;
  onInterrupted?: () => void;
}
