# Testes físicos, radar 0–20 e ranking da competição

Tudo aqui está implementado em `packages/shared/src` (`tests.ts`, `strength.ts`, `competition.ts`) e
é calculado **no servidor** — o app só mostra. Os números ficam em um só lugar para o grupo ajustar.

## Os 11 testes

| Teste | Unidade | Melhor é | Radar = 0 | Radar = 20 | Força sem peso registrado | Melhora que vale 100 pts na competição |
|---|---|---|---|---|---|---|
| Velocidade máxima | km/h | maior | 12 | 36 | — | 10% |
| 100 metros | s | menor | 22,0 s | 11,0 s | — | 8% |
| 1 km | s | menor | 8:00 | 2:40 | — | 10% |
| 5 km | s | menor | 45:00 | 15:00 | — | 10% |
| 10 km | s | menor | 1:30:00 | 31:00 | — | 10% |
| Agachamento | kg | maior | 0,5× o peso | 2,5× o peso | 40–200 kg | 15% |
| Supino | kg | maior | 0,4× o peso | 1,8× o peso | 30–150 kg | 15% |
| Levantamento terra | kg | maior | 0,75× o peso | 3× o peso | 60–240 kg | 15% |
| Barras | reps | maior | 0 | 25 | — | 40% |
| Flexões | reps | maior | 0 | 70 | — | 40% |
| Abdominais (1 min) | reps | maior | 10 | 60 | — | 30% |

Cada tela de teste no app mostra o **protocolo** (como fazer), o histórico em gráfico e o ranking do grupo.
Os tempos aceitam `12,4` (segundos), `4:05` (min:s) ou `1:02:03` (h:min:s).

### Força (powerlifting)
- **1RM estimado (Epley):** carga × (1 + reps/30). Com 1 repetição vale a própria carga. O app aceita de 1 a 12 reps e marca como estimativa.
- **Ranking de força entre pessoas de pesos diferentes:** pontuação **DOTS** (padrão do powerlifting), que precisa do sexo no perfil e de um peso registrado até a data do teste. Sem isso, a pessoa entra no fim da lista, ordenada por carga.
- **Total de powerlifting:** agachamento + supino + terra (melhor 1RM de cada), também em DOTS.
- O peso corporal **do dia do teste** é guardado junto do resultado.

### "Eu vi"
Amigos podem confirmar o resultado de outra pessoa ("eu vi"); ninguém confirma o próprio. Serve como selo de confiança — não muda a pontuação.

## Radar 0–20 (perfil)
Escala no estilo ficha de personagem, com anéis em 4, 8, 12, 16 e 20:
- **Tempos:** interpolação linear na **velocidade** (distância ÷ tempo), não no tempo — assim melhorar 30 s nos 5 km vale o mesmo esforço em qualquer nível.
- **Força:** 1RM ÷ peso corporal (do dia do teste; se não houver, o peso atual; se não houver nenhum, as âncoras absolutas em kg).
- **Repetições e km/h:** interpolação linear direta.
- Abaixo do "0" fica 0; acima do "20" fica 20. **Nível geral** = média dos eixos com resultado.

As âncoras são uma **convenção do app** (iniciante → muito avançado), não uma norma científica, e são as mesmas para homens e mulheres. Se o grupo quiser, ajuste `radar` em `packages/shared/src/tests.ts`.

## Ranking da competição (justo para objetivos diferentes)

O problema: uns querem **emagrecer**, outros **ganhar massa**. Comparar "kg perdidos" com "kg ganhos" não é justo.
A solução: cada pessoa é comparada com o **ritmo saudável esperado para o próprio objetivo**, no próprio corpo, no tempo decorrido. Bater o ritmo esperado vale **100 pontos** naquele bloco.

Nota final (0–100) = média ponderada de três blocos (pesos configuráveis por competição; padrão **50 / 30 / 20**):

### 1. Corpo (50%)
Ritmos esperados (= 100 pontos):
- **Emagrecer:** perder gordura no ritmo de **0,5% do peso inicial por semana**.
- **Ganhar massa:** ganhar massa magra no ritmo de **1% (iniciante), 0,5% (intermediário) ou 0,25% (avançado) do peso por mês** — a experiência vem do perfil.
- **Recomposição:** metade de cada ritmo, média dos dois lados.
- **Performance:** o corpo não conta; o peso desse bloco é redistribuído entre os outros.

Com avaliação de composição (bioimpedância, dobras, DEXA, balança inteligente):
- Emagrecer: `razão = (gordura perdida − 0,5 × massa magra perdida) ÷ gordura esperada`
- Ganhar massa: `razão = (massa magra ganha − 0,5 × excesso de gordura ganha além da massa magra) ÷ massa magra esperada`

Só com o peso (sem % de gordura) a nota sai com **confiança baixa** e: emagrecer usa a perda de peso; ganhar massa considera metade do ganho como massa magra e no máximo 100 pontos; recomposição precisa de avaliação.

Conversão da razão em pontos: até 1× o esperado sobe linearmente (0,5× = 50 pts); entre **1× e 1,5× = 100 pts**; acima de 1,5× **cai** (até no mínimo 60), porque perder ou ganhar rápido demais não é saudável e não deve ser incentivado.

**Linha de base:** a medida mais recente até 30 dias antes do início ou, se não houver, a primeira até 14 dias depois. O objetivo pode ser trocado até 7 dias depois do início.

### 2. Testes (30%)
Para cada teste feito no início (mesma janela da linha de base) e repetido durante a competição:
`pontos = melhora% ÷ melhora que vale 100` (tabela acima), limitado a 0–100. A nota do bloco é a média dos testes repetidos.
Ex.: 5 km de 30:00 → 27:00 = 10% mais rápido = 100 pontos. **Importa quem evoluiu, não quem é mais forte.**

### 3. Constância (20%)
Dias ativos por semana (treino registrado em "Treino feito" **ou** presença confirmada em treino marcado) ÷ meta semanal da competição (padrão 3), limitado a 100.

### Exemplo (testado em `packages/shared/test/competition.test.ts`)
Ana (emagrecer) perde gordura exatamente no ritmo esperado e Bruno (ganhar massa) ganha massa magra no ritmo esperado: **os dois fazem 100 pontos no bloco Corpo**, mesmo com objetivos opostos.

## Privacidade
- Resultados de **testes** são visíveis para o grupo (é a graça do ranking).
- **Números do corpo** (peso, % de gordura, avaliações) só aparecem para os amigos se a pessoa ativar "Mostrar meus números do corpo ao grupo". A competição sempre usa os dados para calcular; para quem não compartilha, os outros veem **só os pontos** do bloco Corpo — as variações (ex.: "Gordura −1,7 kg") aparecem apenas para a própria pessoa. Isso evita que alguém estime o peso do outro a partir dos pontos.
- **Fotos:** cada foto é "Só eu" ou "Grupo". Laudos e planos alimentares são sempre privados.
- **Strava:** só a própria pessoa vê (regra do Strava) — ver [STRAVA.md](STRAVA.md).

## Os três rankings permanentes (versão 2.1)
Valem o tempo todo, sem precisar criar competição (aba **Ranking**):

| Ranking | O que conta | Detalhes |
|---|---|---|
| 🔥 **Sequência** | dias seguidos com atividade | Conta treino do assistente, atividade marcada ou presença confirmada em treino marcado. Dá para registrar até 2 dias para trás; um dia inteiro em branco zera. Empate: vence o maior recorde. |
| 💪 **Atributos físicos** | soma das notas 0–20 dos 11 testes (máx. 220) | É a soma dos eixos do radar: quem faz mais testes e vai melhor em cada um sobe. Força conta em relação ao peso corporal. |
| 📈 **Evolução no objetivo** | 0–100 pontos | A mesma conta do bloco "Corpo" da competição, nos últimos 90 dias, a partir da primeira medida da pessoa: emagrecer, ganhar massa e recomposição pelo corpo; **performance** pela melhora nos testes. 100 = no ritmo saudável esperado (ou até 1,5× ele); acima disso cai, para não incentivar ritmo exagerado. Precisa de pelo menos 7 dias entre a primeira e a última medida. |

Quando o 1º lugar de um ranking muda, o novo líder e quem perdeu a liderança recebem notificação, e o resto do grupo vê no sininho. Empate com quem já liderava não troca o líder. A conferência roda logo depois de cada mudança (atividade, teste, pesagem, avaliação, objetivo) e na virada do dia.

Quem não mostra os números do corpo ao grupo aparece na Evolução só com os pontos (o resumo, que revelaria o peso, fica escondido para os outros).
