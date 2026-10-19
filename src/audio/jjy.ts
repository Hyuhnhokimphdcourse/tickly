// Native build: not wired yet (web first). Same API as jjy.web.ts.
export const jjySupported = false;
export interface JjySession {
  stop(): void;
  status(): { symbol: string; second: number; minuteMs: number } | null;
}
export function startJjy(_carrier: 40 | 60): JjySession {
  throw new Error('JJY 송출은 아직 웹 버전에서만 지원됩니다.');
}
