import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SyncBanner } from '@/components/sync-banner';
import { Button, Card, Chip, Empty, Pill, Row, Screen, T, WatchThumb } from '@/components/ui';
import { diagnose } from '@/lib/diagnose';
import { useStore } from '@/lib/store';
import { MOVEMENT_LABEL } from '@/lib/types';
import { fmtRate, watchName } from '@/lib/util';
import { mono, S, useT } from '@/theme';

export default function CollectionScreen() {
  const t = useT();
  const { data, loaded } = useStore();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [showArchived, setShowArchived] = useState(false);

  const rows = useMemo(() => {
    return data.watches
      .filter(w => showArchived || !w.archived)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order)
      .map(w => {
        const rs = data.readings.filter(r => r.watchId === w.id).sort((a, b) => a.at - b.at);
        return { w, last: rs[rs.length - 1] ?? null, dg: diagnose(w, data.readings, data.cycles) };
      });
  }, [data, showArchived]);

  const counts = useMemo(() => {
    let need = 0, ok = 0;
    for (const r of rows) { if (r.dg.level === 'good') ok++; if (r.dg.level === 'warn' || r.dg.level === 'bad') need++; }
    return { need, ok };
  }, [rows]);

  return (
    <Screen>
      <SyncBanner />
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 4 }}>
          <T k="label">Collection</T>
          <T k="h1">컬렉션</T>
        </View>
        <Button kind="primary" title="+ 시계" onPress={() => router.push('/collection/edit')} />
      </Row>

      {loaded && rows.length === 0 ? (
        <Empty
          title="아직 등록된 시계가 없습니다"
          body="사진을 찍으면 AI가 브랜드·모델·칼리버와 사양(진동수, 리프트각, 일오차 사양)을 웹에서 찾아 채웁니다. 그다음 측정 탭에서 바로 잴 수 있습니다."
          action={<Button kind="primary" title="첫 시계 추가" onPress={() => router.push('/collection/edit')} />}
        />
      ) : (
        <>
          <Card style={{ flexDirection: 'row', padding: 0 }}>
            {[
              { k: '보유', v: rows.filter(r => !r.w.archived).length },
              { k: '양호', v: counts.ok },
              { k: '조치 필요', v: counts.need },
            ].map((x, i) => (
              <View key={x.k} style={{ flex: 1, padding: S.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.line, gap: 2 }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: t.ink }}>{x.v}</Text>
                <T k="small">{x.k}</T>
              </View>
            ))}
          </Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={S.sm}>
              <Chip label="목록" selected={view === 'list'} onPress={() => setView('list')} />
              <Chip label="그리드" selected={view === 'grid'} onPress={() => setView('grid')} />
            </Row>
            <Chip label={showArchived ? '보관함 포함' : '보관함 숨김'} selected={showArchived} onPress={() => setShowArchived(!showArchived)} />
          </Row>
          {view === 'list' ? (
            <View style={{ gap: S.sm }}>
              {rows.map(({ w, last, dg }) => (
                <Card key={w.id} onPress={() => router.push(`/collection/${w.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md }}>
                  <WatchThumb uri={w.photo} size={58} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <T k="h3" numberOfLines={1}>{`${w.favorite ? '★ ' : ''}${watchName(w)}`}</T>
                    <T k="small" numberOfLines={1}>{[w.caliber, MOVEMENT_LABEL[w.movement], w.archived ? '보관됨' : ''].filter(Boolean).join(' · ') || '칼리버 미입력'}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontFamily: mono, fontSize: 17, fontWeight: '700', color: t.ink }}>{last ? fmtRate(last.rate) : '—'}<Text style={{ fontSize: 11, color: t.muted }}> s/d</Text></Text>
                    <Pill level={dg.level}>{dg.verdict}</Pill>
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
              {rows.map(({ w, last, dg }) => (
                <Pressable key={w.id} onPress={() => router.push(`/collection/${w.id}`)} style={({ pressed }) => ({ width: '48.5%', opacity: pressed ? 0.85 : 1 })}>
                  <Card style={{ padding: S.sm, gap: S.sm }}>
                    <View style={{ aspectRatio: 1, width: '100%', borderRadius: 12, overflow: 'hidden' }}>
                      <WatchThumb uri={w.photo} fill />
                    </View>
                    <T k="h3" numberOfLines={1}>{watchName(w)}</T>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: mono, fontWeight: '700', color: t.ink }}>{last ? `${fmtRate(last.rate)} s/d` : '—'}</Text>
                      <Pill level={dg.level}>{dg.verdict}</Pill>
                    </Row>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
