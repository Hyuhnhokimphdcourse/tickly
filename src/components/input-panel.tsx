import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { T } from '@/components/ui';
import type { InputDiag } from '@/hooks/use-timegrapher';
import { mono, S, useT } from '@/theme';

/** What the microphone actually hears: level, sample rate and the last second of tick envelope. */
export function InputPanel({ diag, running }: { diag: InputDiag; running: boolean }) {
  const t = useT();
  const [w, setW] = useState(300);
  const onLayout = (e: LayoutChangeEvent) => { const nw = Math.round(e.nativeEvent.layout.width); if (nw && nw !== w) setW(nw); };
  const h = 54;
  const pk = diag.peakDb ?? -120;
  const frac = Math.max(0, Math.min(1, (pk + 80) / 80)); // −80 dBFS … 0 dBFS
  const noAudio = running && diag.wall > 2.5 && diag.seconds < 0.2;
  const silent = running && !noAudio && diag.seconds > 2 && pk < -65;
  const weak = running && !noAudio && !silent && diag.seconds > 2 && pk < -50;
  const clipping = pk > -1;
  const pts = diag.scope.map((v, i) => `${(i / Math.max(1, diag.scope.length - 1)) * w},${h - 3 - v * (h - 8)}`).join(' ');
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
        <View style={{ flexShrink: 0 }}><T k="label" numberOfLines={1}>마이크 입력</T></View>
        <Text style={{ fontFamily: mono, fontSize: 11, color: t.muted, flex: 1, textAlign: 'right' }} numberOfLines={1}>{diag.info}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${frac * 100}%`, height: 8, backgroundColor: clipping ? t.bad : frac < 0.2 ? t.warn : t.good }} />
        </View>
        <Text style={{ fontFamily: mono, fontSize: 12, color: t.ink, minWidth: 92, textAlign: 'right' }}>
          {diag.peakDb == null ? '—' : `피크 ${Math.round(pk)} dB`}
        </Text>
      </View>
      <View onLayout={onLayout} style={{ height: h, borderRadius: 10, backgroundColor: t.scope, overflow: 'hidden' }}>
        {diag.scope.length > 1 ? (
          <Svg width={w} height={h}><Polyline points={pts} stroke={t.scopeInk} strokeWidth={1.5} fill="none" /></Svg>
        ) : null}
      </View>
      <T k="small">
        {noAudio
          ? '마이크에서 소리가 들어오지 않습니다. 다른 앱이 마이크를 쓰고 있지 않은지 확인하고, 페이지를 새로고침한 뒤 다시 시작하세요.'
          : silent
            ? '입력이 거의 없습니다. 폰 하단 마이크 구멍을 케이스백에 직접 대세요(케이스를 벗기면 더 좋습니다).'
            : weak
              ? '입력이 약합니다(일오차·비트에러는 측정되지만 진폭은 안 나올 수 있음). 폰 하단 마이크를 케이스백에 밀착하고 조용한 곳에서 재세요.'
              : clipping
              ? '입력이 너무 큽니다. 폰을 살짝 띄우거나 각도를 바꿔 보세요.'
              : '위 파형에 규칙적인 뾰족한 선(틱)이 보이면 소리가 잘 들어오는 상태입니다.'}
      </T>
    </View>
  );
}
