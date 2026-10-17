import * as Haptics from 'expo-haptics';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { LineChart } from '@/components/charts';
import { Button, Card, Empty, Pill, Row, Screen, Section, Stat, T } from '@/components/ui';
import { fitPrecision, offsetFor } from '@/lib/precision';
import { deleteCycle, patchCycle, startCycle, useStore } from '@/lib/store';
import { fmtDate, fmtDateTime, fmtRate, fmtSigned, pad, watchName } from '@/lib/util';
import { mono, R, S, useT } from '@/theme';

const fmtTarget = (m: number) => `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad(((m % 60) + 60) % 60)}`;
function defaultTarget() {
  const now = new Date();
  const d = new Date(now.getTime() + (now.getSeconds() >= 45 ? 120e3 : 60e3));
  return d.getHours() * 60 + d.getMinutes();
}

export default function CycleDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore();
  const c = data.cycles.find(x => x.id === id);
  const w = c ? data.watches.find(x => x.id === c.watchId) : undefined;
  const [mode, setMode] = useState<'view' | 'tap' | 'result'>('view');
  const [target, setTarget] = useState(defaultTarget);
  const [tap, setTap] = useState<{ t: number; off: number } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  if (!c || !w) return <Screen><Empty title="사이클을 찾을 수 없습니다" body="삭제되었을 수 있습니다." action={<Button title="돌아가기" onPress={() => router.back()} />} /></Screen>;

  const fit = fitPrecision(c.entries);
  const entries = c.entries.slice().sort((a, b) => a.t - b.t);
  const range = w.spec.accMin != null && w.spec.accMax != null ? { lo: w.spec.accMin, hi: w.spec.accMax } : null;
  const inSpec = fit && range ? fit.rate >= range.lo && fit.rate <= range.hi : null;
  const open = c.endedAt == null;

  const record = (ms: number) => {
    setTap({ t: ms, off: offsetFor(target, ms) });
    setMode('result');
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const saveEntry = () => {
    if (!tap) return;
    patchCycle(c.id, { entries: [...c.entries, { t: tap.t, off: +tap.off.toFixed(2) }] });
    setTap(null);
    setMode('view');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: watchName(w) }} />
      <Card style={{ gap: S.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T k="label">{open ? '진행 중 사이클' : '완료된 사이클'}</T>
          {inSpec != null ? <Pill level={inSpec ? 'good' : 'warn'}>{inSpec ? '사양 이내' : '사양 밖'}</Pill> : null}
        </Row>
        <Row style={{ alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontFamily: mono, fontSize: 48, fontWeight: '700', color: fit ? t.ink : t.faint, letterSpacing: -1 }}>{fmtRate(fit?.rate ?? null)}</Text>
          <T k="small">s/d (착용 중 관측)</T>
        </Row>
        <Row gap={S.lg}>
          <Stat label="기록" value={String(entries.length)} unit="회" />
          <Stat label="기간" value={fit ? fit.spanDays.toFixed(1) : '0'} unit="일" />
          <Stat label="표준오차" value={fit?.se != null ? `±${fit.se.toFixed(2)}` : '—'} unit="s/d" />
        </Row>
        <T k="small">{`${fmtDate(c.startedAt)} 시작${range ? ` · 사양 ${fmtRate(range.lo, 0)}/${fmtRate(range.hi, 0)} s/d` : ''}`}</T>
      </Card>

      {open && mode === 'view' ? (
        <Button kind="primary" title="지금 시각 기록하기" onPress={() => { setTarget(defaultTarget()); setMode('tap'); }} />
      ) : null}

      {mode === 'tap' ? (
        <Card style={{ gap: S.lg, alignItems: 'center' }}>
          <T k="small" style={{ textAlign: 'center' }}>1) 시계 분침이 가리킬 시각을 맞추고{'\n'}2) 시계 초침이 12를 지나는 순간 아래 원을 누르세요.</T>
          <Row gap={6} style={{ justifyContent: 'center' }}>
            {[[-60, '−h'], [-1, '−']].map(([d, l]) => <Step key={l} label={String(l)} onPress={() => setTarget(x => x + Number(d))} />)}
            <Text style={{ fontFamily: mono, fontSize: 30, fontWeight: '700', color: t.ink, minWidth: 96, textAlign: 'center' }}>{fmtTarget(target)}</Text>
            <T k="num" color={t.muted}>:00</T>
            {[[1, '+'], [60, '+h']].map(([d, l]) => <Step key={l} label={String(l)} onPress={() => setTarget(x => x + Number(d))} />)}
          </Row>
          <TapDial onTap={record} />
          <Button kind="ghost" title="취소" onPress={() => setMode('view')} />
        </Card>
      ) : null}

      {mode === 'result' && tap ? (
        <Card style={{ gap: S.md }}>
          <T k="label">이번 기록 (시계 − 기준)</T>
          <Text style={{ fontFamily: mono, fontSize: 36, fontWeight: '700', color: t.ink }}>{`${fmtSigned(tap.off)} s`}</Text>
          <T k="small">{`탭 ${fmtDateTime(tap.t)}:${pad(new Date(tap.t).getSeconds())} · 시계 ${fmtTarget(target)}:00`}</T>
          <Row gap={S.sm}>
            <Button style={{ flex: 1 }} kind="primary" title="저장" onPress={saveEntry} />
            <Button title="다시" onPress={() => setMode('tap')} />
          </Row>
        </Card>
      ) : null}

      {fit ? (
        <Section title="누적 오차">
          <Card>
            <LineChart xs={fit.xs} ys={fit.ys} fit={{ a: fit.intercept, b: fit.rate }} band={range ? { origin: fit.intercept, lo: range.lo, hi: range.hi } : null} xLabel="경과 (일)" yLabel="오차 s" />
            <T k="small">{`선의 기울기가 일오차입니다.${range ? ' 음영은 사양 범위입니다.' : ''}`}</T>
          </Card>
        </Section>
      ) : null}

      <Section title="기록">
        {entries.length ? (
          <Card style={{ paddingVertical: S.xs }}>
            {entries.slice().reverse().map((e, i, arr) => {
              const prev = arr[i + 1];
              const dd = prev ? (e.t - prev.t) / 86400e3 : 0;
              const key = String(e.t);
              return (
                <Row key={key} style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, justifyContent: 'space-between' }}>
                  <View style={{ gap: 2 }}>
                    <T k="num">{`${fmtSigned(e.off)} s${prev && dd > 0.2 ? `   구간 ${fmtRate((e.off - prev.off) / dd)} s/d` : ''}`}</T>
                    <T k="small">{fmtDateTime(e.t)}</T>
                  </View>
                  <Pressable onPress={() => {
                    if (armed !== key) { setArmed(key); return; }
                    patchCycle(c.id, { entries: c.entries.filter(x => x.t !== e.t) });
                    setArmed(null);
                  }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: armed === key ? t.bad : 'transparent' }}>
                    <Text style={{ color: armed === key ? '#fff' : t.faint, fontWeight: '700' }}>{armed === key ? '삭제' : '×'}</Text>
                  </Pressable>
                </Row>
              );
            })}
          </Card>
        ) : <T k="small">시계를 맞춘 직후 첫 기록을 하고, 하루 이상 간격으로 기록을 추가하세요.</T>}
        {open ? (
          <Row gap={S.sm}>
            <TextInput
              value={manual}
              onChangeText={setManual}
              placeholder="오차 직접 입력 (예: +3.5)"
              placeholderTextColor={t.faint}
              keyboardType="numbers-and-punctuation"
              style={{ flex: 1, backgroundColor: t.surface, borderRadius: R.sm, borderWidth: 1, borderColor: t.line, paddingHorizontal: 11, paddingVertical: 10, color: t.ink }}
            />
            <Button title="추가" disabled={!isFinite(Number(manual.replace('+', ''))) || !manual.trim()} onPress={() => {
              patchCycle(c.id, { entries: [...c.entries, { t: Date.now(), off: Number(manual.replace('+', '')) }] });
              setManual('');
            }} />
          </Row>
        ) : null}
      </Section>

      <Row gap={S.sm}>
        {open ? (
          <Button style={{ flex: 1 }} title="사이클 완료" onPress={() => patchCycle(c.id, { endedAt: Date.now() })} />
        ) : (
          <Button style={{ flex: 1 }} title="새 사이클 시작" onPress={() => { const n = startCycle(w.id); router.replace(`/precision/${n.id}`); }} />
        )}
        <Button kind="danger" title={armed === 'cycle' ? '정말 삭제' : '삭제'} onPress={() => {
          if (armed !== 'cycle') { setArmed('cycle'); return; }
          deleteCycle(c.id);
          router.back();
        }} />
      </Row>
    </Screen>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: t.ink, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** A dial with a live reference seconds hand; the whole dial is the tap target (fires on press-in). */
function TapDial({ onTap }: { onTap: (ms: number) => void }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const loop = () => { setNow(Date.now()); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  const d = new Date(now);
  const sec = d.getSeconds() + d.getMilliseconds() / 1000;
  const size = 250, c = size / 2;
  const a = (sec / 60) * 2 * Math.PI;
  return (
    <View style={{ alignItems: 'center', gap: S.sm }}>
      <Pressable accessibilityLabel="시계 초침이 12에 왔을 때 누르기" onPressIn={() => onTap(Date.now())}
        onPress={() => {}}
        style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
        <View pointerEvents="none"><Svg width={size} height={size}>
          {Array.from({ length: 60 }, (_, i) => {
            const ang = (i / 60) * 2 * Math.PI, h = i % 5 === 0;
            const r1 = h ? c - 22 : c - 16, r2 = c - 8;
            return <Line key={i} x1={c + r1 * Math.sin(ang)} y1={c - r1 * Math.cos(ang)} x2={c + r2 * Math.sin(ang)} y2={c - r2 * Math.cos(ang)} stroke={h ? t.ink : t.faint} strokeWidth={h ? 2.4 : 1} />;
          })}
          <Line x1={c - 14 * Math.sin(a)} y1={c + 14 * Math.cos(a)} x2={c + (c - 26) * Math.sin(a)} y2={c - (c - 26) * Math.cos(a)} stroke={t.accent} strokeWidth={2.5} strokeLinecap="round" />
          <Circle cx={c} cy={c} r={5} fill={t.accent} />
        </Svg></View>
      </Pressable>
      <Text style={{ fontFamily: mono, fontSize: 26, fontWeight: '700', color: t.ink }}>{`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`}</Text>
      <T k="small">이 기기 시각(네트워크 동기화) 기준</T>
    </View>
  );
}
