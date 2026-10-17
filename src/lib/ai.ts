/**
 * Watch identification and spec lookup with the Claude API (Messages API + server-side web search).
 * Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 *
 * NOTE (before public App Store release): the API key is entered by the user and kept in the
 * iOS Keychain. A public build should call a small proxy server instead of embedding any key.
 */
import type { Movement, Source } from './types';

export interface AiWatch {
  brand: string | null;
  model: string | null;
  reference: string | null;
  caliber: string | null;
  movement: Movement | null;
  bph: number | null;
  liftAngle: number | null;
  powerReserveH: number | null;
  jewels: number | null;
  accMin: number | null;
  accMax: number | null;
  serviceYears: number | null;
  confidence: number | null;
  basis: string;
  caveat: string;
  sources: Source[];
}

const PROMPT = `너는 기계식 시계 전문가다. ${'{TASK}'}
반드시 web_search로 확인한 값만 채워라. 우선순위: 제조사 공식 페이지 > 칼리버 데이터베이스(calibercorner.com, watch-wiki, ranfft) > 신뢰할 만한 시계 매체.
확인하지 못한 값은 null. 추측으로 숫자를 만들지 마라.
- accuracy_min/max_spd: 해당 칼리버(또는 모델)의 제조사 공식 일오차 사양(s/d). COSC 인증 모델이면 −4/+6, 제조사 자체 기준이 더 엄격하면 그 값(예: Rolex −2/+2, METAS 0/+5).
- lift_angle_deg: 칼리버 리프트각(타임그래퍼 진폭 계산용).
- service_interval_years: 브랜드가 공식적으로 권장하는 오버홀 주기만.
마지막 답변은 아래 JSON 하나만 출력:
{"brand":string|null,"model":string|null,"reference":string|null,"caliber":string|null,
 "movement":"auto"|"manual"|"quartz"|null,"frequency_bph":integer|null,"lift_angle_deg":number|null,
 "power_reserve_h":number|null,"jewels":integer|null,"accuracy_min_spd":number|null,"accuracy_max_spd":number|null,
 "service_interval_years":number|null,"confidence":number,
 "basis":"식별 근거 한 문장(한국어)","caveat":"불확실한 점 한 문장(한국어)",
 "sources":[{"title":string,"url":string}]}`;

export class AiError extends Error {}

interface ContentBlock {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string }[];
  [k: string]: unknown;
}

export async function identifyWatch(opts: {
  apiKey: string;
  model: string;
  imageBase64?: string | null;
  imageType?: string;
  hint?: { brand?: string; model?: string; ref?: string; caliber?: string };
  signal?: AbortSignal;
}): Promise<AiWatch> {
  const hintText = opts.hint
    ? Object.entries(opts.hint).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const task = opts.imageBase64
    ? `사진 속 손목시계를 식별하고(다이얼 문구, 로고, 케이스·베젤·핸즈, 케이스백·무브먼트 각인 근거) 사양을 찾아라.${hintText ? ` 사용자가 입력한 정보: ${hintText}.` : ''}`
    : `다음 시계의 사양을 찾아라: ${hintText || '(정보 없음)'}.`;
  const content: unknown[] = [];
  if (opts.imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: opts.imageType ?? 'image/jpeg', data: opts.imageBase64 } });
  }
  content.push({ type: 'text', text: PROMPT.replace('{TASK}', task) });

  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content }];
  const all: ContentBlock[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        messages,
      }),
    });
    if (!res.ok) {
      let msg = `API 오류 (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error?.message) msg += `: ${j.error.message}`;
      } catch { /* ignore */ }
      if (res.status === 401) msg = 'API 키가 올바르지 않습니다. 설정에서 키를 확인하세요.';
      if (res.status === 429) msg = '요청이 많습니다. 잠시 뒤 다시 시도하세요.';
      throw new AiError(msg);
    }
    const j = (await res.json()) as { content: ContentBlock[]; stop_reason: string };
    all.push(...j.content);
    // long server-tool turns can pause; continue by sending the partial turn back
    if (j.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: j.content });
      continue;
    }
    break;
  }

  const text = all.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');
  const parsed = extractJson(text);
  if (!parsed) throw new AiError('결과를 읽지 못했습니다. 다시 시도하세요.');

  const cited: Source[] = [];
  for (const b of all) for (const c of b.citations ?? []) if (c.url) cited.push({ title: c.title || c.url, url: c.url });
  const listed = Array.isArray(parsed.sources) ? (parsed.sources as Source[]).filter(s => s && typeof s.url === 'string') : [];
  const sources = dedupe([...listed, ...cited]).filter(s => /^https:\/\//.test(s.url)).slice(0, 8);

  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const mv = parsed.movement;
  return {
    brand: s(parsed.brand), model: s(parsed.model), reference: s(parsed.reference), caliber: s(parsed.caliber),
    movement: mv === 'auto' || mv === 'manual' || mv === 'quartz' ? mv : null,
    bph: n(parsed.frequency_bph), liftAngle: n(parsed.lift_angle_deg), powerReserveH: n(parsed.power_reserve_h),
    jewels: n(parsed.jewels), accMin: n(parsed.accuracy_min_spd), accMax: n(parsed.accuracy_max_spd),
    serviceYears: n(parsed.service_interval_years), confidence: n(parsed.confidence),
    basis: s(parsed.basis) ?? '', caveat: s(parsed.caveat) ?? '', sources,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/g);
  const candidates: string[] = [];
  if (fence) for (const f of fence.reverse()) candidates.push(f.replace(/```(?:json)?/g, '').trim());
  const a = text.lastIndexOf('{"brand"'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  const f0 = text.indexOf('{'), l0 = text.lastIndexOf('}');
  if (f0 >= 0 && l0 > f0) candidates.push(text.slice(f0, l0 + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch { /* try next */ }
  }
  return null;
}

function dedupe(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}
