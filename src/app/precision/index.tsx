import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { SyncBanner } from '@/components/sync-banner';
import { Button, Card, Chip, Empty, Pill, Row, Screen, Section, T } from '@/components/ui';
import { fitPrecision } from '@/lib/precision';
import { startCycle, useStore } from '@/lib/store';
import { fmtDate, fmtRate, watchName } from '@/lib/util';
import { mono, S, useT } from '@/theme';

export default function PrecisionList() {
  const t = useT();
  const { data, loaded } = useStore();
  const [picking, setPicking] = useState(false);
  const watches = useMemo(() => data.watches.filter(w => !w.archived).sort((a, b) => a.order - b.order), [data.watches]);

  const rows = useMemo(() => data.cycles
    .map(c => {
      const w = data.watches.find(x => x.id === c.watchId);
      const f = fitPrecision(c.entries);
      let level: 'good' | 'warn' | 'bad' | 'none' = 'none';
      if (f && w && w.spec.accMin != null && w.spec.accMax != null) level = f.rate >= w.spec.accMin && f.rate <= w.spec.accMax ? 'good' : Math.abs(f.rate) > 120 ? 'bad' : 'warn';
      const lastT = c.entries.length ? Math.max(...c.entries.map(e => e.t)) : c.startedAt;
      return { c, w, f, level, lastT };
    })
    .filter(x => x.w)
    .sort((a, b) => Number(a.c.endedAt != null) - Number(b.c.endedAt != null) || b.lastT - a.lastT), [data]);

  const begin = (watchId: string) => {
    const c = startCycle(watchId);
    setPicking(false);
    router.push(`/precision/${c.id}`);
  };

  return (
    <Screen>
      <SyncBanner />
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 4 }}>
          <T k="label">Precision log</T>
          <T k="h1">정밀 로그</T>
        </View>
        <Button kind="primary" title="+ 사이클" disabled={!watches.length} onPress={() => setPicking(!picking)} />
      </Row>
      <T k="small">시계가 가리키는 시각을 며칠 간격으로 기록해 실제 착용 중 일오차를 계산합니다. 시계를 다시 맞추거나 조정·오버홀한 뒤에는 새 사이클을 시작하세요.</T>

      {picking ? (
        <Section title="어느 시계로 시작할까요?">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
            {watches.map(w => <Chip key={w.id} label={watchName(w)} onPress={() => begin(w.id)} />)}
          </ScrollView>
        </Section>
      ) : null}

      {loaded && !rows.length ? (
        <Empty
          title="진행 중인 사이클이 없습니다"
          body={watches.length ? '시계를 맞춘 직후에 사이클을 시작하고, 하루 이상 간격으로 기록을 추가하세요.' : '먼저 컬렉션에 기계식 시계를 추가하세요.'}
          action={watches.length ? <Button kind="primary" title="사이클 시작" onPress={() => setPicking(true)} /> : <Button title="시계 추가" onPress={() => router.navigate('/collection/edit')} />}
        />
      ) : (
        <View style={{ gap: S.sm }}>
          {rows.map(({ c, w, f, level, lastT }) => (
            <Card key={c.id} onPress={() => router.push(`/precision/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <T k="h3" numberOfLines={1}>{watchName(w!)}</T>
                <T k="small">{`${fmtDate(c.startedAt)} 시작 · ${c.entries.length}회 기록 · 마지막 ${fmtDate(lastT)}`}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontFamily: mono, fontSize: 18, fontWeight: '700', color: t.ink }}>{f ? fmtRate(f.rate) : '—'}<Text style={{ fontSize: 11, color: t.muted }}> s/d</Text></Text>
                <Pill level={c.endedAt == null ? level : 'none'}>{c.endedAt == null ? (f ? `${f.spanDays.toFixed(1)}일` : '진행 중') : '완료'}</Pill>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
