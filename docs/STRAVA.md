# Conectar com o Strava

## O que a integração faz
Cada pessoa conecta a **própria** conta do Strava (Perfil → Testes → "Conectar com o Strava", ou Configurações → Strava). O app lê as corridas dos últimos 180 dias e mostra **só para ela**:
- melhores tempos de **1 km, 5 km e 10 km** (dos "best efforts" do Strava; se faltar, estimados a partir de corridas com 100–105% da distância);
- **velocidade máxima** registrada;
- as 10 corridas mais recentes (distância, tempo e ritmo).

## Por que o Strava não preenche o ranking sozinho
As regras da API do Strava (API Agreement) só permitem mostrar os dados de uma pessoa **para ela mesma** — não para os amigos, nem em rankings. Por isso:
- os dados do Strava aparecem só na tela da própria pessoa (com "Powered by Strava");
- para competir, cada um **registra o resultado no teste** (a tela do Strava tem atalhos para os testes de 1 km, 5 km, 10 km e velocidade máxima);
- o resumo fica em cache por no máximo **7 dias**; ao **desconectar** (ou revogar no site do Strava) tudo que veio de lá é apagado e o acesso é revogado;
- os tokens ficam **cifrados** no banco (AES-256-GCM).

## Configurar (quem hospeda faz uma vez)
1. Entre em <https://www.strava.com/settings/api> com a sua conta e crie um aplicativo:
   - **Application Name:** FORJA (grupo)
   - **Website:** `https://SEU-DOMINIO`
   - **Authorization Callback Domain:** só o domínio, sem `https://` — ex.: `forja-amigos.duckdns.org` (para testar no PC: `localhost`).
2. Copie **Client ID** e **Client Secret** para o `.env` do servidor:
   ```env
   STRAVA_CLIENT_ID=123456
   STRAVA_CLIENT_SECRET=abc...
   ```
   O `PUBLIC_URL` precisa ser o endereço público do servidor (no `docker-compose.yml` ele é montado a partir de `DOMAIN`), porque o Strava devolve a pessoa para `PUBLIC_URL/v1/strava/callback`.
3. Reinicie: `docker compose up -d`.

### Limite de atletas (importante)
Apps novos no Strava começam em **"single player mode": só a conta dona do app consegue conectar**. Para os amigos conectarem, peça o aumento da capacidade de atletas no formulário do Strava Developer Program (link na própria página do seu app em strava.com/settings/api). Enquanto isso, quem não puder conectar registra os tempos manualmente — o ranking funciona igual.

### Desautorização automática (recomendado)
Se alguém revogar o acesso pelo site do Strava, o webhook apaga os dados dessa pessoa no FORJA. Defina um token qualquer em `STRAVA_WEBHOOK_VERIFY_TOKEN`, reinicie e registre a assinatura uma vez:
```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=SEU_CLIENT_ID \
  -F client_secret=SEU_CLIENT_SECRET \
  -F callback_url=https://SEU-DOMINIO/v1/strava/webhook \
  -F verify_token=O_MESMO_VALOR_DO_ENV
```

## Limites de uso
O Strava limita as chamadas por aplicativo (algo como 100 a cada 15 minutos e 1.000 por dia). O FORJA guarda o resumo por 6 horas e só deixa forçar a atualização a cada 10 minutos; cada atualização usa no máximo ~16 chamadas. Para um grupo de amigos sobra muito.

## No celular
O retorno da autorização volta direto para o app (`forja://strava` no APK, `exp://…` no Expo Go). No navegador, volta para `https://SEU-DOMINIO/strava`.
