// Gera os ícones do FORJA (app Android, PWA e favicon) a partir de um SVG.
// Uso: npm run assets:build
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const images = join(root, 'apps/app/assets/images');
const pub = join(root, 'apps/app/public');

const BG = '#0A0A0B';
const INK = '#FAFAFA';
const ACCENT = '#8B7CF6';

/** Monograma "F": haste e barra superior claras, barra do meio no tom de destaque. */
function glyph(scale, ink = INK, accent = ACCENT) {
  const s = (n) => 512 + (n - 512) * scale;
  const r = 28 * scale;
  return `
    <rect x="${s(360)}" y="${s(256)}" width="${120 * scale}" height="${512 * scale}" rx="${r}" fill="${ink}"/>
    <rect x="${s(360)}" y="${s(256)}" width="${328 * scale}" height="${116 * scale}" rx="${r}" fill="${ink}"/>
    <rect x="${s(360)}" y="${s(462)}" width="${248 * scale}" height="${108 * scale}" rx="${r}" fill="${accent}"/>`;
}

const svg = (body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

function png(markup, size, file) {
  const out = new Resvg(markup, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, out);
  console.log('✓', file.replace(root, '.'), `${size}px`);
}

// App (ícone cheio) e favicon
png(svg(glyph(1), BG), 1024, join(images, 'icon.png'));
png(svg(glyph(1.1), BG), 48, join(images, 'favicon.png'));
// Android adaptativo: o desenho fica dentro da zona segura (~66% central)
png(svg(glyph(0.72)), 1024, join(images, 'android-icon-foreground.png'));
png(svg('', BG), 1024, join(images, 'android-icon-background.png'));
png(svg(glyph(0.72, '#FFFFFF', '#FFFFFF')), 1024, join(images, 'android-icon-monochrome.png'));
// Splash (fundo vem da configuração)
png(svg(glyph(1)), 512, join(images, 'splash-icon.png'));
// PWA (PC e celular pelo navegador)
png(svg(glyph(1), BG), 192, join(pub, 'icons/icon-192.png'));
png(svg(glyph(1), BG), 512, join(pub, 'icons/icon-512.png'));
png(svg(glyph(0.8), BG), 512, join(pub, 'icons/maskable-512.png'));
png(svg(glyph(1), BG), 180, join(pub, 'icons/apple-touch-icon.png'));

// Windows: ícone do "FORJA Servidor" (tools/host/launcher.cs) — quadrado arredondado, vários tamanhos.
// Até 64 px em bitmap (o que o Windows e o .NET leem em qualquer lugar); 256 px em PNG.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="208" fill="${BG}"/>${glyph(1.2)}</svg>`;
const frames = [16, 20, 24, 32, 40, 48, 64, 256].map((size) => {
  const img = new Resvg(rounded, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render();
  return { size, data: size >= 256 ? img.asPng() : dib(img.pixels, size) };
});
writeIco(frames, join(root, 'tools/host/forja.ico'));

/** Bitmap 32 bits de baixo para cima (BGRA sem pré-multiplicação) + máscara AND vazia: o formato clássico do .ico. */
function dib(rgba, size) {
  const maskRow = Math.ceil(size / 32) * 4;
  const buf = Buffer.alloc(40 + size * size * 4 + maskRow * size);
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8); // cor + máscara
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = ((size - 1 - y) * size + x) * 4;
      const dst = 40 + (y * size + x) * 4;
      const a = rgba[src + 3];
      const un = (c) => (a ? Math.min(255, Math.round((c * 255) / a)) : 0);
      buf[dst] = un(rgba[src + 2]);
      buf[dst + 1] = un(rgba[src + 1]);
      buf[dst + 2] = un(rgba[src]);
      buf[dst + 3] = a;
    }
  }
  return buf;
}

function writeIco(entries, file) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  writeFileSync(file, Buffer.concat([head, ...entries.map((e) => e.data)]));
  console.log('✓', file.replace(root, '.'), entries.map((e) => e.size).join('/'));
}
