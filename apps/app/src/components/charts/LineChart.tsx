import { useMemo, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { date as fmtDate, num } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { Row, Text } from '../ui';

export interface LinePoint {
  date: string;
  value: number;
}
export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: LinePoint[];
}

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);

/** Passos "redondos" para o eixo Y (1, 2, 2,5, 5 × 10^n, ou os passos dados — ex.: 15 s, 30 s, 1 min). */
function niceTicks(min: number, max: number, count = 4, steps?: number[]): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.02);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = (steps ?? [1, 2, 2.5, 5, 10].map((m) => m * mag)).find((s) => s >= raw) ?? (steps ? Math.ceil(raw / steps.at(-1)!) * steps.at(-1)! : raw);
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

/**
 * Gráfico de linha temporal com UM eixo Y (nunca eixo duplo).
 * Linhas de 2 px, marcadores ≥ 8 px com anel da cor da superfície, grade discreta,
 * toque/hover mostra a data e os valores; "Ver tabela" dá a mesma informação em texto.
 */
export function LineChart({
  series,
  unit,
  digits = 1,
  height = 220,
  target,
  emptyText = 'Sem dados ainda.',
  format,
  tickFormat,
  tickSteps,
}: {
  series: LineSeries[];
  unit: string;
  digits?: number;
  height?: number;
  target?: { value: number; label: string } | null;
  emptyText?: string;
  /** Formato do valor (tooltip, tabela, rótulos). Padrão: número + unidade. */
  format?: (v: number) => string;
  tickFormat?: (v: number) => string;
  /** Passos permitidos no eixo Y (ex.: tempos). */
  tickSteps?: number[];
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const { visible, all, dates } = useMemo(() => {
    const v = series.filter((s) => s.points.length > 0);
    const pts = v.flatMap((s) => s.points);
    // Datas únicas (ordenadas): cursor do gráfico e linhas da tabela.
    return { visible: v, all: pts, dates: [...new Set(pts.map((p) => p.date.slice(0, 10)))].sort() };
  }, [series]);
  const multi = visible.length > 1;

  const geo = useMemo(() => {
    if (!all.length || !width) return null;
    const pad = { l: tickFormat ? 54 : 40, r: multi ? 56 : 16, t: 12, b: 26 };
    const values = all.map((p) => p.value).concat(target ? [target.value] : []);
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 4, tickSteps);
    const y0 = ticks[0]!;
    const y1 = ticks.at(-1)!;
    const times = all.map((p) => toTime(p.date));
    let t0 = Math.min(...times);
    let t1 = Math.max(...times);
    if (t0 === t1) {
      t0 -= 3 * DAY;
      t1 += 3 * DAY;
    }
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const x = (d: string) => pad.l + ((toTime(d) - t0) / (t1 - t0)) * iw;
    const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * ih;
    const xLabels = dates.length <= 2 ? dates : [dates[0]!, dates[Math.floor(dates.length / 2)]!, dates.at(-1)!];
    return { pad, ticks, x, y, iw, ih, xLabels: [...new Set(xLabels)] };
  }, [all, dates, width, height, target, multi, tickFormat, tickSteps]);

  if (!all.length) {
    return (
      <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <Text muted>{emptyText}</Text>
      </View>
    );
  }

  const nearestDate = (px: number) => {
    if (!geo) return null;
    let best = 0;
    let bestDist = Infinity;
    dates.forEach((d, i) => {
      const dist = Math.abs(geo.x(d) - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  };
  const pick = (e: GestureResponderEvent) => setActive(nearestDate(e.nativeEvent.locationX));
  const hoverProps =
    Platform.OS === 'web'
      ? {
          onMouseMove: (e: { nativeEvent: { offsetX: number } }) => setActive(nearestDate(e.nativeEvent.offsetX)),
          onMouseLeave: () => setActive(null),
        }
      : {};

  const activeDate = active != null && geo ? dates[active] : null;
  const valueAt = (s: LineSeries, d: string) => s.points.find((p) => p.date.slice(0, 10) === d)?.value;
  const fmt = format ?? ((v: number) => `${num(v, digits)} ${unit}`);
  const showDots = all.length <= 40;

  const path = (s: LineSeries) =>
    geo
      ? [...s.points]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((p, i) => `${i ? 'L' : 'M'}${geo.x(p.date).toFixed(1)},${geo.y(p.value).toFixed(1)}`)
          .join(' ')
      : '';

  const summary = visible
    .map((s) => {
      const last = [...s.points].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
      return `${s.label}: ${fmt(last.value)} em ${fmtDate(last.date)}`;
    })
    .join('; ');

  return (
    <View style={{ gap: space.sm }}>
      {multi ? (
        <Row gap={space.lg} wrap>
          {visible.map((s) => (
            <Row key={s.key} gap={6}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <Text variant="small" muted>
                {s.label}
              </Text>
            </Row>
          ))}
        </Row>
      ) : null}

      {/* Valor sob o cursor (fica acima do gráfico para não cobrir os dados). */}
      <View style={{ minHeight: 20 }}>
        {activeDate ? (
          <Row gap={space.md} wrap>
            <Text variant="small" muted>
              {fmtDate(activeDate)}
            </Text>
            {visible.map((s) => {
              const v = valueAt(s, activeDate);
              return v == null ? null : (
                <Text key={s.key} variant="small" style={{ fontFamily: font.semibold }}>
                  {multi ? `${s.label} ` : ''}
                  {fmt(v)}
                </Text>
              );
            })}
          </Row>
        ) : (
          <Text variant="small" faint>
            {Platform.OS === 'web' ? 'Passe o mouse no gráfico para ver os valores' : 'Toque no gráfico para ver os valores'}
          </Text>
        )}
      </View>

      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Gráfico. ${summary}`}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => true}
        {...(hoverProps as object)}
      >
        {geo ? (
          <Svg width={width} height={height} pointerEvents="none">
            {geo.ticks.map((t) => (
              <G key={t}>
                <Line x1={geo.pad.l} x2={width - geo.pad.r} y1={geo.y(t)} y2={geo.y(t)} stroke={c.grid} strokeWidth={1} />
                <SvgText x={geo.pad.l - 8} y={geo.y(t) + 4} fontSize={11} fontFamily={font.regular} fill={c.textFaint} textAnchor="end">
                  {tickFormat ? tickFormat(t) : num(t, t % 1 ? 1 : 0)}
                </SvgText>
              </G>
            ))}
            {geo.xLabels.map((d, i) => (
              <SvgText
                key={d}
                x={geo.x(d)}
                y={height - 6}
                fontSize={11}
                fontFamily={font.regular}
                fill={c.textFaint}
                textAnchor={geo.xLabels.length > 1 && i === 0 ? 'start' : i === geo.xLabels.length - 1 && geo.xLabels.length > 1 ? 'end' : 'middle'}
              >
                {fmtDate(d, true)}
              </SvgText>
            ))}
            {target ? (
              <G>
                <Line x1={geo.pad.l} x2={width - geo.pad.r} y1={geo.y(target.value)} y2={geo.y(target.value)} stroke={c.textFaint} strokeWidth={1} strokeDasharray="4 4" />
                <SvgText x={width - geo.pad.r} y={geo.y(target.value) - 6} fontSize={11} fontFamily={font.medium} fill={c.textMuted} textAnchor="end">
                  {target.label}
                </SvgText>
              </G>
            ) : null}
            {activeDate ? <Line x1={geo.x(activeDate)} x2={geo.x(activeDate)} y1={geo.pad.t} y2={height - geo.pad.b} stroke={c.border} strokeWidth={1} /> : null}
            {visible.map((s) => (
              <G key={s.key}>
                <Path d={path(s)} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                {s.points.map((p) => {
                  const isActive = activeDate === p.date.slice(0, 10);
                  if (!showDots && !isActive) return null;
                  return <Circle key={p.date} cx={geo.x(p.date)} cy={geo.y(p.value)} r={isActive ? 5.5 : 4} fill={s.color} stroke={c.surface} strokeWidth={2} />;
                })}
                {multi
                  ? (() => {
                      const last = [...s.points].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
                      return (
                        <SvgText x={geo.x(last.date) + 8} y={geo.y(last.value) + 4} fontSize={11} fontFamily={font.medium} fill={c.textMuted}>
                          {format ? format(last.value) : num(last.value, digits)}
                        </SvgText>
                      );
                    })()
                  : null}
              </G>
            ))}
          </Svg>
        ) : null}
      </View>

      <Pressable onPress={() => setTable((v) => !v)} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text variant="small" color={c.accent} style={{ fontFamily: font.medium }}>
          {table ? 'Ocultar tabela' : 'Ver tabela'}
        </Text>
      </Pressable>
      {table ? (
        <View style={{ borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.md, gap: 6 }}>
          <Row>
            <Text variant="caption" muted style={{ flex: 1 }}>
              Data
            </Text>
            {visible.map((s) => (
              <Text key={s.key} variant="caption" muted style={{ flex: 1, textAlign: 'right' }}>
                {s.label}
              </Text>
            ))}
          </Row>
          {dates
            .slice()
            .reverse()
            .map((d) => (
              <Row key={d}>
                <Text variant="small" style={{ flex: 1 }}>
                  {fmtDate(d)}
                </Text>
                {visible.map((s) => {
                  const v = valueAt(s, d);
                  return (
                    <Text key={s.key} variant="small" style={{ flex: 1, textAlign: 'right' }}>
                      {v == null ? '—' : fmt(v)}
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

/** Mini-gráfico sem eixos (cards). */
export function Sparkline({ points, width = 96, height = 32, color }: { points: LinePoint[]; width?: number; height?: number; color?: string }) {
  const { c } = useTheme();
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const vs = sorted.map((p) => p.value);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const t0 = toTime(sorted[0]!.date);
  const t1 = toTime(sorted.at(-1)!.date) || t0 + 1;
  const x = (d: string) => 2 + ((toTime(d) - t0) / Math.max(1, t1 - t0)) * (width - 4);
  const y = (v: number) => 2 + (1 - (v - min) / Math.max(1e-9, max - min)) * (height - 4);
  const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = sorted.at(-1)!;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={0} y={0} width={width} height={height} fill="transparent" />
      <Path d={d} stroke={color ?? c.chart1} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(last.date)} cy={y(last.value)} r={3} fill={color ?? c.chart1} />
    </Svg>
  );
}
