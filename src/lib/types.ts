export type Movement = 'auto' | 'manual' | 'quartz';
export type Position = 'DU' | 'DD' | 'CU' | 'CD' | 'CL' | 'CR';
export type SpecSource = 'ai' | 'verified' | 'user' | '';

export interface Source {
  title: string;
  url: string;
}

export interface Watch {
  id: string;
  brand: string;
  model: string;
  ref: string;
  caliber: string;
  movement: Movement;
  /** beats per hour; null = auto-detect */
  bph: number | null;
  /** lift angle in degrees; null = amplitude not computed */
  liftAngle: number | null;
  photo: string | null; // file uri in the app's document directory
  acquired: string; // YYYY-MM-DD
  lastService: string; // YYYY-MM-DD
  notes: string;
  favorite: boolean;
  archived: boolean;
  createdAt: number;
  order: number;
  spec: {
    accMin: number | null; // s/d
    accMax: number | null;
    powerReserveH: number | null;
    jewels: number | null;
    serviceYears: number | null;
    src: SpecSource;
    sources: Source[];
  };
  /** measured power reserve, hours */
  prMeasured: number | null;
  /** last local edit, epoch ms (sync merge) */
  updatedAt?: number;
}

export interface Reading {
  id: string;
  watchId: string;
  at: number;
  position: Position | null;
  rate: number;
  beatError: number | null;
  amplitude: number | null;
  bph: number;
  liftAngle: number | null;
  quality: number;
  beats: number;
  seconds: number;
}

export interface PrecisionEntry {
  /** reference time of the tap, epoch ms */
  t: number;
  /** watch − reference, seconds */
  off: number;
}

export interface Cycle {
  id: string;
  watchId: string;
  startedAt: number;
  endedAt: number | null;
  note: string;
  entries: PrecisionEntry[];
  /** last local edit, epoch ms (sync merge) */
  updatedAt?: number;
}

export interface Settings {
  apiKeySet: boolean;
  aiModel: string;
  defaultLiftAngle: number;
  standardSeconds: number;
  longSeconds: number;
}

export interface AppData {
  version: 1;
  watches: Watch[];
  readings: Reading[];
  cycles: Cycle[];
  /** YYYY-MM-DD → watch ids worn that day */
  wear: Record<string, string[]>;
  /** YYYY-MM-DD → last edit time of that day's wear list (sync merge) */
  wearAt?: Record<string, number>;
  /** deleted ids → deletion time, so a merge never resurrects them (sync).
   *  Keys: watch/reading/cycle id, or `${cycleId}:${entryT}` for a deleted log entry. */
  tombstones?: Record<string, number>;
  settings: Settings;
}

export const POSITIONS: { key: Position; label: string; short: string; horizontal: boolean }[] = [
  { key: 'DU', label: '다이얼 위', short: 'DU', horizontal: true },
  { key: 'DD', label: '다이얼 아래', short: 'DD', horizontal: true },
  { key: 'CU', label: '크라운 위', short: 'CU', horizontal: false },
  { key: 'CD', label: '크라운 아래', short: 'CD', horizontal: false },
  { key: 'CL', label: '크라운 왼쪽', short: 'CL', horizontal: false },
  { key: 'CR', label: '크라운 오른쪽', short: 'CR', horizontal: false },
];

export const MOVEMENT_LABEL: Record<Movement, string> = { auto: '자동', manual: '수동', quartz: '쿼츠' };

export function emptyWatch(): Watch {
  return {
    id: '', brand: '', model: '', ref: '', caliber: '', movement: 'auto', bph: null, liftAngle: null, photo: null,
    acquired: '', lastService: '', notes: '', favorite: false, archived: false, createdAt: 0, order: 0,
    spec: { accMin: null, accMax: null, powerReserveH: null, jewels: null, serviceYears: null, src: '', sources: [] },
    prMeasured: null,
  };
}
