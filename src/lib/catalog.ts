/**
 * Built-in watch / caliber specs (no API key needed). Every value carries its source.
 * Accuracy is stored in s/d; quartz specs given per month are converted (÷ 30.4) and the
 * original wording is kept in `accLabel`.
 */
import type { Movement, Source } from './types';

export interface CatalogEntry {
  key: string;
  /** strings that identify this entry when typed in model / ref / caliber (case-insensitive) */
  match: string[];
  brand: string;
  model: string;
  ref?: string;
  caliber: string;
  movement: Movement;
  bph: number | null;
  liftAngle: number | null;
  accMin: number | null;
  accMax: number | null;
  accLabel: string;
  powerReserveH: number | null;
  powerReserveLabel: string;
  jewels: number | null;
  serviceYears: number | null;
  note?: string;
  sources: Source[];
}

const MONTH = 30.4;

export const CATALOG: CatalogEntry[] = [
  {
    key: 'citizen-ny0040',
    match: ['ny0040', 'fugu', '8203'],
    brand: 'Citizen',
    model: 'Promaster Diver',
    ref: 'NY0040-09W',
    caliber: '8203',
    movement: 'auto',
    bph: 21600,
    liftAngle: 49,
    accMin: -20,
    accMax: 40,
    accLabel: '−20/+40 초/일 (Citizen Cal.82** 공식)',
    powerReserveH: 40,
    powerReserveLabel: '40시간 이상 (Citizen 매뉴얼)',
    jewels: 21,
    serviceYears: null,
    note: '8203은 초침 정지(해킹) 기능이 없는 개체가 있어, 시간을 맞출 때 초 단위로 정확히 맞추기 어렵습니다. 정밀 로그는 탭 방식이라 영향이 없습니다.',
    sources: [
      { title: 'Citizen 공식 매뉴얼 — Cal.82**/83** 사양 (정확도 −20~+40초/일, 21,600진동, 파워리저브 40시간 이상)', url: 'https://citizen.jp/support/manual/pmm05.pdf' },
      { title: 'Caliber Corner — Miyota/Citizen 8203 (보석 21, 리프트각 49°)', url: 'https://calibercorner.com/miyota-caliber-8203' },
      { title: 'uhrenschmuck24 — NY0040 칼리버 8203 표기', url: 'https://www.uhrenschmuck24.ch/en/citizen-promaster-marine-diver-automatic-ny0040-09ee.html' },
    ],
  },
  {
    key: 'citizen-bn0266',
    match: ['bn0266', 'e118', 'e1118'],
    brand: 'Citizen',
    model: 'Promaster Dive Eco-Drive',
    ref: 'BN0266-07E',
    caliber: 'E118 (Eco-Drive)',
    movement: 'quartz',
    bph: null,
    liftAngle: null,
    accMin: -15 / MONTH,
    accMax: 15 / MONTH,
    accLabel: '±15 초/월 (≈ ±0.5 초/일)',
    powerReserveH: 365 * 24,
    powerReserveLabel: '완충 시 약 365일',
    jewels: null,
    serviceYears: null,
    note: '초침이 2초씩 건너뛰면 충전이 부족하다는 신호입니다. 빛에 두어 충전하세요.',
    sources: [
      { title: 'Citizen 공식 — BN0266-07E 사양 (Cal. E118, ±15초/월, 파워리저브 365일)', url: 'https://citizenwatch.eu/en/p/bn0266-07e/' },
      { title: 'Citizen 지원 — 초침이 건너뛰면 충전 필요', url: 'https://support.citizenwatch.com/hc/en-us/articles/360007591314-The-second-hand-on-my-eco-drive-watch-jumps-instead-of-ticking-every-second' },
    ],
  },
  {
    key: 'orient-bambino38-solar',
    match: ['bambino', 'vs213', 'ra-wk', 'rawk', 'rn-wk', 'rnwk'],
    brand: 'Orient',
    model: 'Bambino 38 Solar',
    caliber: 'VS213 (솔라 쿼츠)',
    movement: 'quartz',
    bph: null,
    liftAngle: null,
    accMin: -20 / MONTH,
    accMax: 20 / MONTH,
    accLabel: '±20 초/월 (≈ ±0.66 초/일)',
    powerReserveH: 6 * 30 * 24,
    powerReserveLabel: '완충 시 약 6개월',
    jewels: null,
    serviceYears: null,
    sources: [
      { title: 'Orient USA — Bambino Solar Quartz (Cal. VS213, 완충 6개월)', url: 'https://orientwatchusa.com/products/ra-wk0005p10b' },
      { title: 'Watch Impress — 오리엔트 밤비노 솔라 (평균 월차 ±20초)', url: 'https://www.watch.impress.co.jp/docs/news/1665598.html' },
    ],
  },
];

/** Best catalog match for what the user typed (model, reference or caliber). */
export function findCatalog(...texts: string[]): CatalogEntry | null {
  const hay = texts.join(' ').toLowerCase().replace(/\s+/g, '');
  if (hay.length < 3) return null;
  return CATALOG.find(e => e.match.some(m => hay.includes(m.replace(/\s+/g, '')))) ?? null;
}
