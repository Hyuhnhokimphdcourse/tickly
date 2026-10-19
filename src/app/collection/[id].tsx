import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Button, Card, Divider, Empty, Pill, Row, Screen, Section, Stat, T, levelColors } from '@/components/ui';
import { diagnose, latestByPosition, positionalSpread } from '@/lib/diagnose';
import { fitPrecision } from '@/lib/precision';
import { useNow } from '@/hooks/use-now';
import { deleteReading, patchWatch, startCycle, toggleWear, useStore } from '@/lib/store';
import { MOVEMENT_LABEL, POSITIONS } from '@/lib/types';
import { DAY_MS, dayKey, fmtDate, fmtDateTime, fmtDeg, fmtMs, fmtRate, watchName } from '@/lib/util';
import { mono, R, S, useT } from '@/theme';

const SRC_LABEL = { ai: ['AI 검색', 'none'], verified: ['출처 검증됨', 'good'], user: ['직접 입력', 'none'], '': ['', 'none'] } as const;

export default function WatchDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore();
  const w = data.watches.find(x => x.id === id);
  const [armed, setArmed] = useState<string | null>(null);
  const now = useNow();

  const readings = useMemo(() => data.readings.filter(r => r.watchId === id).sort((a, b) => a.at - b.at), [data.readings, id]);
  const cycles = useMemo(() => data.cycles.filter(c => c.watchId === id).sort((a, b) => b.startedAt - a.startedAt), [data.cycles, id]);
  const dg = useMemo(() => (w ? diagnose(w, data.readings, data.cycles, now) : null), [w, data.readings, data.cycles, now]);

  if (!w || !dg) {
    return <Screen><Empty title="시계를 찾을 수 없습니다" body="삭제되었을 수 있습니다." action={<Button title="컬렉션으로" onPress={() => router.back()} />} /></Screen>;
  }

  const last = readings[readings.length - 1];
  const byPos = latestByPosition(readings.filter(r => r.position));
  const spread = positionalSpread(readings);
  const open = cycles.find(c => c.endedAt == null);
  const openFit = open ? fitPrecision(open.entries) : null;
  const wornToday = (data.wear[dayKey(now)] ?? []).includes(w.id);
  const t0 = readings.length ? readings[0].at : 0;
  const lc = levelColors(dg.level, t);
  const src = SRC_LABEL[w.spec.src];
  const range = w.spec.accMin != null && w.spec.accMax != null
    ? (w.movement === 'quartz' ? `±${Math.round(w.spec.accMax * 30.4)} 초/월` : `${fmtRate(w.spec.accMin, 0)}/${fmtRate(w.spec.accMax, 0)} s/d`)
    : '—';

  const ledger: [string, string][] = [
    ['칼리버', w.caliber || '—'],
    ['구동', MOVEMENT_LABEL[w.movement]],
    ['진동수', w.bph ? `${w.bph.toLocaleString()} bph (${(w.bph / 7200).toFixed(1)} Hz)` : '자동 감지'],
    ['리프트각', w.liftAngle ? `${w.liftAngle}°` : `— (기본 ${data.settings.defaultLiftAngle}°)`],
    ['사양 일오차', range],
    ['파워리저브 사양/실측', w.movement === 'quartz' && w.spec.powerReserveH ? `완충 약 ${Math.round(w.spec.powerReserveH / 24)}일` : `${w.spec.powerReserveH ?? '—'} h / ${w.prMeasured ?? '—'} h`],
    ['보석', w.spec.jewels != null ? `${w.spec.jewels}` : '—'],
    ['권장 오버홀', w.spec.serviceYears != null ? `${w.spec.serviceYears}년` : '—'],
    ['입수 / 최근 오버홀', `${w.acquired || '—'} / ${w.lastService || '—'}`],
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: watchName(w), headerRight: () => <Button kind="ghost" title="편집" onPress={() => router.push({ pathname: '/collection/edit', params: { id: w.id } })} /> }} />

      <Row gap={S.lg} style={{ alignItems: 'flex-start' }}>
        {w.photo ? (
          <Image source={{ uri: w.photo }} style={{ width: 112, height: 112, borderRadius: R.lg }} contentFit="cover" />
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <T k="h2">{watchName(w)}</T>
          <Row wrap gap={6}>
            {w.ref ? <Pill>{`Ref. ${w.ref}`}</Pill> : null}
            {w.caliber ? <Pill>{w.caliber}</Pill> : null}
            {w.favorite ? <Pill accent>즐겨찾기</Pill> : null}
          </Row>
        </View>
      </Row>

      <Row gap={S.sm} wrap>
        {w.movement !== 'quartz' ? <Button kind="primary" title="측정" style={{ flexGrow: 1 }} onPress={() => router.navigate({ pathname: '/', params: { watchId: w.id } })} /> : null}
        <Button title={open ? '정밀 로그 보기' : '정밀 로그 시작'} style={{ flexGrow: 1 }} onPress={() => {
          const c = open ?? startCycle(w.id);
          router.navigate(`/precision/${c.id}`);
        }} />
        <Button title={wornToday ? '오늘 착용 ✓' : '오늘 착용'} style={{ flexGrow: 1 }} onPress={() => toggleWear(w.id)} />
      </Row>

      <Card style={{ gap: S.md }}>
        <T k="label">최근 측정</T>
        {last ? (
          <>
            <Row style={{ alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontFamily: mono, fontSize: 44, fontWeight: '700', color: t.ink, letterSpacing: -1 }}>{fmtRate(last.rate)}</Text>
              <T k="small">s/d</T>
            </Row>
            <Row gap={S.lg}>
              <Stat label="비트에러" value={fmtMs(last.beatError)} unit="ms" />
              <Stat label="진폭" value={fmtDeg(last.amplitude)} unit="°" />
              <Stat label="자세" value={last.position ?? '—'} />
            </Row>
            <T k="small">{`${fmtDateTime(last.at)} · ${last.bph.toLocaleString()} BPH · 신호 ${Math.round(last.quality * 100)}%`}</T>
          </>
        ) : (
          <T k="small">아직 타임그래퍼 기록이 없습니다.</T>
        )}
        {openFit ? (
          <>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <T>착용 일오차 (정밀 로그)</T>
              <T k="num">{`${fmtRate(openFit.rate)} s/d · ${openFit.spanDays.toFixed(1)}일`}</T>
            </Row>
          </>
        ) : null}
      </Card>

      <Section title="상태 진단">
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: lc.fg, backgroundColor: t.surface, padding: S.lg, gap: S.md }}>
          <Row gap={S.sm}>
            <Pill level={dg.level}>{dg.level === 'good' ? '양호' : dg.level === 'none' ? '보류' : dg.level === 'bad' ? '조치' : '주의'}</Pill>
            <T k="h2">{dg.verdict}</T>
          </Row>
          <T k="small">{dg.summary}</T>
          {dg.findings.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: S.sm, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: t.line }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: levelColors(f.level, t).fg }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontWeight: '700' }}>{f.title}</T>
                {f.detail ? <T k="small">{f.detail}</T> : null}
                {f.ref ? (
                  <Pressable onPress={() => void Linking.openURL(f.ref!.url)}><T k="small" color={t.accent}>{f.ref.title}</T></Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </Section>

      {readings.length >= 2 ? (
        <Section title="일오차 추이 (타임그래퍼)">
          <Card>
            <LineChart
              xs={readings.map(r => (r.at - t0) / DAY_MS)}
              ys={readings.map(r => r.rate)}
              line="path"
              xLabel="경과 (일)"
              yLabel="s/d"
            />
          </Card>
        </Section>
      ) : null}

      {byPos.size ? (
        <Section title="자세별 일오차" right={spread ? <T k="small">{`편차 ${spread.spread.toFixed(1)} s/d · ${spread.n}자세`}</T> : null}>
          <Card style={{ gap: 0, paddingVertical: S.sm }}>
            {POSITIONS.filter(p => byPos.has(p.key)).map((p, i) => {
              const r = byPos.get(p.key)!;
              return (
                <Row key={p.key} style={{ justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                  <T>{`${p.short} ${p.label}`}</T>
                  <T k="num">{`${fmtRate(r.rate)} s/d · ${fmtDeg(r.amplitude)}° · ${fmtMs(r.beatError)} ms`}</T>
                </Row>
              );
            })}
          </Card>
        </Section>
      ) : null}

      <Section title="무브먼트 사양" right={src[0] ? <Pill level={src[1]}>{src[0]}</Pill> : null}>
        <Card style={{ paddingVertical: S.sm }}>
          {ledger.map(([k, v], i) => (
            <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, gap: S.md }}>
              <T k="small">{k}</T>
              <T k="num" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</T>
            </Row>
          ))}
        </Card>
        {w.spec.sources.length ? (
          <View style={{ gap: 4 }}>
            {w.spec.sources.map(s => (
              <Pressable key={s.url} onPress={() => void Linking.openURL(s.url)}>
                <T k="small" color={t.accent} numberOfLines={1}>{`↗ ${s.title}`}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
        {w.spec.src === 'ai' ? <T k="small">{'AI가 웹 검색으로 찾은 값입니다. 출처 링크에서 확인한 뒤 편집 화면에서 「출처를 확인했습니다」를 누르세요.'}</T> : null}
      </Section>

      <Section title={`측정 기록 (${readings.length})`}>
        {readings.length ? (
          <Card style={{ paddingVertical: S.xs }}>
            {readings.slice().reverse().map((r, i) => (
              <Row key={r.id} style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <T k="num">{`${fmtRate(r.rate)} s/d  ${fmtMs(r.beatError)} ms  ${fmtDeg(r.amplitude)}°`}</T>
                  <T k="small">{`${fmtDateTime(r.at)}${r.position ? ` · ${r.position}` : ''} · 신호 ${Math.round(r.quality * 100)}%`}</T>
                </View>
                <Pressable
                  accessibilityLabel="기록 삭제"
                  onPress={() => { if (armed === r.id) { deleteReading(r.id); setArmed(null); } else setArmed(r.id); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: armed === r.id ? t.bad : 'transparent' }}>
                  <Text style={{ color: armed === r.id ? '#fff' : t.faint, fontWeight: '700' }}>{armed === r.id ? '삭제' : '×'}</Text>
                </Pressable>
              </Row>
            ))}
          </Card>
        ) : <T k="small">측정 탭에서 이 시계를 선택해 측정하면 기록됩니다.</T>}
      </Section>

      {cycles.length ? (
        <Section title="정밀 로그 사이클">
          <Card style={{ paddingVertical: S.xs }}>
            {cycles.map((c, i) => {
              const f = fitPrecision(c.entries);
              return (
                <Pressable key={c.id} onPress={() => router.navigate(`/precision/${c.id}`)}>
                  <Row style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, justifyContent: 'space-between' }}>
                    <T>{`${fmtDate(c.startedAt)} 시작${c.endedAt == null ? ' · 진행 중' : ''}`}</T>
                    <T k="num">{f ? `${fmtRate(f.rate)} s/d` : `${c.entries.length}회`}</T>
                  </Row>
                </Pressable>
              );
            })}
          </Card>
        </Section>
      ) : null}

      <Row gap={S.sm}>
        <Button style={{ flex: 1 }} title={w.favorite ? '즐겨찾기 해제' : '즐겨찾기'} onPress={() => patchWatch(w.id, { favorite: !w.favorite })} />
        <Button style={{ flex: 1 }} title={w.archived ? '보관 해제' : '보관'} onPress={() => patchWatch(w.id, { archived: !w.archived })} />
      </Row>
    </Screen>
  );
}
