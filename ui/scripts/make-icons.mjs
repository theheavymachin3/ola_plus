// Draws the OLA Plus app icon (three faders) into PNGs, with no dependencies.
// Run: node scripts/make-icons.mjs     Output: public/icons/*.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#0e1116');
const TRACK = hex('#2a313c');
const CAP = hex('#e6edf3');
const FADERS = [
  { x: 0.28, level: 0.35, color: hex('#3b82f6') },
  { x: 0.5, level: 0.72, color: hex('#e8a317') },
  { x: 0.72, level: 0.5, color: hex('#3fb950') },
];
// Everything sits inside the central 60% so a maskable (cropped) icon never loses it.
const TOP = 0.22;
const BOTTOM = 0.78;
const TRACK_W = 0.12;
const CAP_W = 0.18;
const CAP_H = 0.07;

function inRoundRect(x, y, cx, top, bottom, w, r) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  if (x < x0 || x > x1 || y < top || y > bottom) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(top + r - y, 0, y - (bottom - r));
  return dx * dx + dy * dy <= r * r;
}

// Colour of the icon at a point in unit coordinates.
function shade(x, y) {
  let c = BG;
  for (const f of FADERS) {
    if (inRoundRect(x, y, f.x, TOP, BOTTOM, TRACK_W, TRACK_W / 2)) c = TRACK;
    const capY = BOTTOM - (BOTTOM - TOP) * f.level;
    if (inRoundRect(x, y, f.x, capY, BOTTOM, TRACK_W, TRACK_W / 2) && y >= capY) c = f.color;
    if (inRoundRect(x, y, f.x, capY - CAP_H / 2, capY + CAP_H / 2, CAP_W, CAP_H / 2)) c = CAP;
  }
  return c;
}

function render(size) {
  const SS = 3; // 3x3 supersampling for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const c = shade((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const o = (j * size + i) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
// 192/512: install icons (full-bleed, so they double as maskable). 180: iOS home screen.
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  fs.writeFileSync(path.join(OUT, `${name}.png`), png(size, render(size)));
  console.log(`wrote ${name}.png (${size}x${size})`);
}
