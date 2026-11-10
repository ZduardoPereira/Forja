import { fireEvent, render, screen } from '@testing-library/react-native';
import { StandingCard } from '@/components/competition';
import type { StandingView } from '@/lib/types';
import { Providers } from './helpers';

const standing: StandingView = {
  userId: 'u2',
  name: 'Bruno',
  goal: 'gain_muscle',
  rank: 2,
  total: 71.5,
  body: { status: 'ok', points: 80, weight: 50, summary: 'Gordura +0,2 kg · massa magra +1,1 kg em 6 sem.' },
  performance: { status: 'ok', points: 60, weight: 30, summary: 'Média de 2 teste(s) comparado(s) com o início.' },
  consistency: { status: 'ok', points: 65, weight: 20, summary: '12 dia(s) ativo(s)' },
  tests: [{ testId: 'bench', base: 80, current: 86, improvementPct: 7.5, points: 50 }],
  user: { id: 'u2', name: 'Bruno', avatar: null, goal: 'gain_muscle', isAdmin: false, lastSeenAt: null, online: false },
  weekChange: 3.2,
};

describe('classificação', () => {
  it('mostra posição, pontos, distância do líder e abre o detalhamento', async () => {
    await render(
      <Providers>
        <StandingCard s={standing} me={false} leaderTotal={80} />
      </Providers>,
    );
    expect(screen.getByText('2º')).toBeTruthy();
    expect(screen.getByText('71,5')).toBeTruthy();
    expect(screen.getByText('−8,5 do 1º')).toBeTruthy();
    expect(screen.getByText('Ganhar massa')).toBeTruthy();
    expect(screen.queryByText('Corpo · peso 50')).toBeNull();
    await fireEvent.press(screen.getByLabelText('2º Bruno, 71,5 pontos'));
    expect(screen.getByText('Corpo · peso 50')).toBeTruthy();
    expect(screen.getByText('Supino: +7,5% → 50 pts')).toBeTruthy();
  });
});
