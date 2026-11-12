import { EXPERIENCE_LABELS, type Experience, GOAL_HINTS, GOAL_LABELS, type Goal } from '@forja/shared';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { date, num, relativeDay } from '@/lib/format';
import { useActivityCalendar, useBody, useRankings } from '@/lib/queries';
import type { FileRef, RankingBoardId } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { ActivityCalendar } from './activity';
import { BodyPanel, RadarCard, TestsPanel } from './profile';
import { Avatar, Badge, Button, Card, Flame, Icon, type IconName, Row, Segmented, Text, useWide } from './ui';

interface Person {
  id: string;
  name: string;
  avatar: FileRef | null;
  goal: Goal;
  experience?: Experience;
  bio?: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
  isAdmin?: boolean;
}

function Tile({ label, value, hint, children, onPress }: { label: string; value?: string; hint?: string | null; children?: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value ?? ''}. ${hint ?? ''}`}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: 140, minWidth: 0, padding: space.md, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 4, opacity: pressed ? 0.75 : 1 })}
    >
      <Text variant="caption" muted>
        {label}
      </Text>
      {children ?? <Text style={{ fontFamily: font.semibold, fontSize: 24, letterSpacing: -0.6 }}>{value}</Text>}
      {hint ? (
        <Text variant="small" faint numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, minWidth: 72, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={c.accent} size={20} />
      </View>
      <Text variant="small" style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const BOARD_SHORT: Record<RankingBoardId, string> = { streak: 'Sequência', physical: 'Físico', evolution: 'Evolução' };

/** Perfil (o seu ou de um amigo): o essencial em cima, os detalhes nas abas. */
export function ProfileView({ person, own, compareOptions, initialCompare = null }: { person: Person; own: boolean; compareOptions: { id: string; name: string }[]; initialCompare?: string | null }) {
  const { c } = useTheme();
  const wide = useWide();
  const userId = own ? undefined : person.id;
  const cal = useActivityCalendar(userId);
  const body = useBody(userId);
  const rankings = useRankings();
  const [tab, setTab] = useState<'overview' | 'body' | 'tests'>('overview');
  const first = person.name.split(' ')[0]!;

  const entry = (b: RankingBoardId) => rankings.data?.boards[b].find((e) => e.user.id === person.id);
  const physical = entry('physical');
  const positions = (['streak', 'physical', 'evolution'] as RankingBoardId[]).map((b) => ({ b, e: entry(b) }));
  const weight = body.data?.numbersVisible ? body.data.latest?.weight : null;
  const target = body.data?.targetWeightKg;

  return (
    <>
      <Card>
        <Row gap={space.lg} style={{ alignItems: 'center' }}>
          <Avatar name={person.name} file={person.avatar} size={wide ? 88 : 72} online={person.online} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="display" numberOfLines={1}>
              {person.name}
            </Text>
            <Row gap={space.sm} wrap>
              <Badge label={GOAL_LABELS[person.goal]} tone="accent" />
              {person.experience ? <Badge label={EXPERIENCE_LABELS[person.experience].split(' (')[0]!} /> : null}
              {person.isAdmin ? <Badge label="Admin" /> : null}
            </Row>
            {!own ? (
              <Text variant="small" muted>
                {person.online ? 'online agora' : person.lastSeenAt ? `visto: ${relativeDay(person.lastSeenAt).toLowerCase()}` : ''}
              </Text>
            ) : null}
          </View>
          {own ? <Button title="Editar" icon="edit-2" small kind="secondary" onPress={() => router.push('/settings')} /> : null}
        </Row>
        {person.bio ? <Text muted>{person.bio}</Text> : own ? <Text variant="small" faint>{GOAL_HINTS[person.goal]} Escreva uma bio em Editar.</Text> : null}
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Tile label="Sequência" hint={cal.data ? (cal.data.streak.doneToday ? 'Já treinou hoje' : cal.data.streak.current ? 'Falta treinar hoje' : `Recorde: ${cal.data.streak.best}`) : null}>
          <Flame n={cal.data?.streak.current ?? 0} size="large" />
        </Tile>
        <Tile
          label="Peso"
          value={weight ? `${num(weight.weightKg, 1)} kg` : '—'}
          hint={body.data && !body.data.numbersVisible ? 'Privado' : weight ? `${date(weight.date, true)}${target ? ` · meta ${num(target, 1)} kg` : ''}` : own ? 'Toque para registrar' : 'Sem pesagem'}
          onPress={own ? () => router.push('/body/weigh-in') : undefined}
        />
        <Tile
          label="Atributos físicos"
          value={physical?.qualifies ? `${num(physical.value, 0)} / 220` : '—'}
          hint={physical?.qualifies ? `${String(physical.extra.tests)} de 11 testes` : own ? 'Faça um teste físico' : 'Sem testes'}
          onPress={() => setTab('tests')}
        />
        <Tile label="Rankings" onPress={() => router.push('/ranking')} hint="Toque para ver">
          <View style={{ gap: 2 }}>
            {positions.map(({ b, e }) => (
              <Row key={b} style={{ justifyContent: 'space-between' }}>
                <Text variant="small" muted>
                  {BOARD_SHORT[b]}
                </Text>
                <Text variant="small" style={{ fontFamily: font.semibold }} color={e?.qualifies && e.rank === 1 ? c.accent : c.text}>
                  {e?.qualifies ? `${e.rank}º` : '—'}
                </Text>
              </Row>
            ))}
          </View>
        </Tile>
      </View>

      {own ? (
        <Card>
          <Row style={{ justifyContent: 'space-around', alignItems: 'flex-start' }}>
            <Action icon="trending-down" label="Registrar peso" onPress={() => router.push('/body/weigh-in')} />
            <Action icon="zap" label="Novo teste" onPress={() => setTab('tests')} />
            <Action icon="activity" label="Treinar" onPress={() => router.push('/treinar')} />
            <Action icon="coffee" label="Dieta" onPress={() => router.push('/dieta')} />
          </Row>
        </Card>
      ) : null}

      <Segmented
        options={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'body', label: 'Corpo' },
          { value: 'tests', label: 'Testes' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'overview' ? (
        <>
          <ActivityCalendar userId={userId} name={own ? 'Você' : first} />
          <RadarCard userId={userId} name={own ? 'Você' : first} compareOptions={compareOptions} initialCompare={initialCompare} />
        </>
      ) : tab === 'body' ? (
        <BodyPanel userId={userId} own={own} name={first} />
      ) : (
        <>
          {own ? (
            <Text variant="small" muted>
              Toque num teste para registrar o resultado. Cada um vale de 0 a 20 no radar e soma no ranking de atributos físicos.
            </Text>
          ) : null}
          <TestsPanel userId={userId} own={own} />
        </>
      )}
    </>
  );
}
