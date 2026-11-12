/**
 * Tutorial para o baiano: tudo o que o FORJA faz, em partes que abrem e fecham,
 * cada uma com o passo a passo e um botão que leva direto para a tela.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Icon, Row, Screen, Text } from '@/components/ui';
import { storage } from '@/lib/storage';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface Part {
  emoji: string;
  title: string;
  intro: string;
  steps: string[];
  tip?: string;
  open?: { label: string; href: string };
}

const PARTS: Part[] = [
  {
    emoji: '👋',
    title: 'Primeiro: o que é o FORJA',
    intro: 'O app do nosso grupo para treinar junto, acompanhar a evolução de cada um e competir de um jeito justo, mesmo com objetivos diferentes.',
    steps: [
      'Embaixo ficam as abas: Início, Treinar, Dieta, Ranking e Perfil (no PC, na barra da esquerda).',
      'No topo de cada aba: o balão abre o chat e o sininho abre as notificações (o número mostra o que é novo).',
      'Complete seu perfil (objetivo, altura, data de nascimento e sexo): é com isso que o app calcula sua meta de calorias, a força relativa e a sua evolução.',
    ],
    open: { label: 'Completar meu perfil', href: '/settings' },
  },
  {
    emoji: '🔥',
    title: 'Sequência de dias',
    intro: 'Quantos dias seguidos você fez alguma atividade. Todo mundo do grupo vê a de todo mundo.',
    steps: [
      'Treinou com o assistente? Já conta sozinho.',
      'Fez outra coisa (corrida, futebol, funcional, caminhada)? No Início, toque em "Marcar atividade de hoje" e escolha o que foi.',
      'O dia vale até a meia-noite. Às 20h o app avisa se você ainda não marcou.',
      'Esqueceu de marcar? Dá para registrar até 2 dias para trás. Passou disso, só um administrador corrige.',
      'Um dia inteiro sem nada e a sequência zera. Seu recorde fica guardado.',
    ],
    tip: 'No Início, "Hoje no grupo" mostra quem já treinou hoje e a sequência de cada um.',
    open: { label: 'Ir para o Início', href: '/' },
  },
  {
    emoji: '🏋️',
    title: 'Treinar com o assistente',
    intro: 'O assistente é para usar NA academia: ele mostra os exercícios da rotina, você anota cada série e ele conta o descanso.',
    steps: [
      'Na aba Treinar, toque na rotina do dia (ou em "Treino livre").',
      'Em cada série, digite o peso (kg) e as repetições e toque no ✓.',
      'O descanso começa sozinho embaixo da tela. Dá para pôr ±15 segundos ou pular. O celular vibra no fim.',
      'A coluna "Anterior" mostra o que você fez da última vez: tente bater!',
      'Toque no tempo de descanso de um exercício para mudar (45 s, 1 min, 1:30, 2 min, 3 min).',
      'No fim, toque em "Finalizar". Aparece o resumo com tempo, volume (kg levantados) e os recordes que você bateu.',
    ],
    tip: 'Fechou o app sem querer no meio do treino? Ele continua salvo: abra de novo e toque em "Continuar treino".',
    open: { label: 'Abrir Treinar', href: '/treinar' },
  },
  {
    emoji: '📋',
    title: 'Rotinas (montar o treino)',
    intro: 'Rotina é o plano: quais exercícios, quantas séries, quantas repetições e quanto descanso.',
    steps: [
      'Treinar → Minhas rotinas → "Nova".',
      'Dê um nome (ex.: "Peito e tríceps") e adicione os exercícios buscando no catálogo (mais de 5 mil, em português).',
      'Para cada um, diga séries, repetições (pode ser faixa, como 8-12) e descanso.',
      'Sem ideia? Em "Planos prontos" tem PPL, Superior/Inferior, Corpo inteiro e 5×5: é só treinar ou copiar e ajustar.',
    ],
    open: { label: 'Montar rotina', href: '/routines/edit' },
  },
  {
    emoji: '📅',
    title: 'Treinos marcados com o grupo',
    intro: 'Para combinar dia, hora e local de treinar junto.',
    steps: [
      'Treinar → "Marcar treino com o grupo" (ou no Início).',
      'Todo mundo recebe o aviso e responde Vou, Talvez ou Não vou.',
      'Cada treino marcado tem a própria conversa no chat.',
      'Quem confirmou recebe um lembrete 1 hora antes. Se o horário mudar ou o treino for cancelado, também chega aviso.',
      'Depois do treino, confirme a presença no próprio treino: conta como atividade do dia.',
    ],
    open: { label: 'Ver a agenda', href: '/agenda' },
  },
  {
    emoji: '🍽️',
    title: 'Dieta',
    intro: 'Monte sua dieta refeição por refeição. O app soma as calorias e os macros e compara com a sua meta do dia.',
    steps: [
      'Aba Dieta → "Montar minha dieta".',
      'Meta do dia: use a do seu nutricionista ou toque em "Usar a estimativa do meu perfil".',
      'Em cada refeição, toque em "Adicionar alimento", busque (arroz, frango, ovo, banana…) e diga a quantidade. Dá para escolher a medida caseira (1 concha, 1 unidade).',
      'Alimento que não está na lista? Use "Escrever à mão" com os números do rótulo.',
      'Tem o plano do nutricionista em papel? Anexe as fotos no fim.',
    ],
    tip: 'Sua dieta é só sua: ninguém do grupo vê.',
    open: { label: 'Abrir Dieta', href: '/dieta' },
  },
  {
    emoji: '⚖️',
    title: 'Corpo: peso, avaliações e fotos',
    intro: 'Acompanhe o peso no gráfico, guarde as avaliações do nutricionista e as fotos de progresso.',
    steps: [
      'Registrar peso: Início → "Registrar peso" (dá para pôr fotos do dia). Pese sempre no mesmo horário, de preferência ao acordar.',
      'Avaliação (bioimpedância, dobras): Perfil → aba Corpo → "Avaliação do nutricionista". Anote o que tiver e anexe a foto do laudo.',
      'Fotos de progresso podem ser "Só eu" ou "Grupo".',
      'Seus números (peso, % de gordura) ficam escondidos do grupo, a menos que você ligue "mostrar meu corpo ao grupo" em Configurações.',
    ],
    open: { label: 'Registrar peso', href: '/body/weigh-in' },
  },
  {
    emoji: '💪',
    title: 'Testes físicos',
    intro: 'São 11 testes: velocidade, 100 m, 1, 5 e 10 km, agachamento, supino, terra, barras, flexões e abdominais. Cada um vale de 0 a 20.',
    steps: [
      'Perfil → aba Testes → toque no teste e registre o resultado.',
      'Na força, pode registrar o peso com as repetições: o app estima o seu máximo (1RM). A força conta em relação ao seu peso corporal.',
      'O radar do perfil mostra suas notas. Dá para comparar com um amigo.',
      'Amigos podem tocar em "Eu vi" para confirmar o seu resultado.',
      'Corre com o Strava? Conecte em Configurações para puxar seus tempos de 1, 5 e 10 km.',
    ],
    open: { label: 'Ver meus testes', href: '/perfil' },
  },
  {
    emoji: '🏆',
    title: 'Rankings',
    intro: 'Três rankings que valem o tempo todo (mais os recordes por teste e as competições por período).',
    steps: [
      '🔥 Sequência: quem tem mais dias seguidos com atividade.',
      '💪 Atributos físicos: a soma das notas dos 11 testes (máximo 220). Quem faz mais testes e vai melhor sobe.',
      '📈 Evolução no objetivo: quem está progredindo melhor no PRÓPRIO objetivo. Quem quer emagrecer é comparado com o ritmo saudável de perda de gordura; quem quer ganhar massa, com o de ganho de massa magra. 100 pontos = no ritmo ideal. Assim dá para competir de igual para igual.',
      'Quando alguém assume ou perde o 1º lugar, chega aviso.',
      'Competições: um período (ex.: 12 semanas) que junta corpo, testes e constância. Crie em Ranking → Competições.',
    ],
    open: { label: 'Abrir Ranking', href: '/ranking' },
  },
  {
    emoji: '🔔',
    title: 'Notificações',
    intro: 'O sininho junta os avisos: treino marcado, 1º lugar, marcos de sequência, gente nova no grupo e avisos do administrador.',
    steps: [
      'Para receber com o app fechado: abra Notificações e toque em "Ativar notificações".',
      'Android: funciona no FORJA instalado pelo Chrome. No APK, os avisos aparecem no sininho e no topo da tela enquanto o app está aberto.',
      'iPhone: no Safari, toque em Compartilhar (□↑) → "Adicionar à Tela de Início", abra pelo ícone novo e ative (iOS 16.4 ou mais novo).',
      'Em Notificações, escolha o que chega no aparelho: treinos, chat, rankings, sequência e novidades do grupo.',
    ],
    open: { label: 'Abrir Notificações', href: '/notificacoes' },
  },
  {
    emoji: '💬',
    title: 'Chat',
    intro: 'O chat do grupo e uma conversa para cada treino marcado.',
    steps: [
      'Toque no balão no topo da tela (no PC, "Chat" na barra lateral).',
      'Mande texto ou foto (o botão da imagem, à esquerda).',
      'Mandou errado? Toque e segure a mensagem para apagar.',
    ],
    open: { label: 'Abrir o chat', href: '/chat' },
  },
  {
    emoji: '📱',
    title: 'Instalar o app',
    intro: 'O FORJA funciona no navegador, mas instalado fica com ícone e tela cheia.',
    steps: [
      'Android: baixe o APK no link que o grupo passou (termina em /forja.apk) e permita "instalar apps desconhecidos" para o Chrome. Ou no Chrome: menu ⋮ → "Instalar app".',
      'iPhone: Safari → Compartilhar (□↑) → "Adicionar à Tela de Início".',
      'PC: no Chrome ou Edge, o ícone "Instalar" na barra de endereço.',
      'Quando sair uma versão nova do APK, aparece um aviso no Início para baixar. É só instalar por cima: nada se perde.',
    ],
  },
  {
    emoji: '❓',
    title: 'Dúvidas rápidas',
    intro: 'O que mais perguntam.',
    steps: [
      'Esqueci a senha: peça ao administrador uma senha temporária e troque em Configurações depois de entrar.',
      'Quem vê o quê: sequência, treinos marcados, testes e rankings, o grupo todo vê. Dieta, números do corpo e fotos "Só eu", só você vê.',
      'Errei uma atividade: apague em Treinar → Histórico (as de mais de 2 dias, peça ao administrador).',
      'O app diz "sem conexão": o servidor pode estar desligado. Avise quem cuida dele.',
    ],
  },
];

export default function Tutorial() {
  const { c } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen>
      <View style={{ gap: space.sm }}>
        <Text variant="display">Tutorial para o baiano</Text>
        <Text muted>Tudo o que o FORJA faz, passo a passo. Leia tudo de uma vez ou só a parte que interessa: toque no título para abrir.</Text>
      </View>
      {PARTS.map((p, i) => {
        const isOpen = open === i;
        return (
          <Card key={p.title} padded={false}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}
            >
              <Text style={{ fontSize: 24 }}>{p.emoji}</Text>
              <Text variant="heading" style={{ flex: 1 }}>
                {i + 1}. {p.title}
              </Text>
              <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} color={c.textMuted} />
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
                <Text>{p.intro}</Text>
                {p.steps.map((s, j) => (
                  <Row key={j} gap={space.md} style={{ alignItems: 'flex-start' }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Text variant="small" color={c.accent}>
                        {j + 1}
                      </Text>
                    </View>
                    <Text variant="small" style={{ flex: 1 }}>
                      {s}
                    </Text>
                  </Row>
                ))}
                {p.tip ? (
                  <Text variant="small" muted>
                    💡 {p.tip}
                  </Text>
                ) : null}
                <Row gap={space.sm} wrap>
                  {p.open ? <Button title={p.open.label} small onPress={() => router.push(p.open!.href as never)} /> : null}
                  {i < PARTS.length - 1 ? <Button title="Próxima parte" small kind="ghost" onPress={() => setOpen(i + 1)} /> : null}
                </Row>
              </View>
            ) : null}
          </Card>
        );
      })}
      <Button
        title="Entendi, bora treinar!"
        icon="check"
        onPress={() => {
          void storage.set('forja.tutorial-dispensado', '1');
          router.replace('/');
        }}
      />
    </Screen>
  );
}
