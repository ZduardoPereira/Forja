import { ACTIVITY_KINDS, ACTIVITY_LABELS, type ActivityKind, addDays, eventSchema, localDateOf } from '@forja/shared';
import { useMutation } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { EVENT_KEYS } from '@/components/events';
import { DateField, isTime, TimeField } from '@/components/forms';
import { Button, Card, Chip, ChipGroup, ChipStrip, Field, Loading, Row, Screen, Text } from '@/components/ui';
import { post, put } from '@/lib/api';
import { errorText, today } from '@/lib/format';
import { invalidate, useEvent, useRoutines } from '@/lib/queries';
import type { EventView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const DURATIONS = [30, 45, 60, 90, 120];
const TIMES = ['06:00', '07:00', '12:00', '18:00', '19:00', '20:00'];

function dayLabel(d: string) {
  const t = today();
  if (d === t) return 'Hoje';
  if (d === addDays(t, 1)) return 'Amanhã';
  const dt = new Date(`${d}T12:00:00`);
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '');
}

export default function NewEvent() {
  const { id, routineId: routineParam } = useLocalSearchParams<{ id?: string; routineId?: string }>();
  const editing = useEvent(id ?? '');
  const routines = useRoutines();
  const { c } = useTheme();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ActivityKind>('strength');
  const [day, setDay] = useState(today());
  const [otherDay, setOtherDay] = useState(false);
  const [hour, setHour] = useState('19:00');
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState('');
  const [routineId, setRoutineId] = useState<string | null>(routineParam ?? null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    const e = editing.data;
    if (!id || !e || loaded) return;
    const start = new Date(e.startsAt);
    setTitle(e.title);
    setKind(e.kind);
    setDay(localDateOf(start));
    setHour(start.toTimeString().slice(0, 5));
    setDuration(e.durationMin);
    setLocation(e.location ?? '');
    setRoutineId(e.routineId);
    setDescription(e.description ?? '');
    setLoaded(true);
  }, [editing.data, id, loaded]);

  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));

  const save = useMutation({
    mutationFn: (body: unknown) => (id ? put<EventView>(`/events/${id}`, body) : post<EventView>('/events', body)),
    onSuccess: async (e) => {
      await invalidate(EVENT_KEYS);
      if (id) router.back();
      else router.replace(`/events/${e.id}`);
    },
    onError: (err) => setError(errorText(err)),
  });

  const submit = () => {
    if (!isTime(hour)) return setError('Horário inválido (use HH:MM)');
    const [h, m] = hour.split(':').map(Number);
    const [y, mo, d] = day.split('-').map(Number);
    const startsAt = new Date(y!, mo! - 1, d!, h!, m!).toISOString();
    const parsed = eventSchema.safeParse({
      title: title.trim() || `${ACTIVITY_LABELS[kind]}`,
      kind,
      startsAt,
      durationMin: duration,
      location: location.trim() || null,
      routineId,
      description: description.trim() || null,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    if (!id && Date.parse(startsAt) < Date.now() - 3_600_000) return setError('Esse horário já passou.');
    setError(null);
    save.mutate(parsed.data);
  };

  if (id && !loaded) return <Loading />;
  const myRoutines = (routines.data ?? []).filter((r) => r.mine);
  const starter = (routines.data ?? []).filter((r) => !r.ownerId);

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Editar treino' : 'Marcar treino' }} />
      <Card>
        <Field label="Título" value={title} onChangeText={setTitle} placeholder={`Ex.: ${kind === 'run' ? 'Corrida no parque' : 'Treino de perna'}`} maxLength={80} testID="event-title" />
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Tipo
          </Text>
          <ChipGroup options={ACTIVITY_KINDS.map((k) => ({ value: k, label: ACTIVITY_LABELS[k] }))} value={kind} onChange={setKind} />
        </View>
      </Card>

      <Card>
        <Text variant="small" muted>
          Dia
        </Text>
        <ChipStrip>
          {days.map((d) => (
            <Chip
              key={d}
              label={dayLabel(d)}
              selected={!otherDay && day === d}
              onPress={() => {
                setOtherDay(false);
                setDay(d);
              }}
            />
          ))}
          <Chip label="Outra data" icon="calendar" selected={otherDay} onPress={() => setOtherDay(true)} />
        </ChipStrip>
        {otherDay ? <DateField label="Data" value={day} onChange={setDay} quick={false} /> : null}
        <Row wrap gap={space.md} style={{ alignItems: 'flex-start' }}>
          <View style={{ flexBasis: 140, flexGrow: 1 }}>
            <TimeField label="Horário" value={hour} onChange={setHour} />
          </View>
        </Row>
        <Row wrap>
          {TIMES.map((t) => (
            <Chip key={t} label={t} selected={hour === t} onPress={() => setHour(t)} />
          ))}
        </Row>
        <Text variant="small" muted>
          Duração
        </Text>
        <Row wrap>
          {DURATIONS.map((m) => (
            <Chip key={m} label={m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)},5 h` : `${m / 60} h`} selected={duration === m} onPress={() => setDuration(m)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Field label="Local" value={location} onChangeText={setLocation} placeholder="Ex.: Smart Fit da Paulista" maxLength={120} />
        <View style={{ gap: space.sm }}>
          <Text variant="small" muted>
            Rotina (opcional)
          </Text>
          <Row wrap>
            <Chip label="Nenhuma" selected={!routineId} onPress={() => setRoutineId(null)} />
            {[...myRoutines, ...starter].map((r) => (
              <Chip key={r.id} label={r.planName ? `${r.name} · ${r.planName}` : r.name} selected={routineId === r.id} onPress={() => setRoutineId(r.id)} />
            ))}
          </Row>
        </View>
        <Field label="Detalhes (opcional)" value={description} onChangeText={setDescription} placeholder="Ex.: levar corda; depois açaí" multiline maxLength={1000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </Card>

      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title={id ? 'Salvar alterações' : 'Marcar e avisar o grupo'} icon={id ? 'check' : 'send'} onPress={submit} loading={save.isPending} testID="event-save" />
      {!id ? (
        <Text variant="small" faint style={{ textAlign: 'center' }}>
          O treino aparece na agenda de todos, ganha uma conversa própria e o grupo recebe uma mensagem no chat.
        </Text>
      ) : null}
    </Screen>
  );
}
