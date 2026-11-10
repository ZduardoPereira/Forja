# Colocar o FORJA no ar para o grupo

O FORJA é **um servidor só**: ele entrega o site (PC e navegador do celular), a API do app Android, o chat em tempo real e as fotos. Basta deixar esse servidor ligado com um endereço HTTPS e passar para os amigos:
1. o endereço (ex.: `https://forja-amigos.duckdns.org`);
2. o **código do grupo** (`INVITE_CODE`), exigido para criar conta.

A primeira conta criada vira **administradora** (pode gerar senha temporária para quem esquecer e remover pessoas).

## Qual opção escolher

| Opção | Custo | Fica sempre no ar? | Esforço | Para quem |
|---|---|---|---|---|
| **A. Oracle Cloud (ou outra VPS), publicado do PC** | grátis a ~R$ 30/mês | sim | médio, uma vez | grupo usando todo dia, PC desligado à noite |
| **B. Seu PC (Windows) + Tailscale Funnel** | grátis (só a luz do PC) | enquanto o PC e o servidor estiverem ligados | baixo | começar já, sem VPS nem cartão |

Recursos: para poucas pessoas o FORJA usa ~200–300 MB de RAM com Postgres (A) ou ~300–450 MB com o banco embutido (B). Cada foto é convertida para WebP (~100–300 KB).

---

## A. Oracle Cloud "Always Free" (ou outra VPS) — publicado do seu PC

O PC compila o app e envia só o resultado (~7 MB); o servidor apenas roda. Por isso funciona até na VM grátis de 1 GB.
Comandos usados aqui: `ssh`, `scp` e `tar`, que já vêm no Windows 10/11, macOS e Linux.

### 1. Criar a VM (painel da Oracle)
Menu ☰ → **Compute → Instances → Create instance**:
- **Name:** `forja`.
- **Image:** *Change image* → **Canonical Ubuntu 24.04**.
- **Shape:** *Change shape* → **Ampere → VM.Standard.A1.Flex** com **2 OCPUs e 12 GB** (o limite grátis).
  Se aparecer *Out of capacity*, tente outro *Availability domain*, tente mais tarde ou use **AMD → VM.Standard.E2.1.Micro** (1 GB, também grátis).
- **Networking:** deixe criar a rede nova (*new virtual cloud network* + *public subnet*), com **IPv4 público automático** ligado.
- **Add SSH keys:** *Upload public key files (.pub)* → `C:\Users\<você>\.ssh\forja_oracle.pub`.
  Se ainda não tiver a chave: `ssh-keygen -t rsa -b 4096 -f ~/.ssh/forja_oracle -N ""`.
- **Create.** Quando ficar *Running*, copie o **Public IP address**.

### 2. Liberar as portas 80 e 443 (Security List)
Na página da VM → *Primary VNIC* → clique na **Subnet** → aba **Security** → **Default Security List** → *Security rules* → **Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(O firewall de dentro da VM o script ajusta sozinho.)

### 3. Apontar o domínio para o IP
- **DuckDNS:** em <https://www.duckdns.org>, no seu subdomínio, cole o IP em *current ip* → **update ip**.
- **Domínio próprio:** crie um registro **A** (nome `@` ou o subdomínio) com o IP da VM. No Cloudflare, deixe **DNS only** (nuvem cinza).

### 4. Publicar do PC
Crie `deploy.local.json` na raiz do projeto (fica fora do git):
```json
{ "host": "IP-DA-VM", "user": "ubuntu", "key": "~/.ssh/forja_oracle", "domain": "seu.dominio" }
```
E rode:
```bash
npm run server:setup     # uma vez: Docker, firewall, swap, segredos, backup diário
npm run deploy           # compila, envia e sobe com HTTPS
```
O `server:setup` mostra o **código do grupo** gerado (para escolher um: `node tools/deploy/forja-server.mjs setup --invite MEU-CODIGO`).
Os segredos (`SECRET`, senha do banco) são gerados no próprio servidor, em `/opt/forja/.env`, e não saem de lá.

Abra `https://SEU-DOMINIO`, crie a sua conta (vira admin) e mande o endereço + código para os amigos.

### Dia a dia

| Comando | O que faz |
|---|---|
| `npm run deploy` | publica a versão atual do código (use a cada atualização; o banco é migrado sozinho) |
| `npm run server:status` | versão no ar, containers, disco, memória e últimos backups |
| `npm run server:logs` | acompanha os logs (Ctrl+C sai) |
| `npm run server:backup` | faz um backup agora e baixa para a pasta `backups/` do PC |
| `npm run server:rollback` | volta para a versão publicada anterior |
| `npm run server:ssh` | abre um terminal no servidor |

Trocar o código do grupo: `node tools/deploy/forja-server.mjs setup --invite NOVO-CODIGO` e depois `npm run deploy`.

### Cuidados com a Oracle
- **VM grátis "ociosa" pode ser recolhida:** pela regra da Oracle, CPU e rede abaixo de 20% por 7 dias (na A1, memória também). Um app para poucos amigos fica abaixo disso. Fazer upgrade da conta para **Pay As You Go** evita isso (relatos de usuários e e-mails da própria Oracle). Dentro dos limites *Always Free* continua sem custo. Crie um alerta de orçamento (*Billing → Budgets*) de US$ 1 por segurança.
- Os recursos grátis só valem na **região de origem** da conta.
- Guarde backups no PC de vez em quando: `npm run server:backup`.

### Backup e restauração
Todo dia às 4h o servidor guarda o banco e as fotos em `/opt/forja/backups` (14 dias). `npm run server:backup` baixa os mais novos para `backups/` no PC.

Restaurar (no PC, depois `npm run server:ssh`):
```bash
# no PC: envie os arquivos
scp -i ~/.ssh/forja_oracle backups/db-AAAA-MM-DD_HHMM.sql.gz backups/fotos-AAAA-MM-DD_HHMM.tgz ubuntu@IP:/tmp/
# no servidor:
cd /opt/forja/app
gunzip -c /tmp/db-AAAA-MM-DD_HHMM.sql.gz | docker compose exec -T db psql -U forja -d forja
docker compose exec -T forja tar -xzf - -C /data < /tmp/fotos-AAAA-MM-DD_HHMM.tgz
```

### Sem o script (qualquer VPS com Docker)
1. Instale o Docker (`curl -fsSL https://get.docker.com | sh`) e libere 80/443 no firewall (`ufw allow 80,443/tcp`).
2. Leve o projeto para a VPS (repositório privado + `git clone`, ou `scp -r` sem `node_modules`).
3. `cp .env.example .env` e preencha `DOMAIN`, `SECRET` (`openssl rand -hex 32`), `INVITE_CODE` e `POSTGRES_PASSWORD`.
4. `docker compose up -d --build` — aqui o site é compilado dentro do Docker, então precisa de ~2 GB de RAM (ou 1 GB + swap).
5. Atualizar: `git pull && docker compose up -d --build`. Backup: `tools/deploy/backup.sh` serve também (ajuste as pastas).

---

## B. Seu PC (Windows) + Tailscale Funnel

O servidor roda escondido no PC (sem janela, com um ícone perto do relógio), separado da pasta do projeto, e o **Tailscale Funnel** dá um endereço **HTTPS fixo e grátis** (`https://forja.sua-rede.ts.net`). Não precisa mexer no roteador e funciona mesmo com internet sem IP público (CGNAT). Os amigos não instalam nada.

Consumo medido num Ryzen 5 5500 com 16 GB:

| Situação | CPU | Memória |
|---|---|---|
| parado | ~0% (0,04%) | ~290 MB |
| login | 0,03 s | — |
| cada tela/requisição | 0,02 s | ~390 MB |
| foto de 12 MP | 0,36 s | ~450 MB |

Disco: ~60 MB de banco, mais ~300 KB por foto. O gasto de verdade é deixar o PC ligado o dia todo.

### Instalar
1. Na pasta do projeto: **`npm run pc:install`**. Ele:
   - compila o app;
   - instala em `%USERPROFILE%\FORJA` (fora do OneDrive, para o banco não ser sincronizado no meio de uma gravação);
   - cria `forja.env` com os segredos e o código do grupo;
   - cria o atalho **"FORJA Servidor"** no menu Iniciar e faz o Windows **perguntar, ao entrar, se você quer ligar o servidor** (não pede administrador);
   - liga o servidor (porta 3400, só acessível no próprio PC) e mostra o ícone do FORJA perto do relógio.
2. **Publicar na internet:**
   1. Crie uma conta grátis em <https://tailscale.com> (dá para entrar com Google).
   2. Instale o Tailscale (`winget install --id Tailscale.Tailscale -e`) e entre na conta pela janela dele.
   3. Rode **`npm run pc:tunnel`**. Ele dá ao PC o nome `forja` no Tailscale, e o endereço fica `https://forja.sua-rede.ts.net`.
   4. Na primeira vez aparece um link para ativar o Funnel: abra e autorize. No fim, o comando mostra o endereço.
3. Abra o endereço, crie a sua conta (vira admin) e mande o convite para os amigos: clique com o botão direito no ícone do FORJA perto do relógio → **"Copiar convite para os amigos"** e cole no WhatsApp. O convite já leva o endereço, o código do grupo e o link do APK.

### Quando o PC liga
Ao entrar no Windows, aparece a pergunta **"Ligar o servidor do FORJA?"**:
- **Ligar:** o servidor sobe e o ícone do FORJA aparece perto do relógio. Enquanto ele estiver ligado, o PC **não entra em suspensão sozinho** (a tela apaga normalmente). Pelo ícone dá para abrir o app, copiar o convite e **desligar o servidor**.
- **Agora não:** nada liga. Para ligar depois, use o menu Iniciar → **"FORJA Servidor"**.

Para não perguntar mais, rode `npm run pc:autostart:off` ou desative "FORJA Servidor" no Gerenciador de Tarefas → *Aplicativos de inicialização*. Para voltar a perguntar, rode `npm run pc:autostart`. Para ligar sempre, sem perguntar e mesmo sem ninguém entrar no Windows, rode `node tools/host/forja-pc.mjs autostart --sempre` (pede administrador).

### Dia a dia

| Comando | O que faz |
|---|---|
| `npm run pc:status` | se está no ar, endereço, código do grupo, último backup e como liga com o Windows |
| `npm run pc:logs` | acompanha os logs (Ctrl+C sai) |
| `npm run pc:backup` | faz um backup agora (o app fica ~5 s fora do ar) |
| `npm run pc:restart` | reinicia (use depois de editar `%USERPROFILE%\FORJA\forja.env`) |
| `npm run pc:stop` / `npm run pc:start` | desliga / liga (o mesmo que o ícone e o menu Iniciar) |
| `npm run pc:autostart` / `pc:autostart:off` | volta a perguntar ao entrar no Windows / para de perguntar |
| `npm run pc:install` | **atualiza** para a versão atual do código (os dados ficam) |
| `npm run apk` | gera o APK de novo (veja "No Android") |
| `npm run pc:uninstall` | desliga e tira da inicialização e do menu Iniciar (dados e backups ficam) |

Se o servidor cair, o supervisor liga de novo sozinho em segundos.

**Backup:** todo dia às 4h, e também ao ligar se o último tiver mais de 20 h. Os backups vão para `OneDrive\FORJA-backups`, ganhando uma cópia na nuvem, e ficam os últimos 14.

Para restaurar:
1. Rode `npm run pc:stop`.
2. Renomeie `%USERPROFILE%\FORJA\dados` para `dados-antigo`.
3. Extraia o `.zip` numa pasta nova `dados`. Ela deve ficar com `db` e `uploads` dentro.
4. Rode `npm run pc:start`.

**Limites:** o app só funciona com o PC ligado (e o servidor ligado) e com internet, e a velocidade de *upload* da sua internet é o que limita as fotos para os amigos.

### Trocar o PC por um Raspberry Pi (depois)
Um Raspberry Pi 3 (1 GB) aguenta o FORJA, que usa ~300–450 MB. Use o **Raspberry Pi OS Lite de 64 bits**. O passo a passo do Pi ainda vai ser escrito; o que importa agora:
- **Endereço:** no painel do Tailscale (*Machines*), renomeie este PC (por exemplo, `forja-pc`) e dê ao Pi o nome `forja`. Assim `https://forja.sua-rede.ts.net` continua o mesmo, e o APK e os links dos amigos seguem funcionando.
- **Dados:** o último backup `.zip` do PC (pastas `db` e `uploads`) vai inteiro para o Pi.

### Outras formas de publicar o PC
- **Só para quem está na sua rede Tailscale:** cada amigo instala o Tailscale e entra na sua rede. Troque o Funnel por `tailscale serve --bg 3400`.
- **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:3400` dá um endereço `https://….trycloudflare.com` que muda a cada reinício (bom para um teste rápido). Para um endereço fixo é preciso um domínio no Cloudflare e um *named tunnel*. Depois, ajuste o endereço com `node tools/host/forja-pc.mjs config --url https://…`.

---

## No PC: usar como aplicativo
Abra o endereço no **Chrome ou Edge** → ícone **"Instalar"** na barra de endereço (ou menu ⋮ → "Instalar FORJA"). Ele vira um app com janela própria e atalho no menu Iniciar. No PC o app usa a barra lateral; no celular, abas embaixo.

## No Android: duas formas

**1. Instalar pelo navegador (mais rápido):** abra o endereço no Chrome → menu ⋮ → **"Instalar app"** / "Adicionar à tela inicial". Funciona na hora, com ícone e tela cheia.

**2. App nativo (APK) para os amigos instalarem:**
1. No PC, na pasta do projeto: **`npm run apk`**.
   - Na primeira vez ele baixa o Java 17 e o Android SDK (~3 GB) e leva uns 20–30 min. As próximas vezes são bem mais rápidas.
   - Tudo fica em `C:\forja-apk` (~10 GB com os caches da compilação). Pode apagar essa pasta quando quiser; o próximo `npm run apk` baixa de novo.
   - O app sai apontando para o endereço público do FORJA (o `PUBLIC_URL` de `%USERPROFILE%\FORJA\forja.env`).
2. O APK fica em `apk\FORJA.apk` e também no site: **`https://forja.sua-rede.ts.net/forja.apk`**. Mande esse link (o convite do ícone já leva ele).
3. No Android, abra o link no Chrome, baixe e toque em **Instalar**. Na primeira vez, o celular pede para permitir "instalar apps desconhecidos" para o Chrome.
4. Na tela de login do app dá para trocar o servidor ("Servidor: … · alterar"), se um dia o endereço mudar.

A chave que assina o APK fica em `credentials\android\` (fora do git; está no OneDrive junto com o projeto). **Não perca essa pasta:** o Android só atualiza o app por cima se a versão nova tiver a mesma assinatura. Sem ela, cada amigo precisa desinstalar o app antes de instalar a versão nova.

Sem Windows, dá para gerar na nuvem da Expo: crie uma conta em <https://expo.dev>, ajuste `EXPO_PUBLIC_API_URL` em `apps/app/eas.json` e rode `npx eas-cli build -p android --profile preview` dentro de `apps/app`.

> O APK precisa de um endereço **HTTPS** (o Android bloqueia HTTP comum em apps instalados). Durante o desenvolvimento, use o **Expo Go**: `npm run app` e leia o QR code, com `apps/app/.env` apontando para o IP do seu PC (`EXPO_PUBLIC_API_URL=http://192.168.x.x:3333`).

## Segurança — checklist
- [ ] `SECRET` longo e aleatório; `.env` nunca vai para o git (no caminho A ele só existe no servidor).
- [ ] `INVITE_CODE` só com os amigos (sem ele ninguém cria conta).
- [ ] HTTPS ligado (Caddy no caminho A, Tailscale Funnel ou Cloudflare no B).
- [ ] Backup diário do banco e das fotos, e uma cópia no PC de vez em quando.
- [ ] Servidor atualizado: o Ubuntu instala as correções de segurança sozinho, e cada `npm run deploy` baixa as versões novas das imagens (Node, Postgres 17, Caddy 2).

Senhas são guardadas com Argon2; sessões duram 90 dias (sair em Configurações encerra a sessão do aparelho; trocar a senha derruba as outras). Fotos são servidas por links assinados que expiram, e os metadados (como GPS) são removidos no envio.
