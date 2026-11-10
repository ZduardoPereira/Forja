import { ACTIVITY_LABELS, type RsvpStatus, RSVP_LABELS } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { CheckInPrompt, EVENT_KEYS, RsvpControl, useCheckIn } from '@/components/events';
import { confirm } from '@/components/forms';
import { Avatar, Badge, Button, Card, Divider, ErrorBox, Icon, ListItem, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { del } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeDay, time } from '@/lib/format';
import { invalidate, useEvent } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const ORDER: RsvpStatus[] = ['going', 'maybe', 'not_going'];

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useEvent(id);
  const { me } = useAuth();
  const { c } = useTheme();
  const check = useCheckIn(id);
  const cancel = useMutation({
    mutationFn: () => del(`/events/${id}`),
    onSuccess: () => invalidate(EVENT_KEYS),
  });

  if (event.isLoading) return <Loading />;
  if (event.error || !event.data) return <ErrorBox error={event.error} onRetry={() => void event.refetch()} />;
  const e = event.data;
  const mine = e.createdBy === me?.id;
  const end = new Date(Date.parse(e.startsAt) + e.durationMin * 60_000);

  return (
    <Screen>
      <Stack.Screen options={{ title: e.title }} />
      <View style={{ gap: space.sm }}>
        <Row gap={space.sm} wrap>
          <Badge label={ACTIVITY_LABELS[e.kind]} />
          {e.cancelledAt ? <Badge label="Cancelado" tone="danger" /> : e.started ? <Badge label="Já começou" /> : null}
        </Row>
        <Text variant="display">{e.title}</Text>
        <Row gap={space.sm}>
          <Icon name="clock" size={15} color={c.textMuted} />
          <Text muted>
            {relativeDay(e.startsAt)}, {time(e.startsAt)}–{time(end.toISOString())} ({e.durationMin} min)
          </Text>
        </Row>
        {e.location ? (
          <Row gap={space.sm}>
            <Icon name="map-pin" size={15} color={c.textMuted} />
            <Text muted>{e.location}</Text>
          </Row>
        ) : null}
        {e.creator ? (
          <Row gap={space.sm}>
            <Avatar name={e.creator.name} file={e.creator.avatar} size={20} />
            <Text variant="small" muted>
              Marcado por {mine ? 'você' : e.creator.name}
            </Text>
          </Row>
        ) : null}
        {e.description ? <Text style={{ marginTop: space.sm }}>{e.description}</Text> : null}
      </View>

      {!e.cancelledAt ? (
        <Card>
          {!e.started ? (
            <>
              <Text variant="heading">Você vai?</Text>
              <RsvpControl event={e} />
            </>
          ) : e.myAttended == null ? (
            <CheckInPrompt event={e} />
          ) : (
            <Row style={{ justifyContent: 'space-between' }} wrap>
              <Text>{e.myAttended ? '✓ Você confirmou presença' : 'Você marcou que não foi'}</Text>
              <Button title="Mudar" kind="ghost" small onPress={() => check.mutate(!e.myAttended)} loading={check.isPending} />
            </Row>
          )}
        </Card>
      ) : null}

      <Row wrap gap={space.sm}>
        {e.roomId ? <Button title="Conversa do treino" icon="message-circle" kind="secondary" onPress={() => router.push(`/chat/${e.roomId}`)} /> : null}
        {mine && !e.cancelledAt ? <Button title="Editar" icon="edit-2" kind="secondary" onPress={() => router.push({ pathname: '/events/new', params: { id: e.id } })} /> : null}
      </Row>

      <Section title="Presença">
        <Card padded={false} style={{ paddingHorizontal: space.lg }}>
          {e.attendees.length ? (
            [...e.attendees]
              .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
              .map((a, i) => (
                <View key={a.user.id}>
                  {i ? <Divider /> : null}
                  <ListItem
                    left={<Avatar name={a.user.name} file={a.user.avatar} size={34} online={a.user.online} />}
                    title={a.user.id === me?.id ? `${a.user.name} (você)` : a.user.name}
                    subtitle={a.attended === true ? 'Compareceu ✓' : a.attended === false ? 'Não foi' : null}
                    right={<Badge label={RSVP_LABELS[a.status]} tone={a.status === 'going' ? 'accent' : 'neutral'} />}
                    onPress={() => router.push(a.user.id === me?.id ? '/perfil' : `/people/${a.user.id}`)}
                  />
                </View>
              ))
          ) : (
            <Text muted style={{ paddingVertical: space.lg }}>
              Ninguém respondeu ainda.
            </Text>
          )}
        </Card>
      </Section>

      {e.routineDetail ? (
        <Section title={`Rotina: ${e.routineDetail.name}`} action={<Button title="Abrir" kind="ghost" small onPress={() => router.push(`/routines/${e.routineDetail!.id}`)} />}>
          <Card padded={false} style={{ paddingHorizontal: space.lg }}>
            {(e.routineDetail.exercises ?? []).map((x, i) => (
              <View key={`${x.id}-${i}`}>
                {i ? <Divider /> : null}
                <ListItem title={x.namePt} subtitle={`${x.sets} × ${x.reps}${x.restSec ? ` · descanso ${x.restSec}s` : ''}`} onPress={() => router.push(`/exercises/${x.id}`)} />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {mine && !e.cancelledAt ? (
        <Button
          title="Cancelar treino"
          kind="danger"
          loading={cancel.isPending}
          onPress={async () => {
            if (await confirm('Cancelar treino?', 'Todos verão que foi cancelado.', 'Cancelar treino')) cancel.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}
