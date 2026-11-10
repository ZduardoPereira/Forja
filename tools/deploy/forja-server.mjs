#!/usr/bin/env node
/**
 * FORJA — publicar e cuidar do servidor a partir do PC (usa ssh, scp e tar do próprio sistema).
 *
 *   npm run server:setup      prepara o servidor uma vez: Docker, firewall, swap, .env, backup diário
 *   npm run deploy            compila no PC, envia e reinicia o app — use a cada atualização
 *   npm run server:status     versão no ar, containers, disco, memória e últimos backups
 *   npm run server:logs       acompanha os logs do app (Ctrl+C para sair)
 *   npm run server:backup     gera um backup agora e baixa para a pasta backups/
 *   npm run server:rollback   volta para a versão publicada anterior
 *   npm run server:ssh        abre um terminal no servidor
 *
 * Configuração em deploy.local.json (raiz do projeto, fora do git):
 *   { "host": "IP-DO-SERVIDOR", "user": "ubuntu", "key": "~/.ssh/forja_oracle", "domain": "seu.dominio" }
 * Rodando direto (node tools/deploy/forja-server.mjs <comando>) também aceita --host, --user, --key,
 * --domain, --invite CODIGO (setup), --skip-build e --dry-run (deploy: só monta o pacote, não envia).
 */
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_FILE = path.join(ROOT, 'deploy.local.json');
const IS_WIN = process.platform === 'win32';
const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
const INVITE_RE = /^[A-Za-z0-9._-]{4,64}$/;

// ---------------------------------------------------------------- scripts que rodam no servidor

const REMOTE_DEPLOY = String.raw`
set -euo pipefail
BASE=/opt/forja
cd "$BASE"
[ -f .env ] || { echo "Falta $BASE/.env — rode antes: npm run server:setup" >&2; exit 1; }
rm -rf app.new && mkdir app.new
tar -xzf /tmp/forja-release.tgz -C app.new --warning=no-unknown-keyword
rm -f /tmp/forja-release.tgz
{ [ -f app.new/web/index.html ] && [ -f app.new/apps/api/dist/server.js ]; } || { echo "Pacote incompleto." >&2; exit 1; }
chmod +x app.new/backup.sh
ln -sfn "$BASE/.env" app.new/.env
rm -rf app.prev
[ ! -d app ] || mv app app.prev
mv app.new app
cd app
echo "Atualizando imagens base e montando a nova versão (a primeira vez leva alguns minutos)..."
if ! { docker compose pull --quiet --ignore-buildable && docker compose build --pull && docker compose up -d --remove-orphans; }; then
  echo "!! A nova versão falhou. Os arquivos da anterior voltaram para o lugar." >&2
  cd "$BASE" && rm -rf app.failed && mv app app.failed && { [ ! -d app.prev ] || mv app.prev app; }
  exit 1
fi
if [ -f ../app.prev/Caddyfile ] && ! cmp -s Caddyfile ../app.prev/Caddyfile; then
  docker compose up -d --force-recreate --no-deps caddy
fi
echo "Esperando o app responder..."
ok=0
for _ in $(seq 1 45); do
  if docker compose exec -T forja node -e "fetch('http://127.0.0.1:3333/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "!! O app não respondeu em 90 s. Últimos logs:" >&2
  docker compose logs --tail=80 forja >&2
  exit 1
fi
docker image prune -f >/dev/null 2>&1 || true
echo "No ar: $(cat RELEASE.txt)"
`;

const REMOTE_STATUS = String.raw`
cd /opt/forja/app 2>/dev/null || { echo "Ainda não há versão publicada (rode: npm run deploy)."; exit 0; }
echo "Versão:  $(cat RELEASE.txt 2>/dev/null || echo '?')"
echo
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo
df -h / | awk 'NR==2 {print "Disco:   " $3 " usados de " $2 " (" $5 ")"}'
free -m | awk '/^Mem:/ {print "Memória: " $3 " MB usados de " $2 " MB"}'
echo "Últimos backups:"
ls -1t /opt/forja/backups 2>/dev/null | grep -E '^(db|fotos)-' | head -4 | sed 's/^/  /' || echo "  (nenhum ainda)"
`;

const REMOTE_ROLLBACK = String.raw`
set -euo pipefail
cd /opt/forja
[ -d app.prev ] || { echo "Não há versão anterior guardada." >&2; exit 1; }
rm -rf app.swap && mv app app.swap && mv app.prev app && mv app.swap app.prev
cd app
docker compose up -d --build --remove-orphans
echo "Voltou para: $(cat RELEASE.txt)"
`;

const COMPOSE_OVERRIDE = `# Gerado por "npm run deploy": o PC já compilou o site e a API, então o servidor
# monta o alvo "release" do Dockerfile (só instala as dependências de execução).
services:
  forja:
    build:
      target: release
`;

// ---------------------------------------------------------------- comandos

const COMMANDS = { setup, deploy, status, logs, backup, rollback, ssh: shell, help };
const { command, flags } = parseArgs(process.argv.slice(2));
if (!COMMANDS[command]) fail(`Comando desconhecido: "${command}". Comandos: ${Object.keys(COMMANDS).join(', ')}.`);
try {
  await COMMANDS[command]();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

async function setup() {
  const cfg = readConfig({ needDomain: true });
  const invite = flags.invite;
  if (invite !== undefined && (typeof invite !== 'string' || !INVITE_RE.test(invite))) {
    fail('Código do grupo inválido: use de 4 a 64 letras, números, ponto, "_" ou "-".');
  }
  checkConnection(cfg);
  step('Preparando o servidor (Docker, firewall, swap, configuração e backup)');
  const script = fs.readFileSync(path.join(ROOT, 'tools', 'deploy', 'server-setup.sh'), 'utf8');
  remote(cfg, `sudo bash -s -- '${cfg.domain}'${invite ? ` '${invite}'` : ''}`, { input: script });
}

async function deploy() {
  const dryRun = flags['dry-run'] === true;
  const cfg = dryRun ? null : readConfig({ needDomain: true });
  if (cfg) checkConnection(cfg);
  if (flags['skip-build'] !== true) {
    step('Compilando o site e a API (npm run build)');
    run('npm run build', [], { cwd: ROOT, shell: true });
  }
  const bundle = makeBundle();
  if (!cfg) {
    console.log(`\nPacote montado (teste — nada foi enviado): ${bundle.file} (${mb(bundle.size)})`);
    return;
  }
  step(`Enviando ${mb(bundle.size)} para ${cfg.host}`);
  run('scp', [...sshOptions(cfg), '-q', path.basename(bundle.file), `${target(cfg, true)}:/tmp/forja-release.tgz`], {
    cwd: path.dirname(bundle.file),
  });
  fs.rmSync(bundle.dir, { recursive: true, force: true });
  step('Instalando a nova versão no servidor');
  remote(cfg, 'bash -s', { input: REMOTE_DEPLOY });
  await checkPublic(cfg);
}

async function status() {
  remote(readConfig(), 'bash -s', { input: REMOTE_STATUS });
}

async function logs() {
  remote(readConfig(), 'cd /opt/forja/app && docker compose logs -f --tail=100 forja caddy', { tty: true, check: false });
}

async function backup() {
  const cfg = readConfig();
  step('Gerando backup no servidor');
  const r = remote(cfg, '/opt/forja/app/backup.sh', { capture: true });
  process.stdout.write(r.stdout);
  const files = [...new Set([...r.stdout.matchAll(/\b((?:db|fotos)-[\w-]+\.(?:sql\.gz|tgz))\b/g)].map((m) => m[1]))];
  if (!files.length) fail('Não encontrei os arquivos do backup na resposta do servidor.');
  const dest = path.join(ROOT, 'backups');
  fs.mkdirSync(dest, { recursive: true });
  step('Baixando para o PC');
  for (const f of files) run('scp', [...sshOptions(cfg), '-q', `${target(cfg, true)}:/opt/forja/backups/${f}`, '.'], { cwd: dest });
  console.log(`Backup salvo em ${dest}`);
}

async function rollback() {
  const cfg = readConfig();
  step('Voltando para a versão anterior');
  remote(cfg, 'bash -s', { input: REMOTE_ROLLBACK });
  if (cfg.domain) await checkPublic(cfg);
}

async function shell() {
  const cfg = readConfig();
  spawnSync('ssh', [...sshOptions(cfg), target(cfg)], { stdio: 'inherit' });
}

async function help() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const doc = /\/\*\*([\s\S]*?)\*\//.exec(src)?.[1] ?? '';
  console.log(doc.replace(/^ \* ?/gm, '').trim());
}

// ---------------------------------------------------------------- pacote de publicação

function makeBundle() {
  step('Montando o pacote de publicação');
  for (const p of ['apps/app/dist/index.html', 'apps/api/dist/server.js', 'apps/api/drizzle', 'apps/api/data']) {
    if (!fs.existsSync(path.join(ROOT, p))) fail(`Falta ${p}. Rode sem --skip-build para compilar.`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-release-'));
  const app = path.join(dir, 'app');
  const dest = (to) => {
    const full = path.join(app, to);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    return full;
  };
  const copy = (from, to = from) => fs.cpSync(path.join(ROOT, from), dest(to), { recursive: true });
  // Arquivos que o Linux lê como texto vão com final de linha LF, mesmo se o git do Windows trocar para CRLF.
  const text = (from, to = from) => fs.writeFileSync(dest(to), toLF(fs.readFileSync(path.join(ROOT, from), 'utf8')));

  for (const f of ['package.json', 'package-lock.json', 'packages/shared/package.json', 'apps/api/package.json', 'apps/app/package.json']) copy(f);
  for (const d of ['apps/api/dist', 'apps/api/drizzle', 'apps/api/data']) copy(d);
  copy('apps/app/dist', 'web');
  for (const f of ['Dockerfile', 'docker-compose.yml', 'Caddyfile']) text(f);
  text('tools/deploy/backup.sh', 'backup.sh');
  fs.writeFileSync(dest('docker-compose.override.yml'), COMPOSE_OVERRIDE);
  fs.writeFileSync(dest('.dockerignore'), '.env\nbackup.sh\nRELEASE.txt\n');
  fs.writeFileSync(dest('RELEASE.txt'), `${releaseLabel()}\n`);

  const file = path.join(dir, 'forja-release.tgz');
  run(tarCommand(), ['-czf', path.basename(file), '-C', 'app', '.'], { cwd: dir });
  return { dir, file, size: fs.statSync(file).size };
}

function releaseLabel() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const commit = git.status === 0 ? ` · commit ${git.stdout.trim()}` : '';
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return `FORJA ${version} · publicado em ${when}${commit}`;
}

function tarCommand() {
  // No Windows, usa o tar do sistema (bsdtar); o tar do Git Bash confunde "C:" com um servidor remoto.
  if (IS_WIN) {
    const sys = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(sys)) return sys;
  }
  return 'tar';
}

// ---------------------------------------------------------------- configuração e SSH

function readConfig({ needDomain = false } = {}) {
  let saved = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      fail(`deploy.local.json inválido: ${e.message}`);
    }
  }
  const cfg = { user: 'ubuntu', key: '~/.ssh/forja_oracle', ...saved };
  for (const k of ['host', 'user', 'key', 'domain']) if (typeof flags[k] === 'string') cfg[k] = flags[k];
  if (!cfg.host) {
    fail(
      'Falta o endereço do servidor. Crie deploy.local.json na raiz do projeto com:\n' +
        '  { "host": "IP-DO-SERVIDOR", "user": "ubuntu", "key": "~/.ssh/forja_oracle", "domain": "seu.dominio" }',
    );
  }
  if (!/^[A-Za-z0-9.:-]+$/.test(cfg.host)) fail(`"host" inválido: ${cfg.host}`);
  if (!/^[a-z_][a-z0-9_.-]*$/i.test(cfg.user)) fail(`"user" inválido: ${cfg.user}`);
  if (cfg.domain !== undefined && !DOMAIN_RE.test(cfg.domain)) fail(`"domain" inválido: ${cfg.domain}`);
  if (needDomain && !cfg.domain) fail('Falta o domínio: campo "domain" em deploy.local.json (ou --domain).');
  cfg.keyPath = cfg.key.startsWith('~') ? path.join(os.homedir(), cfg.key.slice(1)) : path.resolve(ROOT, cfg.key);
  if (!fs.existsSync(cfg.keyPath)) fail(`Chave SSH não encontrada: ${cfg.keyPath}`);

  // Guarda o que veio pela linha de comando, para as próximas vezes.
  const keep = { host: cfg.host, user: cfg.user, key: cfg.key, ...(cfg.domain ? { domain: cfg.domain } : {}) };
  if (JSON.stringify(keep) !== JSON.stringify(saved)) fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(keep, null, 2)}\n`);
  return cfg;
}

function sshOptions(cfg) {
  return [
    '-i', cfg.keyPath,
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    '-o', 'ServerAliveInterval=30',
  ];
}

function target(cfg, forScp = false) {
  const host = forScp && cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host;
  return `${cfg.user}@${host}`;
}

function remote(cfg, cmd, { input, capture = false, tty = false, check = true } = {}) {
  const args = [...sshOptions(cfg), ...(tty ? ['-t'] : []), target(cfg), cmd];
  const r = spawnSync('ssh', args, {
    input: input === undefined ? undefined : toLF(input),
    stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    encoding: 'utf8',
  });
  if (r.error) throw new Error(`Não consegui rodar o ssh: ${r.error.message}`);
  if (check && r.status !== 0) throw new Error(`O comando no servidor falhou (código ${r.status}). Veja as mensagens acima.`);
  return r;
}

function checkConnection(cfg) {
  step(`Conectando em ${target(cfg)}`);
  const r = remote(cfg, 'echo forja-ok', { capture: true, check: false });
  if (r.status === 0 && r.stdout.includes('forja-ok')) return;
  fail(
    [
      'Não consegui entrar no servidor por SSH. Confira:',
      `  • o IP (${cfg.host}) e se a VM está "Running" no painel da Oracle;`,
      `  • se a chave ${path.basename(cfg.keyPath)}.pub foi colocada ao criar a VM;`,
      '  • o usuário ("user"): "ubuntu" nas imagens Ubuntu, "opc" no Oracle Linux.',
    ].join('\n'),
  );
}

async function checkPublic(cfg) {
  step(`Testando https://${cfg.domain}`);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(cfg.host)) {
    try {
      const { address } = await lookup(cfg.domain, { family: 4 });
      if (address !== cfg.host) console.log(`Aviso: ${cfg.domain} aponta para ${address}, e não para ${cfg.host}. Confira o DNS do domínio.`);
    } catch {
      console.log(`Aviso: o domínio ${cfg.domain} ainda não aponta para nenhum IP. Confira o DNS do domínio.`);
    }
  }
  let lastError = 'sem resposta';
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(`https://${cfg.domain}/health`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        console.log(`\nPronto! O FORJA está no ar em https://${cfg.domain}`);
        return;
      }
      lastError = `HTTP ${r.status}`;
    } catch (e) {
      lastError = e?.cause?.code ?? e?.cause?.message ?? e?.message ?? String(e);
    }
    await new Promise((res) => setTimeout(res, 5_000));
  }
  console.log(
    [
      `\nO app está rodando no servidor, mas https://${cfg.domain} ainda não respondeu (${lastError}). Confira:`,
      '  • o domínio aponta para o IP do servidor (pode levar alguns minutos para propagar);',
      '  • as portas 80 e 443 estão liberadas na Security List da VCN (painel da Oracle);',
      '  • o certificado HTTPS sai sozinho quando os dois itens acima estiverem certos: npm run server:logs.',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------- utilidades

function parseArgs(argv) {
  const out = { command: 'help', flags: {} };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) out.command = rest.shift();
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(rest[i]);
    if (!m) fail(`Opção inválida: ${rest[i]}`);
    if (m[2] !== undefined) out.flags[m[1]] = m[2];
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) out.flags[m[1]] = rest[++i];
    else out.flags[m[1]] = true;
  }
  return out;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw new Error(`Não consegui rodar ${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} terminou com erro (código ${r.status}).`);
}

function toLF(s) {
  return s.replace(/\r\n/g, '\n');
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function step(msg) {
  console.log(`\n==> ${msg}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
