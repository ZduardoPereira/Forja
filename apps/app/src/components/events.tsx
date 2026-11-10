import { ACTIVITY_LABELS, type RsvpStatus, RSVP_LABELS, RSVP_STATUSES } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { post, put } from '@/lib/api';
import { relativeDay, time } from '@/lib/format';
import { invalidate } from '@/lib/queries';
import type { EventView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Avatar, Badge, Button, Card, Icon, Row, Segmented, Text } from './ui';

export const EVENT_KEYS = [['events'], ['home'], ['event'], ['chat-rooms']];

export function useRsvp(eventId: string) {
  return useMutation({
    mutationFn: (status: RsvpStatus) => put<EventView>(`/events/${eventId}/rsvp`, { status }),
    onSuccess: () => invalidate(EVENT_KEYS),
  });
}

export function useCheckIn(eventId: string) {
  return useMutation({
    mutationFn: (attended: boolean) => post<EventView>(`/events/${eventId}/check-in`, { attended }),
    onSuccess: () => invalidate([...EVENT_KEYS, ['competition']]),
  });
}

export function RsvpControl({ event }: { event: EventView }) {
  const rsvp = useRsvp(event.id);
  return (
    <Segmented<RsvpStatus | 'none'>
      options={RSVP_STATUSES.map((s) => ({ value: s, label: RSVP_LABELS[s] }))}
      value={rsvp.isPending && rsvp.variables ? rsvp.variables : (event.myStatus ?? 'none')}
      onChange={(s) => s !== 'none' && rsvp.mutate(s)}
    />
  );
}

export function AttendeeStack({ event, max = 5 }: { event: EventView; max?: number }) {
  const { c } = useTheme();
  const going = event.attendees.filter((a) => a.status === 'going');
  return (
    <Row gap={space.sm}>
      <Row gap={0}>
        {going.slice(0, max).map((a, i) => (
          <View key={a.user.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 16, borderWidth: 2, borderColor: c.surface }}>
            <Avatar name={a.user.name} file={a.user.avatar} size={26} />
          </View>
        ))}
      </Row>
      <Text variant="small" muted>
        {going.length ? `${going.length} ${going.length === 1 ? 'vai' : 'vão'}` : 'Ninguém confirmou ainda'}
        {event.counts.maybe ? ` · ${event.counts.maybe} talvez` : ''}
      </Text>
    </Row>
  );
}

export function EventListCard({ event }: { event: EventView }) {
  const { c } = useTheme();
  const past = event.started;
  return (
    <Card onPress={() => router.push(`/events/${event.id}`)} label={`${event.title}, ${relativeDay(event.startsAt)} às ${time(event.startsAt)}`}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="caption" muted>
            {relativeDay(event.startsAt)} · {time(event.startsAt)} · {event.durationMin} min
          </Text>
          <Text variant="heading">{event.title}</Text>
          <Row gap={6} wrap>
            <Text variant="small" muted>
              {ACTIVITY_LABELS[event.kind]}
            </Text>
            {event.location ? (
              <Row gap={4}>
                <Icon name="map-pin" size={12} color={c.textMuted} />
                <Text variant="small" muted>
                  {event.location}
                </Text>
              </Row>
            ) : null}
            {event.routine ? (
              <Text variant="small" muted>
                · {event.routine.name}
              </Text>
            ) : null}
          </Row>
        </View>
        {event.cancelledAt ? <Badge label="Cancelado" tone="danger" /> : event.myStatus ? <Badge label={RSVP_LABELS[event.myStatus]} tone={event.myStatus === 'going' ? 'accent' : 'neutral'} /> : null}
      </Row>
      <AttendeeStack event={event} />
      {!past && !event.cancelledAt ? <RsvpControl event={event} /> : null}
      {past && !event.cancelledAt && event.myAttended == null ? <CheckInPrompt event={event} /> : null}
    </Card>
  );
}

export function CheckInPrompt({ event }: { event: EventView }) {
  const check = useCheckIn(event.id);
  return (
    <Row wrap gap={space.sm} style={{ justifyContent: 'space-between' }}>
      <Text variant="small" muted style={{ flexShrink: 1 }}>
        Você foi? Conta para a constância.
      </Text>
      <Row gap={space.sm}>
        <Button title="Fui" small icon="check" onPress={() => check.mutate(true)} loading={check.isPending && check.variables === true} />
        <Button title="Não fui" small kind="ghost" onPress={() => check.mutate(false)} loading={check.isPending && check.variables === false} />
      </Row>
    </Row>
  );
}
