export type AudioEventPayload = {
  /** base64-encoded little-endian Float32 mono PCM */
  data: string;
  frames: number;
  sampleRate: number;
};

export type InterruptionPayload = { type: 'began' | 'ended' };

export type TickMicModuleEvents = {
  onAudio: (params: AudioEventPayload) => void;
  onInterruption: (params: InterruptionPayload) => void;
};

export type StartOptions = {
  preferredSampleRate?: number;
  bufferSize?: number;
  useBottomMic?: boolean;
};
