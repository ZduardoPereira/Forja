import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { EventListCard } from '@/components/events';
import { Button, Empty, ErrorBox, Loading, Screen, Segmented, Text } from '@/components/ui';
import { useEvents } from '@/lib/queries';
import { space } from '@/theme/tokens';

/** Treinos marcados com o grupo (dia, hora e local; presença e conversa de cada um). */
export default function Agenda() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const events = useEvents(scope);
  return (
    <Screen refreshing={events.isRefetching} onRefresh={() => void events.refetch()}>
      <Text muted>Combine dia, hora e local para treinar junto. Quem confirma recebe lembrete 1 hora antes, e cada treino tem sua conversa.</Text>
      <Button title="Marcar treino com o grupo" icon="plus" onPress={() => router.push('/events/new')} />
      <Segmented
        options={[
          { value: 'upcoming', label: 'Próximos' },
          { value: 'past', label: 'Anteriores' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {events.isLoading ? (
        <Loading />
      ) : events.error ? (
        <ErrorBox error={events.error} onRetry={() => void events.refetch()} />
      ) : events.data?.length ? (
        <View style={{ gap: space.md }}>
          {events.data.map((e) => (
            <EventListCard key={e.id} event={e} />
          ))}
        </View>
      ) : (
        <Empty
          icon="calendar"
          title={scope === 'upcoming' ? 'Nada marcado por enquanto' : 'Nenhum treino anterior'}
          message={scope === 'upcoming' ? 'Marque um treino: a galera recebe o aviso e confirma presença.' : undefined}
        />
      )}
    </Screen>
  );
}
