#!/usr/bin/env node
/**
 * FORJA no seu PC (Windows) — instala e controla o servidor que fica ligado para o grupo.
 *
 *   npm run pc:install        compila e instala em %USERPROFILE%\FORJA (fora do OneDrive), cria o atalho
 *                             "FORJA Servidor" no menu Iniciar e liga o servidor, com um ícone perto do relógio
 *                             (rode de novo sempre que quiser atualizar para a versão atual do código)
 *   npm run pc:autostart      ao entrar no Windows, pergunta se liga o servidor (a instalação já deixa assim)
 *   npm run pc:autostart:off  para de perguntar (dá para ligar pelo menu Iniciar → FORJA Servidor)
 *   npm run pc:tunnel         publica na internet com HTTPS pelo Tailscale Funnel (endereço fixo e grátis)
 *   npm run pc:status         se está no ar, endereço, código do grupo e último backup
 *   npm run pc:logs           acompanha os logs (Ctrl+C sai)
 *   npm run pc:backup         faz um backup agora (o app fica ~5 s fora do ar)
 *   npm run pc:restart        reinicia o servidor
 *   npm run pc:stop           desliga (liga de novo com pc:start ou pelo menu Iniciar → FORJA Servidor)
 *   npm run pc:start          liga
 *   npm run pc:uninstall      desliga e tira da inicialização e do menu Iniciar (dados e backups ficam)
 *
 * Rodando direto (node tools/host/forja-pc.mjs <comando>) aceita também: --home PASTA, --port N,
 * --invite CODIGO, --url https://endereco, --backups PASTA (só na 1ª instalação), --skip-build,
 * --no-task (install sem a inicialização automática), --sempre (autostart: liga sozinho quando o PC
 * liga, sem perguntar e sem ícone; pede administrador), --off (autostart: desliga) e --nome NOME
 * (tunnel: nome do PC no Tailscale, que vira o endereço; padrão "forja", "manter" deixa como está).
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Letra do drive sempre maiúscula: com "c:\" o Metro não acha os pacotes do monorepo (links em node_modules apontam para "C:\").
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/^[a-z]:/, (d) => d.toUpperCase());
const { command, flags } = parseArgs(process.argv.slice(2));
const DEFAULT_HOME = path.join(os.homedir(), 'FORJA');
const HOME = path.resolve(typeof flags.home === 'string' ? flags.home : DEFAULT_HOME);
const APP = path.join(HOME, 'app');
const ENV_FILE = path.join(HOME, 'forja.env');
const PIPE = pipeName(HOME);
const PIPE_ID = PIPE.split('\\').pop(); // "forja-xxxxxxxxxx", como o FORJA.exe espera
const IS_DEFAULT_HOME = HOME.toLowerCase() === DEFAULT_HOME.toLowerCase();
const TASK = IS_DEFAULT_HOME ? 'FORJA' : `FORJA-${PIPE.slice(-10)}`;
// "FORJA Servidor": FORJA.exe (tools/host/launcher.cs) — pergunta ao entrar no Windows e mostra o ícone perto do relógio.
const EXE = path.join(HOME, 'FORJA.exe');
const RUN_NAME = IS_DEFAULT_HOME ? 'FORJA Servidor' : `FORJA Servidor (${PIPE.slice(-10)})`;
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APPROVED_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const SHORTCUT = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${RUN_NAME}.lnk`);
const INVITE_RE = /^[A-Za-z0-9._-]{4,64}$/;

const COMMANDS = { install, autostart, tunnel, status, logs, backup, restart, stop, start, uninstall, config, help };
if (!COMMANDS[command]) fail(`Comando desconhecido: "${command}". Comandos: ${Object.keys(COMMANDS).join(', ')}.`);
if (process.platform !== 'win32' && command !== 'help') fail('Este comando é para Windows. Em Linux/macOS, use o Docker (docs/HOSPEDAGEM.md).');
try {
  await COMMANDS[command]();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

// ---------------------------------------------------------------- comandos

async function install() {
  if (flags['skip-build'] !== true) {
    step('Compilando o site e a API (npm run build)');
    run('npm run build', { cwd: ROOT, shell: true });
  }
  for (const p of ['apps/app/dist/index.html', 'apps/api/dist/server.js']) {
    if (!fs.existsSync(path.join(ROOT, p))) fail(`Falta ${p}. Rode sem --skip-build.`);
  }
  fs.mkdirSync(HOME, { recursive: true });
  const firstTime = !fs.existsSync(ENV_FILE);
  const cfg = ensureEnv();
  if (firstTime) await assertPortFree(Number(cfg.PORT));

  step(`Preparando a nova versão em ${HOME}`);
  const next = path.join(HOME, 'app.new');
  rmrf(next);
  stageApp(next);
  run('npm ci --omit=dev --workspace=@forja/api --no-audit --no-fund --loglevel=error', { cwd: next, shell: true });
  const launcher = buildLauncher();

  // Atualização pode mudar o banco (migrações): guarda uma cópia dos dados antes.
  if (await ask('status', 2000)) {
    step('Backup antes de atualizar (o app fica alguns segundos fora do ar)');
    const b = await ask('backup', 300_000);
    console.log(b?.ok ? `Backup salvo: ${b.file}` : `Aviso: o backup não saiu (${b?.error ?? 'sem resposta'}). Seguindo com a atualização.`);
  }

  step('Trocando para a nova versão');
  await stopSupervisor();
  rmrf(path.join(HOME, 'app.prev'));
  if (fs.existsSync(APP)) renameRetry(APP, path.join(HOME, 'app.prev'));
  renameRetry(next, APP);
  if (launcher) {
    installLauncher(launcher);
    if (flags['no-task'] !== true) createShortcut();
  }
  fs.rmSync(path.join(HOME, 'iniciar.ps1'), { force: true }); // lançador antigo, trocado pelo FORJA.exe
  if (flags['no-task'] !== true && launcher && !autostartInfo()) {
    setRunEntry(true);
    console.log('Ao entrar no Windows, o FORJA vai perguntar se você quer ligar o servidor.');
  }

  step('Ligando');
  await startSupervisor();
  if (!(await waitHealth(cfg.PORT, 90_000))) fail(`O servidor não respondeu. Veja: npm run pc:logs (pasta ${path.join(HOME, 'logs')})`);
  await status();
}

async function autostart() {
  if (flags.off === true) {
    const had = autostartInfo();
    removeRunEntry();
    if (taskExists()) unregisterTask();
    return console.log(
      had
        ? 'Pronto: o FORJA não liga nem pergunta mais ao entrar no Windows (ligue pelo menu Iniciar → FORJA Servidor, ou com npm run pc:start).'
        : 'A inicialização automática já estava desligada.',
    );
  }
  requireInstalled();
  if (!fs.existsSync(EXE)) fail('Falta o FORJA.exe nesta instalação. Rode de novo: npm run pc:install');
  if (flags.sempre === true) {
    if (registerTask()) {
      removeRunEntry();
      return console.log('Pronto: o FORJA liga sozinho quando o PC ligar, sem perguntar (mesmo sem ninguém entrar no Windows).');
    }
    setRunEntry(false);
    return console.log('Sem permissão de administrador: o FORJA vai ligar sozinho, sem perguntar, quando você entrar no Windows.');
  }
  if (taskExists()) unregisterTask();
  setRunEntry(true);
  console.log('Pronto: ao entrar no Windows, o FORJA pergunta se você quer ligar o servidor.');
  console.log('Para ligar em outra hora: menu Iniciar → "FORJA Servidor". Para parar de perguntar: npm run pc:autostart:off');
}

async function tunnel() {
  const cfg = requireInstalled();
  const ts = tailscaleExe();
  if (!ts) {
    fail(
      [
        'O Tailscale não está instalado. Instale e entre na sua conta (dá para usar a conta Google):',
        '  winget install --id Tailscale.Tailscale -e      (ou baixe em https://tailscale.com/download)',
        'Depois rode de novo: npm run pc:tunnel',
      ].join('\n'),
    );
  }
  let st = tailscaleStatus(ts);
  if (st?.BackendState !== 'Running' || !st?.Self?.DNSName) {
    fail('O Tailscale não está conectado. Clique no ícone dele perto do relógio → "Log in" e rode de novo.');
  }
  // O nome do PC no Tailscale vira o endereço. Um nome fixo ("forja") deixa trocar de máquina depois
  // (ex.: um Raspberry Pi com o mesmo nome) sem mudar o link dos amigos nem o APK.
  const want = typeof flags.nome === 'string' ? flags.nome.toLowerCase() : 'forja';
  if (want !== 'manter' && st.Self.DNSName.split('.')[0] !== want) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(want)) fail('--nome inválido: use letras, números e "-".');
    step(`Dando o nome "${want}" a este PC no Tailscale`);
    spawnSync(ts, ['set', `--hostname=${want}`], { stdio: 'inherit' });
    for (let i = 0; i < 20 && !new RegExp(`^${want}(-\\d+)?\\.`).test(st?.Self?.DNSName ?? ''); i++) {
      await sleep(1500);
      st = tailscaleStatus(ts) ?? st;
    }
  }
  step(`Publicando a porta ${cfg.PORT} na internet (Tailscale Funnel)`);
  console.log('Se aparecer um link para ativar o Funnel, abra no navegador, autorize e espere aqui.');
  const r = spawnSync(ts, ['funnel', '--bg', String(cfg.PORT)], { stdio: 'inherit' });
  if (r.status !== 0) fail('O Tailscale não ativou o Funnel. Se apareceu um link acima, autorize e rode de novo.');
  // Continua conectado mesmo sem ninguém logado no Windows (depois de uma atualização, por exemplo).
  const un = spawnSync(ts, ['set', '--unattended=true'], { encoding: 'utf8' });
  if (un.status !== 0) console.log('Dica: no menu do Tailscale, ative "Run unattended" para ele ficar ligado mesmo sem login.');

  const url = `https://${st.Self.DNSName.replace(/\.$/, '')}`;
  setEnvValue('PUBLIC_URL', url);
  if (await ask('status', 2000)) {
    await ask('restart', 60_000);
    await waitHealth(cfg.PORT, 60_000);
  }
  step(`Testando ${url}`);
  for (let i = 0; i < 24; i++) {
    try {
      if ((await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) })).ok) {
        console.log(`\nNo ar na internet: ${url}`);
        console.log(`Código do grupo:   ${readEnv(ENV_FILE).INVITE_CODE}`);
        return;
      }
    } catch {}
    await sleep(5000);
  }
  console.log(`\n${url} ainda não respondeu (o primeiro certificado HTTPS pode levar alguns minutos). Tente abrir no navegador daqui a pouco.`);
}

async function status() {
  const cfg = requireInstalled();
  const s = await ask('status', 3000);
  const healthy = await isHealthy(cfg.PORT);
  const pub = /^https:\/\//.test(cfg.PUBLIC_URL ?? '') ? cfg.PUBLIC_URL : null;
  console.log('');
  if (s && healthy) {
    const since = s.upSince ? new Date(s.upSince).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '?';
    console.log(`● No ar desde ${since}${s.restarts ? ` · ${s.restarts} reinício(s) automático(s)` : ''}`);
  } else if (s) console.log(`◐ Supervisor ligado, servidor ${s.backingUp ? 'fazendo backup' : 'iniciando ou com problema (veja npm run pc:logs)'}`);
  else console.log('○ Desligado (ligue com: npm run pc:start)');
  console.log(`  Versão:            ${s?.version ?? readRelease()}`);
  console.log(`  Neste PC:          http://localhost:${cfg.PORT}`);
  console.log(`  Na internet:       ${pub ?? 'ainda não publicado (rode: npm run pc:tunnel)'}`);
  console.log(`  Código do grupo:   ${cfg.INVITE_CODE}`);
  const last = s?.lastBackup ?? newestBackup(cfg.BACKUP_DIR);
  if (last) {
    const hours = Math.round((Date.now() - last.time) / 3_600_000);
    console.log(`  Último backup:     ${last.name} (${(last.size / 1024 / 1024).toFixed(1)} MB, há ${hours} h) em ${cfg.BACKUP_DIR}`);
  } else console.log(`  Último backup:     nenhum ainda (sai sozinho todo dia às ${cfg.BACKUP_HOUR ?? 4}h; pasta ${cfg.BACKUP_DIR})`);
  console.log(`  Liga com o Windows: ${autostartInfo() ?? 'não (rode: npm run pc:autostart)'}`);
  if (s?.keepAwake) console.log('  Suspensão:         o PC não suspende sozinho enquanto o servidor estiver ligado');
  else if (s) {
    const sleepMin = sleepMinutesOnAC();
    if (sleepMin) {
      console.log(`\n  Atenção: este PC suspende após ${sleepMin} min parado, e o app sai do ar junto.`);
      console.log('  Para não suspender (na tomada): powercfg /change standby-timeout-ac 0');
    }
  }
}

async function logs() {
  const dir = path.join(HOME, 'logs');
  let file = '';
  let pos = 0;
  const pick = () => {
    const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^forja-.*\.log$/.test(f)).sort() : [];
    return all.length ? path.join(dir, all.at(-1)) : '';
  };
  const show = (text) => {
    for (const line of text.split(/\r?\n/)) if (line.trim()) console.log(formatLog(line));
  };
  file = pick();
  if (!file) fail(`Ainda não há logs em ${dir}.`);
  const start = fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-41).join('\n');
  show(start);
  pos = fs.statSync(file).size;
  console.log(`--- acompanhando ${file} (Ctrl+C para sair) ---`);
  for (;;) {
    await sleep(1000);
    const latest = pick();
    if (latest !== file) {
      file = latest;
      pos = 0;
    }
    const size = fs.statSync(file).size;
    if (size > pos) {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      fs.closeSync(fd);
      pos = size;
      show(buf.toString('utf8'));
    }
  }
}

async function backup() {
  const cfg = requireInstalled();
  step('Fazendo backup (o app fica alguns segundos fora do ar)');
  const r = await ask('backup', 300_000);
  if (!r) fail('O FORJA não está ligado (o backup roda junto com ele). Ligue com: npm run pc:start');
  if (!r.ok) fail(`O backup falhou: ${r.error}`);
  console.log(`Backup salvo: ${r.file} (${(r.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log((await waitHealth(cfg.PORT, 60_000)) ? 'App no ar de novo.' : 'O app ainda não voltou; veja: npm run pc:logs');
}

async function restart() {
  const cfg = requireInstalled();
  if (!(await ask('status', 2000))) return start();
  step('Reiniciando');
  await ask('restart', 60_000);
  if (!(await waitHealth(cfg.PORT, 60_000))) fail('O servidor não voltou. Veja: npm run pc:logs');
  console.log('No ar.');
}

async function stop() {
  requireInstalled();
  step('Desligando');
  console.log((await stopSupervisor()) ? 'Desligado.' : 'Já estava desligado.');
}

async function start() {
  const cfg = requireInstalled();
  step('Ligando');
  await startSupervisor();
  if (!(await waitHealth(cfg.PORT, 90_000))) fail('O servidor não respondeu. Veja: npm run pc:logs');
  console.log(`No ar em http://localhost:${cfg.PORT}`);
}

async function uninstall() {
  requireInstalled();
  step('Desligando e tirando da inicialização do Windows e do menu Iniciar');
  await stopSupervisor();
  removeRunEntry();
  if (taskExists()) unregisterTask();
  fs.rmSync(SHORTCUT, { force: true });
  await sleep(1500); // o FORJA.exe sai junto com o servidor
  for (const f of ['FORJA.exe', 'FORJA.old.exe', 'FORJA.new.exe', 'iniciar.ps1']) {
    try {
      fs.rmSync(path.join(HOME, f), { force: true });
    } catch {}
  }
  const cfg = readEnv(ENV_FILE);
  console.log(`Pronto. Os dados continuam em ${cfg.DATA_DIR} e os backups em ${cfg.BACKUP_DIR}.`);
  console.log(`Para apagar tudo de vez, apague a pasta ${HOME} (e a de backups, se quiser).`);
}

async function config() {
  requireInstalled();
  ensureEnv();
  if (await ask('status', 2000)) await restart();
  else console.log('Configuração atualizada.');
}

async function help() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log((/\/\*\*([\s\S]*?)\*\//.exec(src)?.[1] ?? '').replace(/^ \* ?/gm, '').trim());
}

// ---------------------------------------------------------------- instalação

function stageApp(dest) {
  const copy = (from, to = from) => {
    const d = path.join(dest, to);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.cpSync(path.join(ROOT, from), d, { recursive: true });
  };
  for (const f of ['package.json', 'package-lock.json', 'packages/shared/package.json', 'apps/api/package.json', 'apps/app/package.json']) copy(f);
  for (const d of ['apps/api/dist', 'apps/api/drizzle', 'apps/api/data']) copy(d);
  copy('apps/app/dist', 'web');
  copy('tools/host/supervisor.mjs', 'supervisor.mjs');
  // APK gerado por "npm run apk": fica para baixar em https://<endereço>/forja.apk, e o forja-apk.json
  // diz a versão dele (o app instalado mostra "versão nova disponível" quando ela for maior que a sua).
  if (fs.existsSync(path.join(ROOT, 'apk', 'FORJA.apk'))) copy('apk/FORJA.apk', 'web/forja.apk');
  if (fs.existsSync(path.join(ROOT, 'apk', 'FORJA.json'))) copy('apk/FORJA.json', 'web/forja-apk.json');
  fs.writeFileSync(path.join(dest, 'RELEASE.txt'), `${releaseLabel()}\n`);
}

/** Compila tools/host/launcher.cs com o compilador C# que vem no Windows (.NET Framework 4). */
function buildLauncher() {
  const win = process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows';
  const csc = ['Framework64', 'Framework'].map((d) => path.join(win, 'Microsoft.NET', d, 'v4.0.30319', 'csc.exe')).find((f) => fs.existsSync(f));
  if (!csc) {
    console.log('Aviso: sem o compilador C# do Windows (.NET Framework 4), fico sem a pergunta ao ligar e sem o ícone perto do relógio.');
    return null;
  }
  step('Compilando o FORJA Servidor (pergunta ao ligar o PC e ícone perto do relógio)');
  const out = path.join(HOME, 'FORJA.new.exe');
  const ico = path.join(ROOT, 'tools', 'host', 'forja.ico');
  const args = ['-nologo', '-target:winexe', '-optimize+', `-out:${out}`, '-r:System.Windows.Forms.dll', '-r:System.Drawing.dll'];
  if (fs.existsSync(ico)) args.push(`-win32icon:${ico}`, `-resource:${ico},forja.ico`);
  args.push(path.join(ROOT, 'tools', 'host', 'launcher.cs'));
  const r = spawnSync(csc, args, { encoding: 'latin1' });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`Não consegui compilar o FORJA Servidor:\n${r.stdout}${r.stderr}`);
  return out;
}

/** Troca o FORJA.exe (um .exe aberto não pode ser apagado, mas pode ser renomeado). */
function installLauncher(next) {
  const old = path.join(HOME, 'FORJA.old.exe');
  try {
    fs.rmSync(old, { force: true });
  } catch {}
  if (fs.existsSync(EXE)) renameRetry(EXE, old);
  renameRetry(next, EXE);
  try {
    fs.rmSync(old, { force: true });
  } catch {} // ainda aberto: sai na próxima atualização
}

function launcherArgs(askFirst) {
  return [...(askFirst ? ['--perguntar'] : []), '--pipe', PIPE_ID, '--node', process.execPath];
}

function createShortcut() {
  const r = ps(
    [
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${psq(SHORTCUT)})`,
      `$s.TargetPath = ${psq(EXE)}`,
      `$s.Arguments = ${psq(launcherArgs(false).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '))}`,
      `$s.WorkingDirectory = ${psq(HOME)}`,
      `$s.IconLocation = ${psq(`${EXE},0`)}`,
      "$s.Description = 'Liga o servidor do FORJA e mostra o ícone perto do relógio.'",
      '$s.Save()',
    ].join('\n'),
  );
  if (r.ok) console.log(`Atalho no menu Iniciar: "${RUN_NAME}".`);
  else console.log(`(não consegui criar o atalho no menu Iniciar: ${r.err})`);
}

function ensureEnv() {
  if (flags.port !== undefined && !(/^\d+$/.test(String(flags.port)) && +flags.port >= 1024 && +flags.port <= 65535)) fail('--port inválida (1024 a 65535).');
  if (flags.invite !== undefined && !INVITE_RE.test(String(flags.invite))) fail('--invite inválido: de 4 a 64 letras, números, ponto, "_" ou "-".');
  if (flags.url !== undefined && !/^https?:\/\/[^\s/]+$/.test(String(flags.url))) fail('--url inválida (ex.: https://forja.exemplo.ts.net).');
  if (!fs.existsSync(ENV_FILE)) {
    const port = String(flags.port ?? 3400);
    // Backups no OneDrive ganham uma cópia na nuvem de graça; sem OneDrive, ficam em FORJA\backups.
    const oneDrive = process.env.OneDrive && fs.existsSync(process.env.OneDrive) ? path.join(process.env.OneDrive, 'FORJA-backups') : null;
    const backups = typeof flags.backups === 'string' ? path.resolve(flags.backups) : (oneDrive ?? path.join(HOME, 'backups'));
    const lines = [
      `# FORJA no PC — configuração criada por "npm run pc:install" em ${new Date().toLocaleString('pt-BR')}.`,
      '# Tem o SECRET: não compartilhe este arquivo. Depois de mudar algo, rode: npm run pc:restart',
      'NODE_ENV=production',
      'HOST=127.0.0.1',
      `PORT=${port}`,
      `PUBLIC_URL=${flags.url ?? `http://localhost:${port}`}`,
      `SECRET=${crypto.randomBytes(32).toString('hex')}`,
      `INVITE_CODE=${flags.invite ?? `forja-${crypto.randomBytes(3).toString('hex')}`}`,
      'TRUST_PROXY=true',
      `DATA_DIR=${path.join(HOME, 'dados')}`,
      `BACKUP_DIR=${backups}`,
      'BACKUP_HOUR=4',
      'BACKUP_KEEP=14',
      'TIMEZONE=America/Sao_Paulo',
      'LOG_LEVEL=info',
      'STRAVA_CLIENT_ID=',
      'STRAVA_CLIENT_SECRET=',
      'STRAVA_WEBHOOK_VERIFY_TOKEN=',
      '',
    ];
    fs.writeFileSync(ENV_FILE, lines.join('\n'));
  } else {
    if (flags.port !== undefined) setEnvValue('PORT', String(flags.port));
    if (flags.invite !== undefined) setEnvValue('INVITE_CODE', String(flags.invite));
    if (flags.url !== undefined) setEnvValue('PUBLIC_URL', String(flags.url));
  }
  return readEnv(ENV_FILE);
}

function setEnvValue(key, value) {
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  fs.writeFileSync(ENV_FILE, re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`);
}

// ---------------------------------------------------------------- inicialização com o Windows

/**
 * Padrão: entrada "FORJA Servidor" em HKCU\...\Run (sem administrador). Ao entrar no Windows, o
 * FORJA.exe pergunta se liga o servidor; dá para desativar também no Gerenciador de Tarefas →
 * Aplicativos de inicialização. Com --sempre, uma tarefa agendada liga o servidor junto com o PC.
 */
function setRunEntry(askFirst) {
  const value = [`"${EXE}"`, ...launcherArgs(askFirst).map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(' ');
  const r = ps(
    [
      `New-ItemProperty -Path ${psq(RUN_KEY)} -Name ${psq(RUN_NAME)} -Value ${psq(value)} -PropertyType String -Force | Out-Null`,
      // Se tinha sido desativado no Gerenciador de Tarefas, volta a valer.
      `Remove-ItemProperty -Path ${psq(APPROVED_KEY)} -Name ${psq(RUN_NAME)} -ErrorAction SilentlyContinue`,
    ].join('\n'),
  );
  if (!r.ok) throw new Error(`Não consegui colocar o FORJA na inicialização do Windows: ${r.err}`);
}

function removeRunEntry() {
  ps(
    [
      `Remove-ItemProperty -Path ${psq(RUN_KEY)} -Name ${psq(RUN_NAME)} -ErrorAction SilentlyContinue`,
      `Remove-ItemProperty -Path ${psq(APPROVED_KEY)} -Name ${psq(RUN_NAME)} -ErrorAction SilentlyContinue`,
    ].join('\n'),
  );
}

/** Como o FORJA liga com o Windows (texto para o status), ou null se não liga. */
function autostartInfo() {
  const task = taskInfo();
  if (task) return task;
  const r = ps(
    [
      `$v = (Get-ItemProperty -Path ${psq(RUN_KEY)} -Name ${psq(RUN_NAME)} -ErrorAction SilentlyContinue).${psq(RUN_NAME)}`,
      `$a = (Get-ItemProperty -Path ${psq(APPROVED_KEY)} -Name ${psq(RUN_NAME)} -ErrorAction SilentlyContinue).${psq(RUN_NAME)}`,
      "if ($v) { $v + '|' + $(if ($a) { $a[0] } else { 2 }) }",
    ].join('\n'),
  );
  if (!r.out) return null;
  const [cmd, flag] = r.out.split('|');
  const what = /--perguntar/.test(cmd) ? 'pergunta se liga quando você entra no Windows' : 'sim, quando você entra no Windows';
  // StartupApproved: 2 = ativo; ímpar = desativado pelo usuário no Gerenciador de Tarefas.
  return Number(flag) % 2 === 1 ? `${what}, mas está DESATIVADO no Gerenciador de Tarefas (Aplicativos de inicialização)` : what;
}

function ps(script) {
  // Erro de verdade para o script ("Stop"); um erro ignorado com -ErrorAction SilentlyContinue no último
  // comando ainda faria o PowerShell sair com código 1, daí o "exit 0" no fim.
  const full = `$ProgressPreference = 'SilentlyContinue'\n$ErrorActionPreference = 'Stop'\n${script}\nexit 0`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(full, 'utf16le').toString('base64')], {
    encoding: 'utf8',
  });
  // Com a saída redirecionada, o PowerShell manda progresso e erros em XML ("#< CLIXML"): tira só os erros.
  const raw = r.stderr ?? '';
  const xmlErrors = [...raw.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((m) => m[1].replace(/_x000D__x000A_/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'))
    .join('')
    .trim();
  const err =
    raw.replace(/#< CLIXML[\s\S]*$/, '').trim() || xmlErrors || r.error?.message || `PowerShell saiu com código ${r.status} ${raw.slice(0, 300)} ${(r.stdout ?? '').slice(0, 300)}`.trim();
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err };
}

/** --sempre: tarefa agendada que liga o servidor quando o PC liga, mesmo sem login (precisa de administrador). */
function registerTask() {
  step('Ligando o FORJA junto com o PC (sem perguntar)');
  console.log('Vai aparecer um pedido de permissão do Windows: clique em "Sim".');
  const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  const elevated = runTaskScript(
    [
      `$action = New-ScheduledTaskAction -Execute ${psq(process.execPath)} -Argument ${psq(`"${path.join(APP, 'supervisor.mjs')}"`)} -WorkingDirectory ${psq(APP)}`,
      '$trigger = New-ScheduledTaskTrigger -AtStartup',
      `$principal = New-ScheduledTaskPrincipal -UserId ${psq(user)} -LogonType S4U -RunLevel Limited`,
      `$settings = ${TASK_SETTINGS}`,
      `Register-ScheduledTask -TaskName ${psq(TASK)} -Description 'FORJA: servidor do app de treinos (tools/host).' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null`,
    ],
    true,
  );
  if (elevated !== 'ok') console.log(`Não deu para criar a tarefa (${elevated}).`);
  return elevated === 'ok';
}

function unregisterTask() {
  const cmd = [`Unregister-ScheduledTask -TaskName ${psq(TASK)} -Confirm:$false`];
  if (runTaskScript(cmd, false) !== 'ok') runTaskScript(cmd, true);
}

const TASK_SETTINGS =
  'New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable ' +
  '-ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew';

/** Roda comandos do Agendador de Tarefas num .ps1 temporário (com administrador, se elevated). Devolve 'ok' ou o erro. */
function runTaskScript(lines, elevated) {
  const tag = `forja-task-${process.pid}-${Date.now()}`;
  const ps1 = path.join(os.tmpdir(), `${tag}.ps1`);
  const out = path.join(os.tmpdir(), `${tag}.txt`);
  const body = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    ...lines.map((l) => `  ${l}`),
    `  Set-Content -Path ${psq(out)} -Value 'ok'`,
    '} catch {',
    `  Set-Content -Path ${psq(out)} -Value ('erro: ' + $_.Exception.Message)`,
    '  exit 1',
    '}',
    '',
  ].join('\r\n');
  fs.writeFileSync(ps1, `\ufeff${body}`);
  try {
    if (elevated) {
      const wrapper = `try { $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${psq(`"${ps1}"`)}; exit $p.ExitCode } catch { exit 99 }`;
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', wrapper], { encoding: 'utf8' });
      if (r.status === 99) return 'permissão negada';
    } else {
      spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8' });
    }
    return fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/^\ufeff/, '').trim() : 'sem resposta';
  } finally {
    fs.rmSync(ps1, { force: true });
    fs.rmSync(out, { force: true });
  }
}

function taskExists() {
  return taskInfo() !== null;
}

function taskInfo() {
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `$t = Get-ScheduledTask -TaskName ${psq(TASK)} -ErrorAction SilentlyContinue; if ($t) { $t.Triggers[0].CimClass.CimClassName + '|' + $t.Principal.LogonType }`],
    { encoding: 'utf8' },
  );
  const out = r.stdout?.trim();
  if (!out) return null;
  return /Boot/i.test(out) ? 'sim, quando o PC liga, sem perguntar (mesmo sem login)' : 'sim, quando você entra no Windows';
}

// ---------------------------------------------------------------- supervisor (pipe)

function ask(cmd, timeoutMs) {
  return new Promise((resolve) => {
    let buf = '';
    const sock = net.connect(PIPE);
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(null);
    }, timeoutMs);
    sock.setEncoding('utf8');
    sock.on('connect', () => sock.write(`${cmd}\n`));
    sock.on('data', (d) => (buf += d));
    sock.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(buf));
      } catch {
        resolve(null);
      }
    });
    sock.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function stopSupervisor() {
  if (!(await ask('stop', 30_000))) return false;
  for (let i = 0; i < 80; i++) {
    if (!(await ask('status', 1000))) {
      await sleep(800); // deixa o processo terminar e soltar os arquivos
      return true;
    }
    await sleep(500);
  }
  fail('O FORJA não desligou. Veja: npm run pc:logs');
}

async function startSupervisor() {
  if (await ask('status', 1500)) return;
  if (taskExists()) {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-ScheduledTask -TaskName ${psq(TASK)}`], { encoding: 'utf8' });
    if (await waitPipe(15_000)) return;
  }
  // Pelo FORJA.exe: liga o supervisor e deixa o ícone perto do relógio (para abrir, copiar o convite e desligar).
  if (fs.existsSync(EXE) && flags['sem-icone'] !== true) {
    spawn(EXE, launcherArgs(false), { cwd: HOME, detached: true, stdio: 'ignore' }).unref();
    if (await waitPipe(30_000)) return;
  }
  const c = spawn(process.execPath, [path.join(APP, 'supervisor.mjs')], { cwd: APP, detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  if (!(await waitPipe(15_000))) fail(`O supervisor não ligou. Veja os logs em ${path.join(HOME, 'logs')}`);
}

async function waitPipe(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ask('status', 1000)) return true;
    await sleep(500);
  }
  return false;
}

async function isHealthy(port) {
  try {
    return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function waitHealth(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await isHealthy(port)) return true;
    await sleep(700);
  }
  return false;
}

async function assertPortFree(port) {
  const free = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
  if (!free) fail(`A porta ${port} já está em uso. Escolha outra: node tools/host/forja-pc.mjs install --port 3410`);
}

// ---------------------------------------------------------------- utilidades

function requireInstalled() {
  if (!fs.existsSync(ENV_FILE) || !fs.existsSync(APP)) fail('O FORJA ainda não está instalado neste PC. Rode: npm run pc:install');
  return readEnv(ENV_FILE);
}

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function readRelease() {
  try {
    return fs.readFileSync(path.join(APP, 'RELEASE.txt'), 'utf8').trim();
  } catch {
    return '?';
  }
}

function releaseLabel() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const when = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return `FORJA ${version} · instalado em ${when}${git.status === 0 ? ` · commit ${git.stdout.trim()}` : ''}`;
}

function newestBackup(dir) {
  try {
    const name = fs.readdirSync(dir).filter((f) => /^forja-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/.test(f)).sort().at(-1);
    if (!name) return null;
    const st = fs.statSync(path.join(dir, name));
    return { name, time: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

function sleepMinutesOnAC() {
  const r = spawnSync('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'], { encoding: 'utf8' });
  const hex = r.stdout?.match(/0x[0-9a-f]{8}/gi);
  if (!hex || hex.length < 2) return null;
  return Math.round(parseInt(hex.at(-2), 16) / 60) || null; // penúltimo = na tomada (AC), em segundos
}

function tailscaleExe() {
  const r = spawnSync('where.exe', ['tailscale'], { encoding: 'utf8' });
  const found = r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : '';
  if (found) return found;
  const def = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
  return fs.existsSync(def) ? def : null;
}

function tailscaleStatus(ts) {
  const r = spawnSync(ts, ['status', '--json'], { encoding: 'utf8' });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function formatLog(line) {
  try {
    const j = JSON.parse(line);
    const time = new Date(j.time).toLocaleTimeString('pt-BR');
    const level = { 20: 'debug', 30: 'info ', 40: 'aviso', 50: 'ERRO ', 60: 'FATAL' }[j.level] ?? String(j.level);
    const req = j.req ? `${j.req.method} ${j.req.url} → ${j.res?.statusCode ?? '?'}${j.responseTime ? ` (${Math.round(j.responseTime)} ms)` : ''}` : '';
    const err = j.err?.message ? ` · ${j.err.message}` : '';
    return `${time} ${level} ${j.src === 'supervisor' ? '[supervisor] ' : ''}${req || j.msg || ''}${req && j.msg && !/request completed/.test(j.msg) ? ` · ${j.msg}` : ''}${err}`;
  } catch {
    return line;
  }
}

function pipeName(home) {
  // Mesmo cálculo em tools/host/supervisor.mjs.
  const id = crypto.createHash('sha1').update(path.resolve(home).toLowerCase()).digest('hex').slice(0, 10);
  return `\\\\.\\pipe\\forja-${id}`;
}

function psq(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
        throw new Error(`Não consegui renomear ${from} (${e.code}). Feche janelas ou terminais abertos nessa pasta e rode de novo.`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 5 });
}

function run(cmd, opts) {
  const r = spawnSync(cmd, { stdio: 'inherit', ...opts });
  if (r.error) throw new Error(`Não consegui rodar "${cmd}": ${r.error.message}`);
  if (r.status !== 0) throw new Error(`"${cmd}" terminou com erro (código ${r.status}).`);
}

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

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function step(msg) {
  console.log(`\n==> ${msg}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
