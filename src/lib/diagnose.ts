/**
 * Service / regulation diagnosis from measured data.
 * Thresholds and their sources:
 *  - Amplitude (full wind, dial up): ~250–300° healthy, < ~200° service needed, > ~315° knocking risk;
 *    vertical positions typically 20–40° lower. Beat error: < 0.5 ms well adjusted, ≤ 1 ms harmless,
 *    > 1 ms adjustment worthwhile.  — watchscanning.com/guides/how-to-read-a-timegrapher/
 *  - Sudden gain of minutes per day → magnetism until proven otherwise; demagnetise before servicing.
 *    Erratic day-to-day rate and a short power reserve are service symptoms.
 *    — watchscanning.com/guides/magnetized-watch-fix/
 *  - App rules (not from a source, stated as such in the UI): power reserve < 80 % of spec,
 *    day-to-day variation wider than the spec range.
 */
import { fitPrecision } from './precision';
import type { Cycle, Reading, Watch } from './types';
import { POSITIONS } from './types';
import { fmtRate, YEAR_MS } from './util';

export type Level = 'good' | 'warn' | 'bad' | 'none';

export interface Finding {
  level: Level;
  title: string;
  detail?: string;
  ref?: { title: string; url: string };
}

export interface Diagnosis {
  level: Level;
  verdict: string;
  summary: string;
  findings: Finding[];
}

const REF_TG = { title: 'Watchscanning — 타임그래퍼 판독', url: 'https://www.watchscanning.com/guides/how-to-read-a-timegrapher/' };
const REF_MAG = { title: 'Watchscanning — 자기화 진단', url: 'https://www.watchscanning.com/guides/magnetized-watch-fix/' };

const HORIZONTAL = new Set(POSITIONS.filter(p => p.horizontal).map(p => p.key));

export function latestByPosition(readings: Reading[]): Map<string, Reading> {
  const m = new Map<string, Reading>();
  for (const r of readings.slice().sort((a, b) => a.at - b.at)) m.set(r.position ?? '-', r);
  return m;
}

export function positionalSpread(readings: Reading[], sinceMs = 0): { spread: number; n: number } | null {
  const m = latestByPosition(readings.filter(r => r.position && r.at >= sinceMs));
  const rates = [...m.values()].map(r => r.rate);
  if (rates.length < 2) return null;
  return { spread: Math.max(...rates) - Math.min(...rates), n: rates.length };
}

export function diagnose(w: Watch, readingsAll: Reading[], cyclesAll: Cycle[], now = Date.now()): Diagnosis {
  const F: Finding[] = [];
  if (w.movement === 'quartz') {
    return { level: 'none', verdict: '쿼츠', summary: '쿼츠 시계는 타임그래퍼·정밀 로그 진단에서 제외됩니다.', findings: [] };
  }
  const readings = readingsAll.filter(r => r.watchId === w.id).sort((a, b) => a.at - b.at);
  const recent = readings.filter(r => now - r.at < 90 * 86400e3);
  const cycles = cyclesAll.filter(c => c.watchId === w.id).sort((a, b) => a.startedAt - b.startedAt);
  const open = cycles.filter(c => c.endedAt == null).pop() ?? cycles[cycles.length - 1];
  const fit = open ? fitPrecision(open.entries) : null;
  const prevCycle = open ? cycles[cycles.indexOf(open) - 1] : undefined;
  const prevFit = prevCycle ? fitPrecision(prevCycle.entries) : null;

  const range = w.spec.accMin != null && w.spec.accMax != null ? [w.spec.accMin, w.spec.accMax] as const : null;
  let magnet = false, signs = 0, ampLow = false, overdue = false, outSpec = false, beHigh = false;

  // 1) rate: precision log (worn) first, else latest timegrapher
  const lastTg = recent[recent.length - 1];
  const rate = fit && fit.spanDays >= 1 ? fit.rate : lastTg?.rate ?? null;
  const rateSrc = fit && fit.spanDays >= 1 ? `정밀 로그 ${fit.spanDays.toFixed(1)}일` : lastTg ? '타임그래퍼' : '';
  if (rate == null) {
    F.push({ level: 'none', title: '일오차 데이터 없음', detail: '타임그래퍼로 측정하거나 정밀 로그를 시작하세요.' });
  } else {
    if (rate >= 120) {
      magnet = true;
      F.push({ level: 'bad', title: `자기화 의심 (${fmtRate(rate)} s/d)`, detail: '하루 수 분 단위로 빨라지면 자기화를 먼저 의심합니다. 나침반을 1–2 cm 거리에 대 바늘이 움직이면 자기화입니다. 탈자 후 다시 측정하세요.', ref: REF_MAG });
    } else if (prevFit && fit && fit.rate - prevFit.rate > 60) {
      magnet = true;
      F.push({ level: 'warn', title: `직전 구간 대비 급변 (${fmtRate(prevFit.rate)} → ${fmtRate(fit.rate)} s/d)`, detail: '갑작스러운 가속은 자기화 가능성이 높습니다. 충격 이력이 있으면 착용을 멈추고 점검받으세요.', ref: REF_MAG });
    }
    if (!magnet) {
      if (range) {
        if (rate < range[0] || rate > range[1]) {
          outSpec = true;
          F.push({ level: 'warn', title: `사양 밖 ${fmtRate(rate)} s/d (사양 ${fmtRate(range[0], 0)}/${fmtRate(range[1], 0)})`, detail: `${rateSrc} 기준. 진폭·파워리저브가 정상이면 오버홀이 아니라 조정(레귤레이션) 대상입니다.` });
        } else {
          F.push({ level: 'good', title: `사양 이내 ${fmtRate(rate)} s/d (사양 ${fmtRate(range[0], 0)}/${fmtRate(range[1], 0)})`, detail: `${rateSrc} 기준.` });
        }
      } else {
        F.push({ level: 'none', title: `일오차 ${fmtRate(rate)} s/d`, detail: `${rateSrc} 기준. 무브먼트 사양을 입력하면 비교합니다.` });
      }
    }
  }

  // 2) amplitude — horizontal positions preferred
  const ampR = recent.filter(r => r.amplitude != null);
  const hor = ampR.filter(r => r.position == null || HORIZONTAL.has(r.position));
  const ampSet = (hor.length ? hor : ampR).slice(-3);
  if (ampSet.length) {
    const amp = ampSet.reduce((s, r) => s + (r.amplitude as number), 0) / ampSet.length;
    const vertOnly = !hor.length;
    const lo = vertOnly ? 170 : 200, okLo = vertOnly ? 220 : 250;
    const label = `${Math.round(amp)}°${vertOnly ? ' (세운 자세)' : ''}`;
    if (amp < lo) { ampLow = true; signs++; F.push({ level: 'bad', title: `진폭 낮음 ${label}`, detail: '다이얼 위·완전히 감은 상태 기준 약 200° 미만이면 오일 열화, 오염, 메인스프링 피로로 서비스가 필요한 수준입니다. 세운 자세는 20–40° 낮은 것이 정상입니다.', ref: REF_TG }); }
    else if (amp < okLo) F.push({ level: 'warn', title: `진폭 경계 ${label}`, detail: '건강한 범위는 다이얼 위 약 250–300°입니다. 태엽을 완전히 감고 다시 확인하세요.', ref: REF_TG });
    else if (amp > 315) F.push({ level: 'warn', title: `진폭 과다 ${label}`, detail: '약 315° 초과는 밸런스 과회전(노킹) 위험 구간입니다. 리프트각 설정도 확인하세요.', ref: REF_TG });
    else F.push({ level: 'good', title: `진폭 정상 ${label}`, detail: '다이얼 위 기준 건강 범위 약 250–300°.', ref: REF_TG });
  } else {
    F.push({ level: 'none', title: '진폭 없음', detail: w.liftAngle ? '타임그래퍼로 측정하면 반영됩니다.' : '리프트각을 입력해야 진폭을 계산할 수 있습니다.' });
  }

  // 3) beat error
  const beR = recent.filter(r => r.beatError != null).slice(-3);
  if (beR.length) {
    const be = beR.reduce((s, r) => s + (r.beatError as number), 0) / beR.length;
    if (be > 1) { beHigh = true; F.push({ level: 'warn', title: `비트에러 ${be.toFixed(1)} ms`, detail: '1 ms를 넘으면 조정할 가치가 있습니다(에너지 손실, 자가 시동 저하).', ref: REF_TG }); }
    else F.push({ level: 'good', title: `비트에러 ${be.toFixed(1)} ms`, detail: be < 0.5 ? '잘 맞춰진 상태입니다.' : '1 ms 이하는 흔하고 무해합니다.', ref: REF_TG });
  }

  // 4) day-to-day variation in the precision log
  if (open && open.entries.length >= 3 && range) {
    const pts = open.entries.slice().sort((a, b) => a.t - b.t);
    const rs: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const dd = (pts[i].t - pts[i - 1].t) / 86400e3;
      if (dd >= 0.5) rs.push((pts[i].off - pts[i - 1].off) / dd);
    }
    if (rs.length >= 2) {
      const spread = Math.max(...rs) - Math.min(...rs);
      const lim = range[1] - range[0];
      if (spread > lim) { signs++; F.push({ level: 'warn', title: `일간 변동 큼 (${spread.toFixed(1)} s/d)`, detail: `날마다 일오차가 크게 달라지는 것은 서비스 필요 증상입니다. 표시 기준(앱 규칙): 변동폭이 사양 폭 ${lim} s/d 초과.`, ref: REF_MAG }); }
      else F.push({ level: 'good', title: `일간 변동 안정 (${spread.toFixed(1)} s/d)` });
    }
  }

  // 5) power reserve
  if (w.prMeasured != null && w.spec.powerReserveH != null) {
    const ratio = w.prMeasured / w.spec.powerReserveH;
    if (ratio < 0.8) { signs++; F.push({ level: 'warn', title: `파워리저브 짧음 (${w.prMeasured} h / 사양 ${w.spec.powerReserveH} h)`, detail: '짧아진 파워리저브는 서비스 필요 증상입니다. 표시 기준(앱 규칙): 사양의 80% 미만.', ref: REF_MAG }); }
    else F.push({ level: 'good', title: `파워리저브 정상 (${w.prMeasured} h / 사양 ${w.spec.powerReserveH} h)` });
  }

  // 6) service age
  const base = w.lastService || w.acquired;
  if (base) {
    const yrs = (now - new Date(base).getTime()) / YEAR_MS;
    const label = w.lastService ? '최근 오버홀' : '입수일';
    if (w.spec.serviceYears != null) {
      if (yrs >= w.spec.serviceYears) { overdue = true; F.push({ level: 'warn', title: `권장 주기 경과 (${label}부터 ${yrs.toFixed(1)}년 / 권장 ${w.spec.serviceYears}년)` }); }
      else F.push({ level: 'good', title: `권장 주기 이내 (${yrs.toFixed(1)}년 / 권장 ${w.spec.serviceYears}년)` });
    } else F.push({ level: 'none', title: `${label}부터 ${yrs.toFixed(1)}년`, detail: '브랜드 권장 오버홀 주기를 입력하면 비교합니다.' });
  }

  let level: Level, verdict: string, summary: string;
  if (magnet) [level, verdict, summary] = ['bad', '탈자 후 재측정', '자기화를 먼저 배제해야 다른 판단이 의미가 있습니다.'];
  else if (ampLow || signs >= 2 || (signs >= 1 && overdue)) [level, verdict, summary] = ['bad', '오버홀 권장', '서비스 필요 증상이 확인됐습니다.'];
  else if (signs === 1) [level, verdict, summary] = ['warn', '점검 권장', '서비스 필요 증상이 하나 있습니다.'];
  else if (overdue) [level, verdict, summary] = ['warn', '정기 오버홀 시기', '증상은 없지만 권장 주기를 지났습니다.'];
  else if (outSpec || beHigh) [level, verdict, summary] = ['warn', '조정 권장', '일오차나 비트에러만 기준 밖입니다. 오버홀보다 조정이 먼저입니다.'];
  else if (rate == null || !ampSet.length) [level, verdict, summary] = ['none', '판단 보류', '타임그래퍼 측정(진폭 포함)과 2일 이상 정밀 로그가 있으면 판단이 안정됩니다.'];
  else [level, verdict, summary] = ['good', '양호', '측정된 지표에서 서비스 필요 신호가 없습니다.'];
  return { level, verdict, summary, findings: F };
}
