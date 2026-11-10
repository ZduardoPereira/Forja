import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { BodyPanel, ProfileHeader, RadarCard, TestsPanel } from '@/components/profile';
import { Empty, ErrorBox, Loading, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { relativeDay } from '@/lib/format';
import { useMembers } from '@/lib/queries';

export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const members = useMembers();
  const [tab, setTab] = useState<'tests' | 'body'>('tests');
  if (me && id === me.id) return <Redirect href="/perfil" />;
  const person = members.data?.find((m) => m.id === id);
  return (
    <Screen>
      <Stack.Screen options={{ title: person?.name ?? 'Perfil' }} />
      {members.isLoading ? <Loading /> : members.error ? <ErrorBox error={members.error} onRetry={() => void members.refetch()} /> : null}
      {members.data && !person ? <Empty icon="user-x" title="Pessoa não encontrada" /> : null}
      {person && me ? (
        <>
          <ProfileHeader
            name={person.name}
            avatar={person.avatar}
            goal={person.goal}
            online={person.online}
            subtitle={person.online ? 'online agora' : person.lastSeenAt ? `visto: ${relativeDay(person.lastSeenAt).toLowerCase()}` : null}
          />
          <RadarCard
            userId={person.id}
            name={person.name.split(' ')[0]!}
            initialCompare={me.id}
            compareOptions={[{ id: me.id, name: 'Você' }, ...(members.data ?? []).filter((m) => m.id !== me.id && m.id !== person.id).map((m) => ({ id: m.id, name: m.name.split(' ')[0]! }))]}
          />
          <Segmented
            options={[
              { value: 'tests', label: 'Testes' },
              { value: 'body', label: 'Corpo' },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'tests' ? <TestsPanel userId={person.id} own={false} /> : <BodyPanel userId={person.id} own={false} name={person.name.split(' ')[0]!} />}
        </>
      ) : null}
    </Screen>
  );
}
