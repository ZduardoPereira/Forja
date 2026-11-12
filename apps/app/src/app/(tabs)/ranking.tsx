import { RANKING_LABELS } from '@forja/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TabHeader } from '@/components/activity';
import { Competicoes, Testes } from '@/components/records';
import { Avatar, Badge, Card, Chip, ChipStrip, Empty, ErrorBox, Flame, Loading, Row, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { num } from '@/lib/format';
import { useRankings } from '@/lib/queries';
import type { RankingBoardId, RankingEntry } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

type Tab = RankingBoardId | 'recordes' | 'competicoes';
const TABS: { value: Tab; label: string }[] = [
  { value: 'streak', label: '🔥 Sequência' },
  { value: 'physical', label: '💪 Atributos físicos' },
  { value: 'evolution', label: '📈 Evolução' },
  { value: 'recordes', label: '🏅 Recordes' },
  { value: 'competicoes', label: '🏆 Competições' },
];
const MEDALS = ['🥇', '🥈', '🥉'];

function valueText(board: RankingBoardId, e: RankingEntry): string {
  if (board === 'streak') return `${e.value} ${e.value === 1 ? 'dia' : 'dias'}`;
  if (board === 'physical') return `${num(e.value, 1)} pts`;
  return `${num(e.value, 0)} pts`;
}

function Podium({ board, list }: { board: RankingBoardId; list: RankingEntry[] }) {
  const { c } = useTheme();
  const top = list.filter((e) => e.qualifies).slice(0, 3);
  if (!top.length) return null;
  // 2º, 1º, 3º (o primeiro no meio, mais alto)
  const order = [top[1], top[0], top[2]];
  return (
    <Row style={{ alignItems: 'flex-end', justifyContent: 'center' }} gap={space.md}>
      {order.map((e, i) =>
        e ? (
          <Pressable
            key={e.user.id}
            onPress={() => router.push(`/people/${e.user.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${e.rank}º lugar: ${e.user.name}, ${valueText(board, e)}`}
            style={{ alignItems: 'center', gap: 4, flex: 1, maxWidth: 130 }}
          >
            <Text style={{ fontSize: i === 1 ? 30 : 22 }}>{MEDALS[e.rank - 1] ?? `${e.rank}º`}</Text>
            <Avatar name={e.user.name} file={e.user.avatar} size={i === 1 ? 64 : 48} />
            <Text variant="bodyStrong" numberOfLines={1}>
              {e.user.name.split(' ')[0]}
            </Text>
            <Text variant="small" color={c.accent} style={{ fontFamily: font.semibold }}>
              {valueText(board, e)}
            </Text>
            <View style={{ height: i === 1 ? 54 : i === 0 ? 36 : 24, alignSelf: 'stretch', borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: i === 1 ? c.accentSoft : c.surfaceAlt }} />
          </Pressable>
        ) : (
          <View key={`vazio-${i}`} style={{ flex: 1, maxWidth: 130 }} />
        ),
      )}
    </Row>
  );
}

function Board({ board }: { board: RankingBoardId }) {
  const rankings = useRankings();
  const { me } = useAuth();
  const { c } = useTheme();
  const [how, setHow] = useState(false);
  if (rankings.isLoading) return <Loading />;
  if (rankings.error) return <ErrorBox error={rankings.error} onRetry={() => void rankings.refetch()} />;
  const list = rankings.data!.boards[board];
  const label = RANKING_LABELS[board];
  const mine = list.find((e) => e.user.id === me?.id);
  return (
    <>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">{label.title}</Text>
          <Text variant="small" color={c.accent} onPress={() => setHow(!how)} accessibilityRole="button">
            {how ? 'Fechar' : 'Como funciona?'}
          </Text>
        </Row>
        {how ? <Text variant="small" muted>{label.how}</Text> : null}
        {mine ? (
          <Text variant="small" muted>
            {mine.qualifies ? `Você: ${mine.rank}º lugar com ${valueText(board, mine)}.` : `Você ainda não pontua aqui. ${mine.detail}`}
          </Text>
        ) : null}
      </Card>
      <Podium board={board} list={list} />
      <Card padded={false} style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        {list.map((e) => {
          const isMe = e.user.id === me?.id;
          return (
            <Pressable
              key={e.user.id}
              onPress={() => router.push(isMe ? '/perfil' : `/people/${e.user.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${e.qualifies ? `${e.rank}º` : 'Sem pontos'}: ${e.user.name}, ${valueText(board, e)}. ${e.detail}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, opacity: pressed ? 0.7 : e.qualifies ? 1 : 0.55 })}
            >
              <Text variant="bodyStrong" style={{ width: 30 }} color={e.qualifies && e.rank === 1 ? c.accent : c.textMuted}>
                {e.qualifies ? `${e.rank}º` : '—'}
              </Text>
              <Avatar name={e.user.name} file={e.user.avatar} size={36} online={e.user.online} />
              <View style={{ flex: 1, gap: 1 }}>
                <Row gap={space.sm}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {isMe ? `${e.user.name} (você)` : e.user.name}
                  </Text>
                  {rankings.data!.leaders[board] === e.user.id ? <Badge label="Líder" tone="accent" /> : null}
                </Row>
                <Text variant="small" faint numberOfLines={2}>
                  {e.detail}
                </Text>
              </View>
              {board === 'streak' ? <Flame n={e.value} /> : <Text style={{ fontFamily: font.semibold }}>{e.qualifies ? valueText(board, e) : '—'}</Text>}
            </Pressable>
          );
        })}
        {!list.length ? <Empty icon="users" title="Ninguém no grupo ainda" /> : null}
      </Card>
    </>
  );
}

export default function Ranking() {
  const params = useLocalSearchParams<{ board?: string }>();
  const [tab, setTab] = useState<Tab>('streak');
  useEffect(() => {
    if (params.board && TABS.some((t) => t.value === params.board)) setTab(params.board as Tab);
  }, [params.board]);
  const rankings = useRankings();
  return (
    <Screen tab refreshing={rankings.isRefetching} onRefresh={() => void rankings.refetch()}>
      <TabHeader title="Ranking" subtitle="Quem treina todo dia, quem tem o melhor físico e quem mais evolui" />
      <ChipStrip>
        {TABS.map((t) => (
          <Chip key={t.value} label={t.label} selected={tab === t.value} onPress={() => setTab(t.value)} />
        ))}
      </ChipStrip>
      {tab === 'recordes' ? <Testes /> : tab === 'competicoes' ? <Competicoes /> : <Board board={tab} />}
    </Screen>
  );
}
