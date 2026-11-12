import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { ProfileView } from '@/components/profile-view';
import { Empty, ErrorBox, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMembers } from '@/lib/queries';

export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const members = useMembers();
  if (me && id === me.id) return <Redirect href="/perfil" />;
  const person = members.data?.find((m) => m.id === id);
  return (
    <Screen>
      <Stack.Screen options={{ title: person?.name ?? 'Perfil' }} />
      {members.isLoading ? <Loading /> : members.error ? <ErrorBox error={members.error} onRetry={() => void members.refetch()} /> : null}
      {members.data && !person ? <Empty icon="user-x" title="Pessoa não encontrada" /> : null}
      {person && me ? (
        <ProfileView
          person={person}
          own={false}
          initialCompare={me.id}
          compareOptions={[{ id: me.id, name: 'Você' }, ...(members.data ?? []).filter((m) => m.id !== me.id && m.id !== person.id).map((m) => ({ id: m.id, name: m.name.split(' ')[0]! }))]}
        />
      ) : null}
    </Screen>
  );
}
