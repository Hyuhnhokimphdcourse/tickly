import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { DiagramPoint } from '@/dsp/timegrapher';
import { mono, useT } from '@/theme';

function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, e => { const nw = Math.round(e.nativeEvent.layout.width); if (nw > 0 && nw !== w) setW(nw); }];
}

function niceTicks(a: number, b: number, n: number): number[] {
  if (!isFinite(a) || !isFinite(b)) return [0];
  if (a === b) { a -= 1; b += 1; }
  const raw = (b - a) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const st = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(a / st) * st; v <= Math.ceil(b / st) * st + st / 1e6; v += st) out.push(+v.toFixed(6));
  return out;
}

/**
 * Paper-tape timing diagram: newest beat at the bottom, horizontal position = deviation from the
 * nominal beat grid (ms). The trail's slope is the rate, the gap between the two lanes is the
 * beat error, dot size is loudness. Older dots fade like phosphor.
 */
export function TimingDiagram({ points, height = 220, windowS = 12 }: { points: DiagramPoint[]; height?: number; windowS?: number }) {
  const t = useT();
  const [w, onLayout] = useWidth();
  const last = points.length ? points[points.length - 1].t : 0;
  const pts = points.filter(p => p.t >= last - windowS);
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  const mid = xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  const spread = xs.length ? Math.max(Math.abs(xs[0] - mid), Math.abs(xs[xs.length - 1] - mid)) : 0;
  const half = Math.max(2, spread * 1.25);
  const X = (v: number) => w / 2 + ((v - mid) / half) * (w / 2 - 14);
  const Y = (tt: number) => 10 + (1 - (last - tt) / windowS) * (height - 20);
  const ticks = niceTicks(mid - half, mid + half, 4);
  return (
    <View onLayout={onLayout} style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: t.scope }}>
      <Svg width={w} height={height}>
        {ticks.map(v => (
          <Line key={v} x1={X(v)} x2={X(v)} y1={0} y2={height} stroke={t.scopeGrid} strokeWidth={1} />
        ))}
        {[0.25, 0.5, 0.75].map(f => (
          <Line key={f} x1={0} x2={w} y1={height * f} y2={height * f} stroke={t.scopeGrid} strokeWidth={1} strokeDasharray="2,4" />
        ))}
        {pts.map((p, i) => {
          const age = (last - p.t) / windowS;
          return (
            <Circle
              key={i}
              cx={X(p.x)}
              cy={Y(p.t)}
              r={1.6 + 2.4 * Math.max(0.2, p.a)}
              fill={p.parity === 0 ? t.scopeInk : t.scopeToc}
              opacity={Math.max(0.12, 1 - age * 0.9)}
            />
          );
        })}
        {ticks.map(v => (
          <SvgText key={`l${v}`} x={X(v) + 3} y={height - 6} fill="#6E7F99" fontSize={9} fontFamily={mono}>{`${+(v - mid).toFixed(1)}ms`}</SvgText>
        ))}
      </Svg>
    </View>
  );
}

/** Small line/scatter chart. Optional diagonal band (spec envelope) starting at the first point. */
export function LineChart({ xs, ys, height = 180, xLabel, yLabel, band, line = 'points', fit }: {
  xs: number[]; ys: number[]; height?: number; xLabel?: string; yLabel?: string;
  band?: { origin: number; lo: number; hi: number } | null; line?: 'points' | 'path'; fit?: { a: number; b: number } | null;
}) {
  const t = useT();
  const [w, onLayout] = useWidth();
  const L = 40, Rm = 10, Tm = 14, B = 26;
  const xmax0 = Math.max(xs.length ? Math.max(...xs) : 1, 0.5);
  const xmin0 = xs.length ? Math.min(...xs, 0) : 0;
  const yv = ys.slice();
  if (fit) yv.push(fit.a + fit.b * xmin0, fit.a + fit.b * xmax0);
  if (band) yv.push(band.origin + band.lo * xmax0, band.origin + band.hi * xmax0, band.origin);
  const xt = niceTicks(xmin0, xmax0, 4), yt = niceTicks(Math.min(...yv, 0), Math.max(...yv, 0), 4);
  const x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1];
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (w - L - Rm);
  const Y = (v: number) => Tm + (1 - (v - y0) / (y1 - y0 || 1)) * (height - Tm - B);
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        {band ? (
          <Polygon
            points={`${X(0)},${Y(band.origin)} ${X(x1)},${Y(band.origin + band.hi * x1)} ${X(x1)},${Y(band.origin + band.lo * x1)}`}
            fill={t.accentSoft}
            opacity={0.8}
          />
        ) : null}
        {yt.map(v => (
          <Line key={`y${v}`} x1={L} x2={w - Rm} y1={Y(v)} y2={Y(v)} stroke={t.line} strokeWidth={1} />
        ))}
        {yt.map(v => (
          <SvgText key={`yl${v}`} x={L - 6} y={Y(v) + 3} fill={t.muted} fontSize={10} fontFamily={mono} textAnchor="end">{`${v > 0 ? '+' : ''}${+v.toFixed(2)}`}</SvgText>
        ))}
        {xt.map(v => (
          <SvgText key={`xl${v}`} x={X(v)} y={height - 10} fill={t.muted} fontSize={10} fontFamily={mono} textAnchor="middle">{`${+v.toFixed(2)}`}</SvgText>
        ))}
        {xLabel ? <SvgText x={w - Rm} y={height - 0} fill={t.muted} fontSize={10} textAnchor="end">{xLabel}</SvgText> : null}
        {yLabel ? <SvgText x={2} y={10} fill={t.muted} fontSize={10}>{yLabel}</SvgText> : null}
        {fit ? <Line x1={X(xmin0)} y1={Y(fit.a + fit.b * xmin0)} x2={X(x1)} y2={Y(fit.a + fit.b * x1)} stroke={t.accent} strokeWidth={2} /> : null}
        {line === 'path' && xs.length > 1 ? (
          <Polyline points={xs.map((x, i) => `${X(x)},${Y(ys[i])}`).join(' ')} stroke={t.accent} strokeWidth={2} fill="none" />
        ) : null}
        {xs.map((x, i) => (
          <Circle key={i} cx={X(x)} cy={Y(ys[i])} r={4} fill={i === xs.length - 1 ? t.accent : t.surface} stroke={t.accent} strokeWidth={2} />
        ))}
      </Svg>
    </View>
  );
}

/** GitHub-style wear heatmap for the last `weeks` weeks. */
export function Heatmap({ counts, weeks = 15 }: { counts: Record<string, number>; weeks?: number }) {
  const t = useT();
  const [w, onLayout] = useWidth();
  const cell = Math.min(18, Math.floor((w - 4) / weeks) - 3);
  const gap = 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks - 1) * 7 - today.getDay());
  const cells: { x: number; y: number; c: number }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > today) break;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({ x: Math.floor(i / 7), y: i % 7, c: counts[k] ?? 0 });
  }
  const h = 7 * (cell + gap);
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={h}>
        {cells.map((c, i) => (
          <Rect key={i} x={c.x * (cell + gap)} y={c.y * (cell + gap)} width={cell} height={cell} rx={3}
            fill={c.c ? t.accent : t.surface2} opacity={c.c ? Math.min(1, 0.45 + 0.3 * c.c) : 1} />
        ))}
      </Svg>
    </View>
  );
}
