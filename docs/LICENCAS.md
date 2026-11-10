# Licenças e créditos

> Resumo prático, não é aconselhamento jurídico.

## Catálogo de exercícios — openGym
O FORJA usa o **catálogo de texto** do [openGym](https://github.com/DuarteSantos8/openGym) (commit fixado em `apps/api/src/scripts/build-catalogue.ts`): 5.632 exercícios com nomes, músculos, descrições, instruções e traduções para o português, além de 4 planos prontos (Push/Pull/Legs, Superior/Inferior, Corpo inteiro e 5×5).

A licença do openGym (cópias em `apps/api/data/OPENGYM-LICENSE.txt` e `apps/api/data/OPENGYM-NOTICE.md`) divide o catálogo assim:

| Parte | Licença | Usada no FORJA? |
|---|---|---|
| Exercícios com `textSource: exercisedb` (1.324, origem ExerciseDB v1 via *hasaneyldrm/exercises-dataset*) | **MIT** | sim |
| Demais exercícios, descrições, correções e **todas as traduções (pt-BR)** | **AGPL-3.0** (openGym) | sim |
| Imagens e animações (Gym visual) | licença própria — **reuso proibido** | **não** |

Por isso o app **não mostra imagens dos exercícios** (usa só texto e ícones), e cada exercício guarda a origem do texto (`textSource`), exibida na tela do exercício.

### O que a AGPL-3.0 significa aqui
O FORJA incorpora dados licenciados pela AGPL. Na prática, para ficar em dia:
- mantenha a licença e o aviso do openGym junto dos dados (já está em `apps/api/data/`);
- disponibilize o **código-fonte do FORJA**, sob a AGPL-3.0, para quem usa o app (os amigos do grupo) — por exemplo, um repositório no GitHub ao qual eles têm acesso;
- se publicar o app para outras pessoas, faça o mesmo para elas.

Se um dia quiser o FORJA sem AGPL, dá para gerar o catálogo só com as entradas MIT (perde-se a tradução para o português e os exercícios mais novos).

## Outras dependências
- Fonte **Inter** — SIL Open Font License 1.1.
- Ícones **Feather** (via `@expo/vector-icons`) — MIT.
- Expo, React Native, React, TanStack Query, Express, Drizzle, Zod, sharp, PGlite e demais bibliotecas — licenças permissivas (MIT, Apache-2.0, BSD, ISC); veja `node_modules/*/LICENSE`.

## Strava
A integração segue o API Agreement e as diretrizes de marca do Strava: dados visíveis só para o dono, cache de até 7 dias, exclusão ao desconectar, botão "Conectar com o Strava" e o selo "Powered by Strava". Ver [STRAVA.md](STRAVA.md).

## Fórmulas
- 1RM estimado: Epley (1985).
- DOTS: fórmula pública usada no powerlifting (coeficientes em `packages/shared/src/strength.ts`).
- Gasto calórico: Mifflin-St Jeor (1990) e Katch-McArdle; metas de macronutrientes por objetivo. São estimativas gerais — o plano do nutricionista vale mais.
