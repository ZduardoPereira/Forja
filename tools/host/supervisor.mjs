#!/usr/bin/env node
/**
 * FORJA no PC — supervisor: mantém o servidor ligado, grava os logs e faz o backup diário.
 * Fica em %USERPROFILE%\FORJA\app (instalado por "npm run pc:install") e liga junto com o Windows.
 *
 *  • religa o servidor se ele cair (espera 2 s, 5 s, 15 s, 30 s, depois 1 min);
 *  • backup diário (BACKUP_HOUR, padrão 4h) e ao ligar, se o último tiver mais de 20 h:
 *    desliga o servidor com calma, compacta banco + fotos num .zip e liga de novo (~5 s fora do ar);
 *  • logs em FORJA\logs\forja-AAAA-MM-DD.log (guarda 14 dias);
 *  • enquanto ele roda, o PC não entra em suspensão sozinho (a tela apaga normalmente; KEEP_AWAKE=false desliga);
 *  • aceita comandos (status, backup, restart, stop) por um pipe local — ver tools/host/forja-pc.mjs.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(fileURLToPath(import.meta.url));
const HOME = path.dirname(APP);
const LOGS = path.join(HOME, 'logs');
const PIPE = pipeName(HOME);
let env, PORT, DATA_DIR, BACKUP_DIR, BACKUP_HOUR, BACKUP_KEEP;
loadConfig();
fs.mkdirSync(LOGS, { recursive: true });

/** Lê forja.env. Roda de novo a cada vez que o servidor liga, para valer o que mudou (endereço, código…). */
function loadConfig() {
  const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  env = readEnv(path.join(HOME, 'forja.env'));
  PORT = num(env.PORT, 3400);
  DATA_DIR = env.DATA_DIR || path.join(HOME, 'dados');
  BACKUP_DIR = env.BACKUP_DIR || path.join(HOME, 'backups');
  BACKUP_HOUR = num(env.BACKUP_HOUR, 4);
  BACKUP_KEEP = num(env.BACKUP_KEEP, 14);
}

let child = null;
let wanted = false;
let stopping = false;
let backoff = 0;
let startedAt = 0;
let restarts = 0;
let backingUp = null;
let lastBackupDay = newestBackup()?.day ?? '';

// ---------------------------------------------------------------- comandos pelo pipe

const ctl = net.createServer((sock) => {
  let buf = '';
  sock.setEncoding('utf8');
  sock.on('error', () => {});
  sock.on('data', async (d) => {
    buf += d;
    if (!buf.includes('\n')) return;
    const cmd = buf.trim();
    buf = '';
    const reply = (obj) => sock.end(`${JSON.stringify(obj)}\n`);
    try {
      if (cmd === 'status') reply(statusInfo());
      else if (cmd === 'backup') reply(await backup('manual'));
      else if (cmd === 'restart') {
        await backingUp?.catch(() => undefined);
        await stopChild();
        startChild();
        reply({ ok: true });
      } else if (cmd === 'stop') {
        reply({ ok: true });
        await shutdownAll('pedido de parar');
      } else reply({ ok: false, error: `comando desconhecido: ${cmd}` });
    } catch (e) {
      reply({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
});
ctl.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('O FORJA já está rodando neste PC.');
    process.exit(0);
  }
  throw e;
});
ctl.listen(PIPE, () => void boot());

process.on('SIGINT', () => void shutdownAll('Ctrl+C'));
process.on('SIGTERM', () => void shutdownAll('SIGTERM'));
process.on('uncaughtException', (e) => {
  note(`erro inesperado no supervisor: ${e.stack ?? e}`, 50);
  process.exit(1); // o Agendador de Tarefas liga de novo
});

async function boot() {
  note(`supervisor iniciado (pid ${process.pid}) · porta ${PORT} · backups em ${BACKUP_DIR}`);
  pruneLogs();
  keepAwake();
  if (needsBackup()) await backup('ao ligar');
  else startChild();
  setInterval(() => {
    if (new Date().getHours() === BACKUP_HOUR && lastBackupDay !== today()) void backup('diário');
    pruneLogs();
  }, 60_000);
}

// ---------------------------------------------------------------- servidor

function startChild() {
  if (child || stopping) return;
  wanted = true;
  startedAt = Date.now();
  try {
    loadConfig();
  } catch (e) {
    note(`não consegui ler forja.env (${e.message}); usando a configuração anterior`, 40);
  }
  const me = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: APP,
    env: { ...process.env, ...env, NODE_ENV: 'production', PORT: String(PORT), DATA_DIR, WEB_DIST: path.join(APP, 'web') },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  child = me;
  me.stdout.on('data', logRaw);
  me.stderr.on('data', logRaw);
  me.on('exit', (code, signal) => {
    if (child === me) child = null;
    if (!wanted || stopping) return;
    if (Date.now() - startedAt > 5 * 60_000) backoff = 0;
    const delay = [2, 5, 15, 30, 60][Math.min(backoff++, 4)];
    restarts++;
    note(`o servidor parou (código ${code ?? signal}); ligando de novo em ${delay} s`, 40);
    setTimeout(() => {
      if (wanted) startChild();
    }, delay * 1000);
  });
}

async function stopChild() {
  wanted = false;
  const c = child;
  if (!c) return;
  await new Promise((resolve) => {
    const force = setTimeout(() => {
      note('o servidor não desligou em 20 s; forçando', 40);
      c.kill();
    }, 20_000);
    c.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    try {
      c.send('shutdown');
    } catch {
      c.kill();
    }
  });
}

async function shutdownAll(why) {
  if (stopping) return;
  note(`supervisor encerrando (${why})`);
  await backingUp?.catch(() => undefined);
  stopping = true;
  await stopChild();
  awake?.kill();
  ctl.close();
  setTimeout(() => process.exit(0), 300);
}

// ---------------------------------------------------------------- PC acordado

/**
 * Pede ao Windows para não suspender (SetThreadExecutionState com ES_SYSTEM_REQUIRED) enquanto o
 * servidor estiver ligado. Quem segura o pedido é um PowerShell escondido que espera a entrada dele
 * fechar: quando o supervisor sai (ou cai), o pedido acaba junto e o PC volta a suspender normalmente.
 */
let awake = null;
function keepAwake() {
  if (process.platform !== 'win32' || env.KEEP_AWAKE === 'false' || awake || stopping) return;
  const script = [
    `$sig = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'`,
    '$k = Add-Type -MemberDefinition $sig -Name Acordado -Namespace Forja -PassThru',
    '[void]$k::SetThreadExecutionState([uint32]2147483649)', // ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    '[void][Console]::In.ReadToEnd()',
  ].join('\n');
  const me = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
  awake = me;
  me.stdin.on('error', () => {});
  me.on('error', (e) => note(`não consegui impedir a suspensão do PC: ${e.message}`, 40));
  me.on('exit', () => {
    if (awake === me) awake = null;
    if (!stopping) setTimeout(keepAwake, 60_000);
  });
}

// ---------------------------------------------------------------- backup

function backup(reason) {
  if (backingUp) return backingUp;
  backingUp = (async () => {
    if (!fs.existsSync(path.join(DATA_DIR, 'db'))) {
      startChild();
      return { ok: false, error: 'ainda não há banco para guardar' };
    }
    note(`backup (${reason}): desligando o servidor por alguns segundos`);
    await stopChild();
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const name = `forja-${stamp()}.zip`;
      const part = path.join(BACKUP_DIR, `${name}.part`);
      // Itens de primeiro nível (db, uploads…) pelo nome, para o .zip abrir limpo no Explorador do Windows.
      const items = fs.readdirSync(DATA_DIR);
      const r = spawnSync(tarExe(), ['--format', 'zip', '-c', '-f', part, '-C', DATA_DIR, ...items], { encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) throw new Error((r.stderr || r.error?.message || `tar saiu com ${r.status}`).trim());
      const file = path.join(BACKUP_DIR, name);
      fs.renameSync(part, file);
      const size = fs.statSync(file).size;
      lastBackupDay = today();
      pruneBackups();
      note(`backup ok: ${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
      return { ok: true, file, size };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      note(`backup FALHOU: ${error}`, 50);
      return { ok: false, error };
    } finally {
      startChild();
    }
  })().finally(() => {
    backingUp = null;
  });
  return backingUp;
}

function backups() {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^forja-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

function newestBackup() {
  const name = backups().at(-1);
  if (!name) return null;
  const file = path.join(BACKUP_DIR, name);
  return { name, file, day: name.slice(6, 16), time: fs.statSync(file).mtimeMs, size: fs.statSync(file).size };
}

function needsBackup() {
  const last = newestBackup();
  return fs.existsSync(path.join(DATA_DIR, 'db')) && (!last || Date.now() - last.time > 20 * 3_600_000);
}

function pruneBackups() {
  const all = backups();
  for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  for (const f of fs.readdirSync(BACKUP_DIR)) if (f.endsWith('.zip.part')) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
}

// ---------------------------------------------------------------- logs e utilidades

let logDay = '';
let logStream = null;
function logRaw(chunk) {
  const day = today();
  if (day !== logDay) {
    logStream?.end();
    logDay = day;
    logStream = fs.createWriteStream(path.join(LOGS, `forja-${day}.log`), { flags: 'a' });
  }
  logStream.write(chunk);
}

function note(msg, level = 30) {
  logRaw(`${JSON.stringify({ level, time: Date.now(), src: 'supervisor', msg })}\n`);
  if (process.stdout.isTTY) console.log(`[supervisor] ${msg}`);
}

function pruneLogs() {
  const limit = Date.now() - 14 * 86_400_000;
  for (const f of fs.readdirSync(LOGS)) {
    const p = path.join(LOGS, f);
    if (/^forja-.*\.log$/.test(f) && fs.statSync(p).mtimeMs < limit) fs.rmSync(p, { force: true });
  }
}

function statusInfo() {
  let version = '?';
  try {
    version = fs.readFileSync(path.join(APP, 'RELEASE.txt'), 'utf8').trim();
  } catch {}
  return {
    ok: true,
    supervisorPid: process.pid,
    serverPid: child?.pid ?? null,
    upSince: child ? startedAt : null,
    restarts,
    port: PORT,
    version,
    backingUp: Boolean(backingUp),
    keepAwake: Boolean(awake),
    lastBackup: newestBackup(),
  };
}

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

/** Mesmo cálculo em tools/host/forja-pc.mjs. */
function pipeName(home) {
  const id = crypto.createHash('sha1').update(path.resolve(home).toLowerCase()).digest('hex').slice(0, 10);
  return `\\\\.\\pipe\\forja-${id}`;
}

function tarExe() {
  const sys = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  return fs.existsSync(sys) ? sys : 'tar';
}

function today() {
  return new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso do PC
}

function stamp() {
  return new Date().toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '').slice(0, 15); // AAAA-MM-DD_HHMM
}
