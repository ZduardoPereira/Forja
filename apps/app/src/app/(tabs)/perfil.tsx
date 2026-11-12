import { router } from 'expo-router';
import { TabHeader } from '@/components/activity';
import { ProfileView } from '@/components/profile-view';
import { Button, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMembers } from '@/lib/queries';
import { space } from '@/theme/tokens';

export default function Perfil() {
  const { me } = useAuth();
  const members = useMembers();
  if (!me) return null;
  const others = (members.data ?? []).filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name.split(' ')[0]! }));
  return (
    <Screen tab>
      <TabHeader title="Perfil" />
      <ProfileView person={{ ...me, online: false }} own compareOptions={others} />
      <Row wrap gap={space.sm}>
        <Button title="Tutorial para o baiano" icon="book-open" small kind="ghost" onPress={() => router.push('/tutorial')} />
        <Button title="Configurações" icon="settings" small kind="ghost" onPress={() => router.push('/settings')} />
        {me.isAdmin ? <Button title="Administração" icon="shield" small kind="ghost" onPress={() => router.push('/admin')} /> : null}
      </Row>
    </Screen>
  );
}
