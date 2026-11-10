import { EXPERIENCE_LABELS } from '@forja/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { BodyPanel, DietPanel, ProfileHeader, RadarCard, TestsPanel } from '@/components/profile';
import { IconButton, Screen, Segmented, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMembers } from '@/lib/queries';

type Tab = 'tests' | 'body' | 'diet';

export default function Perfil() {
  const { me } = useAuth();
  const members = useMembers();
  const [tab, setTab] = useState<Tab>('tests');
  if (!me) return null;
  const others = (members.data ?? []).filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name.split(' ')[0]! }));
  return (
    <Screen tab>
      <ProfileHeader name={me.name} avatar={me.avatar} goal={me.goal} subtitle={EXPERIENCE_LABELS[me.experience]} right={<IconButton icon="settings" label="Configurações" onPress={() => router.push('/settings')} />} />
      {me.bio ? <Text muted>{me.bio}</Text> : null}
      <RadarCard name="Você" compareOptions={others} />
      <Segmented
        options={[
          { value: 'tests', label: 'Testes' },
          { value: 'body', label: 'Corpo' },
          { value: 'diet', label: 'Dieta' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'tests' ? <TestsPanel own /> : tab === 'body' ? <BodyPanel own name={me.name} /> : <DietPanel />}
    </Screen>
  );
}
