#!/usr/bin/env node
/**
 * FORJA — gera o APK do Android neste PC (Windows), sem Android Studio e sem conta na Expo.
 *
 *   npm run apk          gera o APK (na 1ª vez baixa ~3 GB de ferramentas e leva uns 20–30 min)
 *   npm run apk:setup    só baixa as ferramentas (Java 17 e Android SDK)
 *
 * O app sai apontando para o endereço público do FORJA: PUBLIC_URL de %USERPROFILE%\FORJA\forja.env
 * (ou --url https://...). No celular dá para trocar na tela de entrada ("Servidor: … · alterar").
 *
 *   Saída:        apk\FORJA.apk (na raiz do projeto). Com o FORJA instalado neste PC, o APK também
 *                 fica no site, em https://<endereço>/forja.apk — é só mandar o link para os amigos.
 *   Ferramentas:  C:\forja-apk (fora do OneDrive e com caminho curto, como o NDK exige no Windows;
 *                 ~10 GB com os caches). Pode apagar quando quiser; o próximo "npm run apk" baixa tudo de novo.
 *   Assinatura:   credentials\android\ (fora do git). Guarde essa pasta: o Android só instala uma
 *                 versão nova por cima se ela tiver a mesma assinatura (sem ela, é preciso desinstalar antes).
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/^[a-z]:/, (d) => d.toUpperCase());
const { command, flags } = parseArgs(process.argv.slice(2));
const TOOLS = toolsDir();
const JDK = path.join(TOOLS, 'jdk');
const SDK = path.join(TOOLS, 'sdk');
const GRADLE_HOME = path.join(TOOLS, 'gradle');
const DOWNLOADS = path.join(TOOLS, 'downloads');
const SRC = path.join(TOOLS, 'src');
const APP_SRC = path.join(SRC, 'apps', 'app');
const ANDROID = path.join(APP_SRC, 'android');
const OUT_DIR = path.join(ROOT, 'apk');
const CRED_DIR = path.join(ROOT, 'credentials', 'android');
const FORJA_HOME = path.join(os.homedir(), 'FORJA');
const ABIS = 'armeabi-v7a,arm64-v8a'; // celulares de verdade (32 e 64 bits); sem x86 de emulador
const CMAKE = '3.22.1'; // a versão padrão do Android Gradle Plugin
const TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

const COMMANDS = { setup, build, help };
if (!COMMANDS[command]) fail(`Comando desconhecido: "${command}". Comandos: ${Object.keys(COMMANDS).join(', ')}.`);
if (process.platform !== 'win32' && command !== 'help') fail('Este script é para Windows. Em Linux/macOS, use: npx eas build -p android --profile preview');
try {
  await COMMANDS[command]();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

// ---------------------------------------------------------------- comandos

async function setup() {
  const v = androidVersions(path.join(ROOT, 'node_modules'));
  await ensureJdk();
  await ensureSdk(v);
  console.log(`\nFerramentas prontas em ${TOOLS} (Java 17, Android ${v.compileSdk}, NDK ${v.ndk}).`);
}

async function build() {
  const url = serverUrl();
  const t0 = Date.now();
  await setup();
  syncProject(url);
  installDeps();
  const v = androidVersions(path.join(SRC, 'node_modules'));
  const env = buildEnv(url);
  prebuild(env);
  const { versionCode, versionName } = prepareBuild();

  step('Compilando o APK (Gradle; a 1ª vez leva uns 15–25 min, as próximas bem menos)');
  const gradlew = path.join(ANDROID, 'gradlew.bat');
  const r = runBat(gradlew, ['assembleRelease', '--console=plain'], { cwd: ANDROID, env });
  runBat(gradlew, ['--stop'], { cwd: ANDROID, env, stdio: 'ignore' }); // libera a memória do Gradle
  if (r.status !== 0) fail('O Gradle falhou (veja as mensagens acima). Rode de novo: "npm run apk" continua de onde parou.');

  const built = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(built)) fail(`O Gradle terminou, mas não achei ${built}.`);
  checkBakedUrl(built, url);

  step('Assinando');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'FORJA.apk');
  sign(built, out, v.buildTools);

  const size = `${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`;
  const minutes = Math.round((Date.now() - t0) / 60_000);
  console.log(`\n✔ APK pronto: ${out} (${size}, versão ${versionName} · ${versionCode}, ${minutes} min)`);
  console.log(`  Servidor dentro do app: ${url}`);
  const web = path.join(FORJA_HOME, 'app', 'web');
  if (fs.existsSync(web)) {
    fs.copyFileSync(out, path.join(web, 'forja.apk'));
    console.log(`  Para baixar no celular: ${url}/forja.apk`);
  }
}

async function help() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log((/\/\*\*([\s\S]*?)\*\//.exec(src)?.[1] ?? '').replace(/^ \* ?/gm, '').trim());
}

// ---------------------------------------------------------------- ferramentas

async function ensureJdk() {
  const java = path.join(JDK, 'bin', 'java.exe');
  if (fs.existsSync(java) && /version "17\./.test(spawnSync(java, ['-version'], { encoding: 'utf8' }).stderr ?? '')) return;
  rmrf(JDK);
  step('Baixando o Java 17 (OpenJDK da Microsoft, ~180 MB)');
  const url = 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip';
  const zip = path.join(DOWNLOADS, 'jdk-17.zip');
  await download(url, zip);
  let sum = '';
  try {
    sum = (await (await fetch(`${url}.sha256sum.txt`, { signal: AbortSignal.timeout(30_000) })).text()).trim().split(/\s+/)[0].toLowerCase();
  } catch {}
  if (/^[0-9a-f]{64}$/.test(sum)) await verify(zip, 'sha256', sum);
  else console.log('  (sem soma de verificação publicada; seguindo com o download por HTTPS)');
  extractSingleDir(zip, JDK);
  fs.rmSync(zip, { force: true });
}

async function ensureSdk(v) {
  const bin = path.join(SDK, 'cmdline-tools', 'latest', 'bin');
  const sdkmanager = path.join(bin, 'sdkmanager.bat');
  if (!fs.existsSync(sdkmanager)) {
    step('Baixando as ferramentas de linha de comando do Android (~150 MB)');
    const base = 'https://dl.google.com/android/repository/';
    const xml = await (await fetch(`${base}repository2-3.xml`, { signal: AbortSignal.timeout(60_000) })).text();
    const pkg = /<remotePackage path="cmdline-tools;latest">([\s\S]*?)<\/remotePackage>/.exec(xml)?.[1] ?? '';
    const win = [...pkg.matchAll(/<archive>([\s\S]*?)<\/archive>/g)].map((m) => m[1]).find((a) => /<host-os>windows<\/host-os>/.test(a));
    const file = win && /<url>([^<]+)<\/url>/.exec(win)?.[1];
    const sha1 = win && /<checksum[^>]*>([0-9a-f]{40})<\/checksum>/.exec(win)?.[1];
    if (!file || !sha1) throw new Error('Não achei o pacote "cmdline-tools" para Windows no repositório do Google.');
    const zip = path.join(DOWNLOADS, file);
    await download(base + file, zip);
    await verify(zip, 'sha1', sha1);
    extractSingleDir(zip, path.join(SDK, 'cmdline-tools', 'latest'));
    fs.rmSync(zip, { force: true });
  }
  // O "android" (Android CLI) substituiu o sdkmanager nas versões novas; --no-metrics desliga a coleta de uso.
  const cli = path.join(bin, 'android.exe');
  const env = javaEnv();
  const sdk = (args, opts = {}) =>
    fs.existsSync(cli)
      ? spawnSync(cli, ['--no-metrics', `--sdk=${SDK}`, 'sdk', ...args], { env, stdio: 'inherit', ...opts })
      : runBat(sdkmanager, [`--sdk_root=${SDK}`, ...(args[0] === 'list' ? ['--list'] : args.slice(1).map((p) => p.replace('/', ';')))], { env, ...opts });
  const platform = platformPackage(v.compileSdk, (pattern) => sdk(['list', '--all', pattern], { encoding: 'utf8', stdio: 'pipe' }).stdout ?? '');
  const wanted = ['platform-tools', platform, `build-tools/${v.buildTools}`, `ndk/${v.ndk}`, `cmake/${CMAKE}`];
  const missing = wanted.filter((p) => !fs.existsSync(path.join(SDK, ...p.split('/'), p === 'platform-tools' ? 'adb.exe' : '')));
  if (!missing.length) return;
  step(`Instalando do Android SDK: ${missing.join(', ')} (o NDK sozinho tem ~1 GB)`);
  if (!fs.existsSync(cli)) {
    // sdkmanager antigo: aceita as licenças (o mesmo que clicar "Accept" no Android Studio).
    runBat(sdkmanager, [`--sdk_root=${SDK}`, '--licenses'], { env, input: 'y\n'.repeat(50), stdio: ['pipe', 'ignore', 'inherit'] });
  }
  const r = sdk(['install', ...missing]);
  const still = missing.filter((p) => !fs.existsSync(path.join(SDK, ...p.split('/'))));
  if (r.status !== 0 || still.length) throw new Error(`O Android SDK não instalou: ${still.join(', ') || '(veja acima)'}.`);
}

/** compileSdk 37 virou "android-37.0" no repositório do Google (desde o 36.1 há versões "menores"). */
function platformPackage(compileSdk, list) {
  for (const name of [`android-${compileSdk}`, `android-${compileSdk}.0`]) {
    if (fs.existsSync(path.join(SDK, 'platforms', name))) return `platforms/${name}`;
  }
  const out = list(`platforms/android-${compileSdk}*`);
  const names = [...out.matchAll(/^\s+platforms[/;](android-[\w.-]+)\s/gm)].map((m) => m[1]);
  const pick = names.find((n) => n === `android-${compileSdk}`) ?? names.find((n) => n === `android-${compileSdk}.0`);
  return `platforms/${pick ?? `android-${compileSdk}`}`;
}

function androidVersions(nodeModules) {
  const file = path.join(nodeModules, 'react-native', 'gradle', 'libs.versions.toml');
  if (!fs.existsSync(file)) throw new Error(`Não achei ${file}. Rode "npm install" na raiz do projeto.`);
  const toml = fs.readFileSync(file, 'utf8');
  const get = (k) => new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, 'm').exec(toml)?.[1];
  const v = { compileSdk: get('compileSdk'), buildTools: get('buildTools'), ndk: get('ndkVersion') };
  if (!v.compileSdk || !v.buildTools || !v.ndk) throw new Error(`Versões do Android não encontradas em ${file}.`);
  return v;
}

// ---------------------------------------------------------------- projeto

function serverUrl() {
  let url = typeof flags.url === 'string' ? flags.url : '';
  if (!url) {
    try {
      url = readEnv(path.join(FORJA_HOME, 'forja.env')).PUBLIC_URL ?? '';
    } catch {}
  }
  url = url.trim().replace(/\/$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(url)) {
    fail(
      [
        'Preciso do endereço público (https) do FORJA para colocar dentro do app.',
        '  Com o FORJA neste PC: rode antes "npm run pc:tunnel".',
        '  Ou diga qual é:       node tools/android/build-apk.mjs build --url https://forja.exemplo.ts.net',
      ].join('\n'),
    );
  }
  return url;
}

/** Copia só o que o app precisa para C:\forja-apk\src (mantém android\ e node_modules\ para a próxima vez ser rápida). */
function syncProject(url) {
  step(`Copiando o app para ${SRC}`);
  fs.mkdirSync(path.join(SRC, 'apps', 'api'), { recursive: true });
  for (const f of ['package.json', 'package-lock.json', '.npmrc', 'apps/api/package.json']) {
    if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(SRC, f));
  }
  mirror('packages/shared', ['node_modules', 'dist']);
  mirror('apps/app', ['node_modules', 'dist', 'android', 'ios', '.expo', /^\.env/]);
  // O endereço também vai num .env do app (além da variável de ambiente), para o Metro sempre enxergar.
  fs.writeFileSync(path.join(APP_SRC, '.env'), `EXPO_PUBLIC_API_URL=${url}\n`);
}

function mirror(rel, skip) {
  const from = path.join(ROOT, rel);
  const to = path.join(SRC, rel);
  const skipped = (name) => skip.some((s) => (s instanceof RegExp ? s.test(name) : s === name));
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(to)) if (!skipped(name)) rmrf(path.join(to, name));
  for (const name of fs.readdirSync(from)) if (!skipped(name)) fs.cpSync(path.join(from, name), path.join(to, name), { recursive: true });
}

function installDeps() {
  const hash = hashOf(['package-lock.json', 'package.json', 'apps/app/package.json', 'packages/shared/package.json'].map((f) => path.join(SRC, f)));
  const marker = path.join(SRC, 'node_modules', '.forja-lock');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === hash) return;
  step('Instalando as dependências (npm ci)');
  run('npm ci --no-audit --no-fund --loglevel=error', { cwd: SRC, shell: true });
  fs.writeFileSync(marker, hash);
}

/** expo prebuild só quando a configuração nativa muda (app.json, dependências); senão reaproveita o android\. */
function prebuild(env) {
  const files = ['apps/app/app.json', 'apps/app/package.json', 'package-lock.json'].map((f) => path.join(ROOT, f));
  const hash = hashOf([...files, fileURLToPath(import.meta.url)]);
  const marker = path.join(ANDROID, '.forja-prebuild');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === hash) return;
  step('Gerando o projeto Android (expo prebuild)');
  run('npx expo prebuild --platform android --clean --no-install', { cwd: APP_SRC, shell: true, env });
  const props = path.join(ANDROID, 'gradle.properties');
  setProp(props, 'reactNativeArchitectures', ABIS);
  // Sem "caminhos longos" ligados no Windows, o CMake precisa encurtar os nomes dos .o (limite padrão de 250).
  setProp(props, 'expo.android.cmakeObjectPathMax', '0');
  setProp(props, 'org.gradle.jvmargs', '-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8');
  fs.writeFileSync(path.join(ANDROID, 'local.properties'), `sdk.dir=${SDK.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);
  fs.writeFileSync(marker, hash);
}

/** Versão nova a cada build (o Android só atualiza por cima com versionCode maior ou igual) e JS sempre recompilado. */
function prepareBuild() {
  const gradleFile = ['build.gradle', 'build.gradle.kts'].map((f) => path.join(ANDROID, 'app', f)).find((f) => fs.existsSync(f));
  if (!gradleFile) throw new Error('Não achei android/app/build.gradle (o prebuild falhou?).');
  const versionCode = Math.floor(Date.now() / 60_000) - 28_000_000; // minutos: sempre cresce
  const text = fs.readFileSync(gradleFile, 'utf8');
  if (!/versionCode\s*=?\s*\d+/.test(text)) throw new Error(`Não achei "versionCode" em ${gradleFile}.`);
  fs.writeFileSync(gradleFile, text.replace(/(versionCode\s*=?\s*)\d+/, `$1${versionCode}`));
  const versionName = JSON.parse(fs.readFileSync(path.join(APP_SRC, 'app.json'), 'utf8')).expo?.version ?? '?';
  // O Gradle não vê mudanças fora de apps/app (packages/shared) nem no endereço: apaga o bundle JS antigo.
  const gen = path.join(ANDROID, 'app', 'build', 'generated');
  rmrf(path.join(gen, 'assets'));
  rmrf(path.join(gen, 'sourcemaps'));
  if (fs.existsSync(path.join(gen, 'res'))) {
    for (const d of fs.readdirSync(path.join(gen, 'res'))) if (/^createBundle/i.test(d)) rmrf(path.join(gen, 'res', d));
  }
  return { versionCode, versionName };
}

function checkBakedUrl(apk, url) {
  const r = spawnSync(TAR, ['-xOf', apk, 'assets/index.android.bundle'], { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout?.length) return console.log('  (não consegui conferir o endereço dentro do APK)');
  if (!r.stdout.includes(Buffer.from(url))) fail(`O APK não ficou com o endereço ${url}. Rode de novo "npm run apk".`);
  console.log(`  Conferido: o app aponta para ${url}`);
}

function sign(input, out, buildTools) {
  const key = ensureKeystore();
  const apksigner = path.join(SDK, 'build-tools', buildTools, 'apksigner.bat');
  const env = { ...javaEnv(), FORJA_KS_PASS: key.password };
  const tmp = `${out}.tmp`;
  const r = runBat(
    apksigner,
    ['sign', '--ks', key.jks, '--ks-key-alias', key.alias, '--ks-pass', 'env:FORJA_KS_PASS', '--key-pass', 'env:FORJA_KS_PASS', '--out', tmp, input],
    { env },
  );
  if (r.status !== 0) throw new Error('O apksigner não conseguiu assinar o APK.');
  if (runBat(apksigner, ['verify', tmp], { env, stdio: 'ignore' }).status !== 0) throw new Error('A assinatura do APK não confere.');
  fs.rmSync(`${tmp}.idsig`, { force: true });
  fs.renameSync(tmp, out);
}

function ensureKeystore() {
  const jks = path.join(CRED_DIR, 'forja-release.p12');
  const meta = path.join(CRED_DIR, 'keystore.json');
  if (fs.existsSync(jks) && fs.existsSync(meta)) return { jks, ...JSON.parse(fs.readFileSync(meta, 'utf8')) };
  if (fs.existsSync(jks)) throw new Error(`Achei ${jks}, mas não ${meta} (com a senha). Recupere o arquivo do backup.`);
  step(`Criando a chave de assinatura do app em ${CRED_DIR} (uma vez só)`);
  fs.mkdirSync(CRED_DIR, { recursive: true });
  const key = { alias: 'forja', password: crypto.randomBytes(18).toString('base64url'), createdAt: new Date().toISOString() };
  const r = spawnSync(
    path.join(JDK, 'bin', 'keytool.exe'),
    ['-genkeypair', '-keystore', jks, '-storetype', 'PKCS12', '-alias', key.alias, '-keyalg', 'RSA', '-keysize', '4096', '-validity', '36500',
      '-dname', 'CN=FORJA, OU=FORJA, O=FORJA, C=BR', '-storepass:env', 'FORJA_KS_PASS', '-keypass:env', 'FORJA_KS_PASS'],
    { env: { ...javaEnv(), FORJA_KS_PASS: key.password }, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`O keytool falhou: ${(r.stderr || r.stdout || '').trim()}`);
  fs.writeFileSync(meta, `${JSON.stringify(key, null, 2)}\n`);
  fs.writeFileSync(
    path.join(CRED_DIR, 'LEIA-ME.txt'),
    [
      'Chave de assinatura do APK do FORJA (criada por tools/android/build-apk.mjs).',
      'NÃO apague e NÃO coloque no git. Sem ela, o Android não aceita atualizar o app por cima:',
      'cada amigo teria que desinstalar a versão antiga antes de instalar a nova.',
      'Faça uma cópia desta pasta num lugar seguro.',
      '',
    ].join('\r\n'),
  );
  return { jks, ...key };
}

// ---------------------------------------------------------------- ambiente

function toolsDir() {
  if (process.env.FORJA_APK_HOME) return path.resolve(process.env.FORJA_APK_HOME);
  const short = 'C:\\forja-apk';
  try {
    fs.mkdirSync(short, { recursive: true });
    return short;
  } catch {
    return path.join(os.homedir(), '.forja-apk');
  }
}

function javaEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== 'PATH') env[k] = v;
  env.Path = [path.join(JDK, 'bin'), path.join(SDK, 'platform-tools'), process.env.Path ?? process.env.PATH ?? ''].join(path.delimiter);
  env.JAVA_HOME = JDK;
  env.ANDROID_HOME = SDK;
  env.ANDROID_SDK_ROOT = SDK;
  env.GRADLE_USER_HOME = GRADLE_HOME;
  return env;
}

function buildEnv(url) {
  return { ...javaEnv(), EXPO_PUBLIC_API_URL: url, NODE_ENV: 'production', CI: '1', EXPO_NO_TELEMETRY: '1' };
}

function setProp(file, key, value) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key.replace(/\./g, '\\.')}=.*$`, 'm');
  fs.writeFileSync(file, re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`);
}

// ---------------------------------------------------------------- utilidades

async function download(url, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download falhou (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let done = 0;
  let shown = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    done += chunk.length;
    const pct = total ? Math.floor((done / total) * 10) * 10 : 0;
    if (total && pct > shown) {
      shown = pct;
      console.log(`  ${pct}% de ${(total / 1024 / 1024).toFixed(0)} MB`);
    }
  });
  await pipeline(body, fs.createWriteStream(`${file}.part`));
  fs.renameSync(`${file}.part`, file);
}

async function verify(file, algo, expected) {
  const h = crypto.createHash(algo);
  await pipeline(fs.createReadStream(file), h);
  const got = h.digest('hex');
  if (got !== expected.toLowerCase()) {
    fs.rmSync(file, { force: true });
    throw new Error(`O arquivo baixado está corrompido (${algo} não confere): ${path.basename(file)}. Rode de novo.`);
  }
}

/** Extrai um .zip com uma pasta só dentro e coloca o conteúdo dessa pasta em dest. */
function extractSingleDir(zip, dest) {
  const tmp = `${dest}.tmp`;
  rmrf(tmp);
  fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync(TAR, ['-xf', zip, '-C', tmp], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Não consegui extrair ${zip}: ${(r.stderr || '').trim()}`);
  const items = fs.readdirSync(tmp);
  const inner = items.length === 1 && fs.statSync(path.join(tmp, items[0])).isDirectory() ? path.join(tmp, items[0]) : tmp;
  rmrf(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(inner, dest);
  rmrf(tmp);
}

function hashOf(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(fs.existsSync(f) ? fs.readFileSync(f) : Buffer.from(`sem:${f}`));
  return h.digest('hex');
}

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

/** .bat no Windows só roda pelo cmd.exe (o Node recusa direto); aspas no padrão do cmd /s /c. */
function runBat(file, args, opts = {}) {
  const quote = (a) => (/[\s"&|<>^(),;=]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  const line = `"${[quote(file), ...args.map(quote)].join(' ')}"`;
  return spawnSync('cmd.exe', ['/d', '/s', '/c', line], { stdio: 'inherit', windowsVerbatimArguments: true, ...opts });
}

function run(cmd, opts) {
  const r = spawnSync(cmd, { stdio: 'inherit', ...opts });
  if (r.error) throw new Error(`Não consegui rodar "${cmd}": ${r.error.message}`);
  if (r.status !== 0) throw new Error(`"${cmd}" terminou com erro (código ${r.status}).`);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 5 });
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

function step(msg) {
  console.log(`\n==> ${msg}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
