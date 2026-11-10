# FORJA

App privado para treinar com os amigos — **um só app para PC (navegador/PWA) e Android**.

- **Perfil** com nome e senha (sem e-mail), foto, objetivo e o **radar 0–20** dos testes físicos, com comparação entre amigos.
- **Treinos marcados:** marque dia, hora e local; os amigos respondem *Vou / Talvez / Não vou*; cada treino ganha uma conversa e o grupo recebe o aviso no chat. Depois, cada um confirma a presença.
- **Testes físicos:** velocidade máxima, 100 m, 1 km, 5 km e 10 km; agachamento, supino e terra (1RM estimado + pontuação **DOTS**); barras, flexões e abdominais. Histórico em gráfico, ranking do grupo e "eu vi" dos amigos.
- **Strava:** cada um conecta a própria conta e vê os melhores tempos de 1/5/10 km e a velocidade máxima (visível só para si, pelas regras do Strava).
- **Corpo:** gráfico de peso com meta, avaliações do nutricionista (% de gordura, massa magra, massa gorda, músculo, gordura visceral, água, metabolismo, medidas) com **foto do laudo**, gráficos de composição e fotos de progresso (privadas ou do grupo).
- **Dieta:** estimativa de calorias e macros e o plano do nutricionista (refeições + fotos do plano).
- **Treino (openGym):** catálogo de 5.632 exercícios em português, planos prontos (PPL, Superior/Inferior, Corpo inteiro, 5×5) e rotinas próprias.
- **Competição justa** entre quem quer emagrecer e quem quer ganhar massa: cada um é comparado com o ritmo saudável do próprio objetivo — ver [docs/TESTES_E_RANKING.md](docs/TESTES_E_RANKING.md).
- **Chat** do grupo e por treino, em tempo real, com fotos.
- Visual minimalista (tema escuro/claro), barra lateral no PC e abas embaixo no celular.

## Colocar no ar para os amigos
Passo a passo em **[docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md)** — resumo:
1. Crie uma VM Ubuntu (Oracle Cloud grátis ou outra VPS), libere as portas 80/443 e aponte o domínio para o IP.
2. No PC, com `deploy.local.json` preenchido (IP, chave SSH e domínio): `npm run server:setup` uma vez e `npm run deploy` a cada atualização. Sobe com HTTPS automático e backup diário.
3. **PC:** abra o endereço no Chrome/Edge → "Instalar". **Android:** Chrome → "Instalar app", ou o APK (`npm run apk`).

Sem servidor: dá para deixar rodando no seu próprio PC Windows (`npm run pc:install` e `npm run pc:tunnel`, com Tailscale Funnel). Ao entrar no Windows, ele pergunta se você quer ligar o servidor; ligado, fica um ícone perto do relógio. Parado, usa ~0% de CPU e ~300 MB de RAM.

APK do Android gerado no próprio PC, sem conta na Expo: `npm run apk` (sai em `apk\FORJA.apk` e fica para baixar em `https://<endereço>/forja.apk`).

## Rodar no seu PC (desenvolvimento)
Requisitos: Node 20+ (testado no 24).
```bash
npm install
cp apps/api/.env.example apps/api/.env   # preencha SECRET (comando no arquivo)
npm run api:dev                          # API em http://localhost:3333 (banco embutido, sem instalar Postgres)
npm run web                              # app no navegador em http://localhost:8081
npm run app                              # Expo Go no celular (leia o QR code)
```
Para o Expo Go no celular, `apps/app/.env` aponta para o IP do PC na rede: `EXPO_PUBLIC_API_URL=http://192.168.x.x:3333`.
Para servir o site compilado pela própria API (como em produção): `npm run build` e acesse <http://localhost:3333>.

## Estrutura
```
apps/api        API (Express + Drizzle + PostgreSQL/PGlite): contas, corpo, testes, competição, treinos, chat (WebSocket), Strava, fotos
apps/app        App Expo (Android + web): telas em src/app, componentes em src/components, gráficos em src/components/charts
packages/shared Regras e fórmulas usadas no app e no servidor: testes, radar, DOTS, nutrição, competição, validação
docs/           Hospedagem, Strava, testes e ranking, licenças, openapi.json (75 rotas)
tools/assets    Gerador dos ícones (npm run assets:build)
tools/deploy    Publicação no servidor: setup, deploy, status, logs, backup, rollback (npm run deploy / server:*)
tools/host      Rodar no próprio PC Windows: supervisor, backup diário, FORJA Servidor (pergunta ao ligar + ícone), Tailscale (npm run pc:*)
tools/android   APK do Android gerado no PC: Java 17 + Android SDK em C:\forja-apk, assinatura em credentials/ (npm run apk)
```

## Verificação
```bash
npm test          # 59 testes: regras 20 · API 31 · app 8
npm run typecheck
```
A interface foi conferida no navegador (PC e largura de celular, temas escuro e claro) com fluxos reais: entrar, marcar treino, aviso no chat, mensagem com foto e registro de peso.

## Documentação
- [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md) — VPS/Docker, PC + Tailscale Funnel, APK, PWA, backup, Raspberry Pi
- [docs/TESTES_E_RANKING.md](docs/TESTES_E_RANKING.md) — testes, radar 0–20, DOTS e a lógica do ranking
- [docs/STRAVA.md](docs/STRAVA.md) — como conectar e o que o Strava permite
- [docs/LICENCAS.md](docs/LICENCAS.md) — openGym (AGPL-3.0/MIT, sem mídias) e demais créditos
- `docs/openapi.json` — todas as rotas da API

A versão anterior (v0) foi guardada em `.legacy/forja-v0-2026-10-26.zip` (fora do git).
