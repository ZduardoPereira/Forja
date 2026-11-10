import { fireEvent, render, screen } from '@testing-library/react-native';
import { LineChart } from '@/components/charts/LineChart';
import { RadarChart, radarOverall } from '@/components/charts/RadarChart';
import type { RadarAxisView } from '@/lib/types';
import { Providers } from './helpers';

const axes: RadarAxisView[] = [
  { testId: 'max_speed', label: 'Vel. máx', score: 14 },
  { testId: 'sprint_100m', label: '100 m', score: 10.5 },
  { testId: 'run_1k', label: '1 km', score: null },
  { testId: 'squat', label: 'Agach.', score: 12 },
];

describe('gráficos', () => {
  it('radar 0–20: nível geral e tabela com as duas pessoas', async () => {
    await render(
      <Providers>
        <RadarChart main={{ label: 'Você', axes }} compare={{ label: 'Bruno', axes: axes.map((a) => ({ ...a, score: a.score == null ? 5 : a.score - 2 })) }} />
      </Providers>,
    );
    expect(radarOverall(axes)).toBeCloseTo(12.17, 1);
    await fireEvent.press(screen.getByText('Ver tabela'));
    expect(screen.getByText('10,5/20')).toBeTruthy();
    expect(screen.getByText('8,5/20')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bruno').length).toBeGreaterThan(0);
  });

  it('linha do peso: estado vazio, tabela e descrição acessível', async () => {
    const { rerender } = await render(
      <Providers>
        <LineChart series={[{ key: 'w', label: 'Peso', color: '#000', points: [] }]} unit="kg" emptyText="Registre seu peso" />
      </Providers>,
    );
    expect(screen.getByText('Registre seu peso')).toBeTruthy();
    await rerender(
      <Providers>
        <LineChart
          series={[
            {
              key: 'w',
              label: 'Peso',
              color: '#000',
              points: [
                { date: '2026-10-01', value: 84.2 },
                { date: '2026-11-01', value: 81.6 },
              ],
            },
          ]}
          unit="kg"
          target={{ value: 78, label: 'Meta 78 kg' }}
        />
      </Providers>,
    );
    await fireEvent.press(screen.getByText('Ver tabela'));
    expect(screen.getByText('84,2 kg')).toBeTruthy();
    expect(screen.getByText('01/11/2026')).toBeTruthy();
    expect(screen.getByLabelText(/Peso: 81,6 kg em 01\/11\/2026/)).toBeTruthy();
  });
});
