import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { num } from '@/lib/format';
import type { RadarAxisView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { Row, Text } from '../ui';

const RINGS = [4, 8, 12, 16, 20];

export interface RadarSeries {
  label: string;
  axes: RadarAxisView[];
}

/** Média dos eixos com dado (0–20). */
export function radarOverall(axes: RadarAxisView[]): number | null {
  const s = axes.map((a) => a.score).filter((x): x is number => x != null);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/**
 * Radar 0–20 no estilo "ficha de personagem": anéis em 4/8/12/16/20, um eixo por teste.
 * Eixos sem resultado ficam no centro e com o rótulo apagado.
 */
export function RadarChart({ main, compare, maxSize = 440 }: { main: RadarSeries; compare?: RadarSeries | null; maxSize?: number }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const [table, setTable] = useState(false);
  const size = Math.min(width, maxSize);
  const n = main.axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = Math.max(40, size / 2 - 64);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, score: number) => {
    const r = (R * Math.max(0, Math.min(20, score))) / 20;
    return { x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) };
  };
  const poly = (axes: RadarAxisView[]) =>
    axes
      .map((a, i) => pt(i, a.score ?? 0))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');

  const series = [{ s: main, color: c.chart1 }, ...(compare ? [{ s: compare, color: c.chart2 }] : [])];
  const label = series
    .map(({ s }) => `${s.label}: ` + s.axes.map((a) => `${a.label} ${a.score == null ? 'sem dado' : num(a.score, 1)}`).join(', '))
    .join('. ');

  return (
    <View style={{ gap: space.md }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {compare ? (
        <Row gap={space.lg} wrap style={{ justifyContent: 'center' }}>
          {series.map(({ s, color }) => (
            <Row key={s.label} gap={6}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
              <Text variant="small" muted>
                {s.label}
              </Text>
            </Row>
          ))}
        </Row>
      ) : null}
      {size > 0 ? (
        <View style={{ alignItems: 'center' }} accessible accessibilityRole="image" accessibilityLabel={`Radar de 0 a 20. ${label}`}>
          <Svg width={size} height={size}>
            {RINGS.map((k) => (
              <Circle key={k} cx={cx} cy={cy} r={(R * k) / 20} stroke={k === 20 ? c.border : c.grid} strokeWidth={1} fill="none" />
            ))}
            {main.axes.map((_, i) => {
              const end = pt(i, 20);
              return <Line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={c.grid} strokeWidth={1} />;
            })}
            {RINGS.map((k) => (
              <SvgText key={`l${k}`} x={cx + 3} y={cy - (R * k) / 20 - 3} fontSize={9} fontFamily={font.medium} fill={c.textFaint}>
                {k}
              </SvgText>
            ))}
            {series.map(({ s, color }, si) => (
              <G key={s.label}>
                <Polygon points={poly(s.axes)} fill={color} fillOpacity={si === 0 ? 0.2 : 0.12} stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {s.axes.map((a, i) => {
                  if (a.score == null) return null;
                  const p = pt(i, a.score);
                  return <Circle key={a.testId} cx={p.x} cy={p.y} r={4} fill={color} stroke={c.surface} strokeWidth={2} />;
                })}
              </G>
            ))}
            {main.axes.map((a, i) => {
              const ang = angle(i);
              const cos = Math.cos(ang);
              const sin = Math.sin(ang);
              const lx = cx + (R + 12) * cos;
              const ly = cy + (R + 12) * sin;
              const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
              const dy = sin < -0.6 ? -14 : sin > 0.6 ? 10 : -2;
              const missing = a.score == null;
              return (
                <G key={a.testId}>
                  <SvgText x={lx} y={ly + dy} fontSize={11} fontFamily={font.medium} fill={missing ? c.textFaint : c.textMuted} textAnchor={anchor}>
                    {a.label}
                  </SvgText>
                  <SvgText x={lx} y={ly + dy + 14} fontSize={12} fontFamily={font.semibold} fill={missing ? c.textFaint : c.text} textAnchor={anchor}>
                    {missing ? '—' : num(a.score, 0)}
                    {compare ? ` · ${compare.axes[i]?.score == null ? '—' : num(compare.axes[i]!.score, 0)}` : ''}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </View>
      ) : (
        <View style={{ height: 280 }} />
      )}
      <Pressable onPress={() => setTable((v) => !v)} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text variant="small" color={c.accent} style={{ fontFamily: font.medium }}>
          {table ? 'Ocultar tabela' : 'Ver tabela'}
        </Text>
      </Pressable>
      {table ? (
        <View style={{ borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.md, gap: 6 }}>
          <Row>
            <Text variant="caption" muted style={{ flex: 2 }}>
              Teste
            </Text>
            {series.map(({ s }) => (
              <Text key={s.label} variant="caption" muted style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
                {s.label}
              </Text>
            ))}
          </Row>
          {main.axes.map((a, i) => (
            <Row key={a.testId}>
              <Text variant="small" style={{ flex: 2 }}>
                {a.label}
              </Text>
              {series.map(({ s }) => {
                const v = s.axes[i]?.score;
                return (
                  <Text key={s.label} variant="small" style={{ flex: 1, textAlign: 'right' }}>
                    {v == null ? '—' : `${num(v, 1)}/20`}
                  </Text>
                );
              })}
            </Row>
          ))}
        </View>
      ) : null}
    </View>
  );
}
