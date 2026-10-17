import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TimingDiagram } from '@/components/charts';
import { Button, Card, Chip, Pill, Row, Screen, Section, Stat, T } from '@/components/ui';
import { STANDARD_BPH, STATE_LABEL, type LockState } from '@/dsp/timegrapher';
import { useTimegrapher } from '@/hooks/use-timegrapher';
import { addReading, useStore } from '@/lib/store';
import { POSITIONS, type Position } from '@/lib/types';
import { fmtDeg, fmtMs, fmtRate, watchName } from '@/lib/util';
import { mono, S, useT } from '@/theme';

const STATE_LEVEL: Record<LockState, 'good' | 'warn' | 'bad' | 'none'> = {
  idle: 'none', listening: 'none', searching: 'none', locked: 'good', weak: 'warn', noisy: 'bad', lost: 'warn',
};

export default function MeasureScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ watchId?: string }>();
  const { data } = useStore();
  const watches = useMemo(
    () => data.watches.filter(w => !w.archived && w.movement !== 'quartz').sort((a, b) => a.order - b.order),
    [data.watches],
  );
  // explicit pick, remembered per incoming ?watchId so a new deep link wins over an old pick
  const [picked, setPicked] = useState<{ param?: string; id: string | null } | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [mode, setMode] = useState<'standard' | 'long'>('standard');
  const [bphChoice, setBphChoice] = useState<number | 'watch' | 'auto'>('watch');
  const [saved, setSaved] = useState(false);
  const tg = useTimegrapher();

  const linked = params.watchId && data.watches.some(w => w.id === params.watchId) ? params.watchId : null;
  const watchId = picked && picked.param === params.watchId ? picked.id : linked ?? (watches.length === 1 ? watches[0].id : null);
  const setWatchId = (id: string | null) => setPicked({ param: params.watchId, id });

  const watch = data.watches.find(w => w.id === watchId) ?? null;
  const bph = bphChoice === 'auto' ? null : bphChoice === 'watch' ? watch?.bph ?? null : bphChoice;
  const liftAngle = watch?.liftAngle ?? data.settings.defaultLiftAngle;
  const laIsDefault = watch?.liftAngle == null;
  const seconds = mode === 'long' ? data.settings.longSeconds : data.settings.standardSeconds;
  const r = tg.result;
  const running = tg.phase === 'running';
  const state: LockState = running ? r?.state ?? 'listening' : tg.phase === 'done' ? (r?.state ?? 'idle') : 'idle';

  const begin = () => {
    setSaved(false);
    void tg.start({ bph, liftAngle, seconds });
  };
  const save = () => {
    if (!watch || !r || r.rate == null || r.bph == null) return;
    addReading({
      watchId: watch.id, position, rate: r.rate, beatError: r.beatError, amplitude: r.amplitude,
      bph: r.bph, liftAngle, quality: r.quality, beats: r.beats, seconds: Math.round(r.elapsed),
    });
    setSaved(true);
  };

  const progress = running ? Math.min(1, tg.lockElapsed / seconds) : tg.phase === 'done' ? 1 : 0;

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <T k="label">Timegrapher</T>
        <T k="h1">측정</T>
      </View>

      <Section title="시계" right={watches.length ? null : <Button kind="ghost" title="+ 시계 추가" onPress={() => router.push('/collection/edit')} />}>
        {watches.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
            {watches.map(w => (
              <Chip key={w.id} label={watchName(w)} selected={w.id === watchId} onPress={() => { setWatchId(w.id); setBphChoice('watch'); }} />
            ))}
            <Chip label="선택 안 함" selected={watchId == null} onPress={() => setWatchId(null)} />
          </ScrollView>
        ) : (
          <T k="small">시계 없이도 측정할 수 있습니다. 기록을 저장하려면 시계를 추가하세요.</T>
        )}
      </Section>

      <Card style={{ gap: S.lg, paddingVertical: S.xl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pill level={STATE_LEVEL[state]}>{running || tg.phase === 'done' ? STATE_LABEL[state] : '대기'}</Pill>
          <Text style={{ fontFamily: mono, color: t.muted, fontSize: 13 }}>
            {r?.bph ? `${r.bph.toLocaleString()} BPH${r.bphAuto ? ' · 자동' : ''}` : bph ? `${bph.toLocaleString()} BPH` : 'BPH 자동'}
          </Text>
        </Row>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T k="bignum" color={r?.rate == null ? t.faint : t.ink}>{fmtRate(r?.rate ?? null)}</T>
          <T k="small">초/일 (s/d)</T>
        </View>
        <Row gap={S.lg}>
          <Stat label="비트에러" value={fmtMs(r?.beatError)} unit="ms" />
          <Stat label="진폭" value={fmtDeg(r?.amplitude)} unit="°" />
          <Stat label="신호" value={r ? `${Math.round(r.quality * 100)}` : '—'} unit="%" />
        </Row>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: 6, backgroundColor: t.accent }} />
        </View>
        <T k="small">
          {running
            ? r?.state === 'locked'
              ? `측정 중 ${Math.floor(tg.lockElapsed)} / ${seconds}초 · ${r.beats}/${r.expected} 비트`
              : state === 'noisy' ? '주변 소음이 큽니다. 조용한 곳으로 옮기세요.'
              : state === 'weak' || state === 'lost' ? '신호가 약합니다. 폰 하단을 케이스백에 밀착하세요.'
              : '틱 소리를 찾는 중…'
            : tg.phase === 'done' ? `완료 · ${r?.beats ?? 0}비트 · 잔차 ${r?.jitterMs?.toFixed(2) ?? '—'} ms`
            : `폰 하단(마이크)을 시계 케이스백에 대고 시작하세요. 고정 후 ${seconds}초 측정합니다.`}
        </T>
        <TimingDiagram points={r?.diagram ?? []} />
        {tg.error ? <T k="small" color={t.bad}>{tg.error}</T> : null}

        {running ? (
          <Button kind="danger" title="중지" onPress={tg.stop} />
        ) : tg.phase === 'done' ? (
          <Row gap={S.sm}>
            <Button style={{ flex: 1 }} kind="primary" title={saved ? '저장됨' : watch ? `${watchName(watch)}에 저장` : '시계를 선택해야 저장'} disabled={saved || !watch || r?.rate == null} onPress={save} />
            <Button title="다시" onPress={begin} />
          </Row>
        ) : (
          <StartButton onPress={begin} />
        )}
        {saved && watch ? (
          <Button kind="ghost" title="시계 상세 보기 →" onPress={() => router.push(`/collection/${watch.id}`)} />
        ) : null}
      </Card>

      <Section title="자세 (선택)">
        <Row wrap gap={S.sm}>
          {POSITIONS.map(p => (
            <Chip key={p.key} label={`${p.short} ${p.label}`} selected={position === p.key} onPress={() => setPosition(position === p.key ? null : p.key)} />
          ))}
        </Row>
      </Section>

      <Section title="측정 설정">
        <Card style={{ gap: S.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T>길이</T>
            <Row gap={S.sm}>
              <Chip label={`표준 ${data.settings.standardSeconds}초`} selected={mode === 'standard'} onPress={() => setMode('standard')} />
              <Chip label={`롱 ${data.settings.longSeconds}초`} selected={mode === 'long'} onPress={() => setMode('long')} />
            </Row>
          </Row>
          <View style={{ gap: S.sm }}>
            <T>진동수 (BPH)</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {watch?.bph ? <Chip label={`시계 설정 ${watch.bph.toLocaleString()}`} selected={bphChoice === 'watch'} onPress={() => setBphChoice('watch')} /> : null}
              <Chip label="자동" selected={bphChoice === 'auto' || (bphChoice === 'watch' && !watch?.bph)} onPress={() => setBphChoice('auto')} />
              {STANDARD_BPH.map(b => <Chip key={b} label={b.toLocaleString()} selected={bphChoice === b} onPress={() => setBphChoice(b)} />)}
            </ScrollView>
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <T>리프트각</T>
            <T k="num">{liftAngle}°{laIsDefault ? ' (기본값)' : ''}</T>
          </Row>
          {laIsDefault ? <T k="small">진폭은 리프트각이 정확해야 맞습니다. 시계 정보에 칼리버 리프트각을 넣으세요.</T> : null}
        </Card>
      </Section>

      <Card style={{ gap: 6, backgroundColor: t.surface2 }}>
        <T k="h3">정확하게 재려면</T>
        <T k="small">· 태엽을 완전히 감은 상태에서, 조용한 방에서 잽니다.</T>
        <T k="small">· 폰 하단 마이크를 케이스백(또는 크리스털)에 밀착하고 움직이지 않습니다.</T>
        <T k="small">· 블루투스 이어폰은 끊어 두세요. 내장 마이크를 씁니다.</T>
        <T k="small">· 폰 오디오 클럭 오차가 일오차에 그대로 더해집니다. 실제 착용 일오차는 정밀 로그로 확인하세요.</T>
      </Card>
    </Screen>
  );
}

function StartButton({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="측정 시작"
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'center', width: 132, height: 132, borderRadius: 66, backgroundColor: t.accent,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
        borderWidth: 6, borderColor: t.accentSoft,
      })}>
      <Text style={{ color: t.onAccent, fontSize: 20, fontWeight: '800' }}>시작</Text>
      <Text style={{ color: t.onAccent, opacity: 0.8, fontSize: 12, marginTop: 2 }}>마이크로 측정</Text>
    </Pressable>
  );
}

