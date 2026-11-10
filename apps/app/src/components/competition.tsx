import { GOAL_LABELS, TEST_BY_ID } from '@forja/shared';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { num } from '@/lib/format';
import type { ComponentView, StandingView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { Avatar, Badge, Card, Icon, Row, Text } from './ui';

export function HowItWorks() {
  const { c } = useTheme();
  const line = (title: string, text: string) => (
    <View style={{ gap: 2 }}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="small" muted>
        {text}
      </Text>
    </View>
  );
  return (
    <Card style={{ backgroundColor: c.surfaceAlt, borderWidth: 0 }}>
      <Text variant="caption" muted>
        Como o ranking é justo com objetivos diferentes
      </Text>
      {line(
        'Corpo (padrão 50%)',
        'Cada um é comparado com o ritmo saudável do PRÓPRIO objetivo. Emagrecer: perder gordura no ritmo de 0,5% do peso por semana vale 100 pontos (perder massa magra junto desconta). Ganhar massa: ganhar massa magra no ritmo esperado para sua experiência (1%, 0,5% ou 0,25% do peso por mês) vale 100 (ganhar mais gordura que músculo desconta).',
      )}
      {line('Testes (padrão 30%)', 'Quanto VOCÊ melhorou nos seus testes desde o início. Ex.: 10% mais rápido nos 5 km = 100 pontos. Não importa quem é mais forte, e sim quem evoluiu mais.')}
      {line('Constância (padrão 20%)', 'Dias com treino registrado ou presença confirmada em treino marcado, comparados com a meta semanal.')}
      <Text variant="small" faint>
        Ir mais rápido que 1,5× o ritmo esperado tira pontos — perder peso rápido demais não é saudável. Sem avaliação com % de gordura, o corpo conta só pelo peso (confiança menor). Objetivo
        &quot;Performance&quot;: o corpo não conta e o peso dele vai para os outros blocos.
      </Text>
    </Card>
  );
}

function Part({ label, part }: { label: string; part: ComponentView }) {
  const { c } = useTheme();
  const na = part.status === 'not_applicable';
  return (
    <View style={{ gap: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="small" muted>
          {label}
          {na ? '' : ` · peso ${part.weight}`}
        </Text>
        <Text variant="small" style={{ fontFamily: font.semibold }}>
          {na ? 'não conta' : part.status === 'no_data' ? 'sem dados' : `${num(part.points, 0)} pts`}
        </Text>
      </Row>
      {!na ? (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ width: `${Math.max(0, Math.min(100, part.points))}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
        </View>
      ) : null}
      <Text variant="small" faint>
        {part.summary}
        {part.lowConfidence ? ' · confiança baixa' : ''}
      </Text>
    </View>
  );
}

export function StandingCard({ s, me, leaderTotal }: { s: StandingView; me: boolean; leaderTotal: number }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(me);
  return (
    <Card style={me ? { borderColor: c.accent, borderWidth: 1 } : undefined}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${s.rank}º ${s.name}, ${num(s.total, 1)} pontos`}>
        <Row gap={space.md}>
          <Text variant="title" color={s.rank === 1 ? c.accent : c.textMuted} style={{ width: 34 }}>
            {s.rank}º
          </Text>
          <Avatar name={s.user.name} file={s.user.avatar} size={38} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">
              {s.name}
              {me ? ' (você)' : ''}
            </Text>
            <Row gap={6}>
              <Badge label={GOAL_LABELS[s.goal]} />
              {s.weekChange != null ? (
                <Text variant="small" color={s.weekChange >= 0 ? c.success : c.danger}>
                  {s.weekChange >= 0 ? '▲' : '▼'} {num(Math.abs(s.weekChange), 1)} na semana
                </Text>
              ) : null}
            </Row>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="metric" style={{ fontSize: 24, lineHeight: 28 }}>
              {num(s.total, 1)}
            </Text>
            <Text variant="small" faint>
              {s.rank > 1 && leaderTotal > s.total ? `−${num(leaderTotal - s.total, 1)} do 1º` : 'pontos'}
            </Text>
          </View>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} color={c.textFaint} size={16} />
        </Row>
      </Pressable>
      {open ? (
        <View style={{ gap: space.md, paddingTop: space.sm }}>
          <Part label="Corpo" part={s.body} />
          <Part label="Testes" part={s.performance} />
          {s.tests.length ? (
            <View style={{ gap: 4, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: c.border }}>
              {s.tests.map((t) => (
                <Text key={t.testId} variant="small" muted>
                  {TEST_BY_ID[t.testId].name}: {t.improvementPct >= 0 ? '+' : ''}
                  {num(t.improvementPct, 1)}% → {num(t.points, 0)} pts
                </Text>
              ))}
            </View>
          ) : null}
          <Part label="Constância" part={s.consistency} />
        </View>
      ) : null}
    </Card>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const { c } = useTheme();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: c.surfaceAlt, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: c.text }} />
    </View>
  );
}
