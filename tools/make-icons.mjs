// Generates DevLens PNG icons (16/32/48/128) from a vector definition — no deps.
// A magnifying "lens" mark on a rounded indigo square. Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'icons';
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor for anti-aliasing

// Brand palette
const BG = [79, 70, 229]; // indigo-600 #4F46E5
const WHITE = [255, 255, 255];

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const hypot = Math.hypot;

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp01(t);
  return hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Is unit point (u,v) inside the rounded-square background?
function inBg(u, v) {
  const m = 0.045; // margin
  const rr = 0.17; // corner radius
  const half = 0.5 - m;
  const dx = Math.abs(u - 0.5),
    dy = Math.abs(v - 0.5);
  if (dx > half || dy > half) return false;
  const cx = half - rr,
    cy = half - rr;
  if (dx > cx && dy > cy) return hypot(dx - cx, dy - cy) <= rr;
  return true;
}

// Returns [r,g,b,a] (0..255) for unit coords (u,v).
function sample(u, v) {
  if (!inBg(u, v)) return [0, 0, 0, 0];

  const cx = 0.43,
    cy = 0.43; // lens center
  const R = 0.27; // ring outer radius
  const t = 0.085; // ring thickness
  const Ri = R - t; // ring inner radius
  const d = Math.SQRT1_2; // 45deg unit
  const p1x = cx + d * R,
    p1y = cy + d * R; // handle start (on ring)
  const p2x = cx + d * (R + 0.2),
    p2y = cy + d * (R + 0.2); // handle end
  const hw = 0.052; // handle half-width

  const dc = hypot(u - cx, v - cy);
  const onRing = dc >= Ri && dc <= R;
  const onHandle = distSeg(u, v, p1x, p1y, p2x, p2y) <= hw;

  let c = BG;
  if (dc < Ri) {
    // glass interior: subtle white tint over indigo
    c = BG.map((ch, i) => Math.round(ch + (WHITE[i] - ch) * 0.2));
  }
  if (onRing || onHandle) c = WHITE;
  return [c[0], c[1], c[2], 255];
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const [pr, pg, pb, pa] = sample(u, v);
          const af = pa / 255;
          r += pr * af;
          g += pg * af;
          b += pb * af;
          a += pa;
        }
      }
      const n = SS * SS;
      const af = a / n / 255 || 0;
      const i = (y * size + x) * 4;
      // store straight (non-premultiplied) RGBA
      buf[i] = af ? Math.round(r / n / af) : 0;
      buf[i + 1] = af ? Math.round(g / n / af) : 0;
      buf[i + 2] = af ? Math.round(b / n / af) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

// --- minimal PNG encoder (RGBA, 8-bit, no interlace) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // filtered scanlines (filter byte 0 per row)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

await mkdir(OUT, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, render(size));
  await writeFile(`${OUT}/icon${size}.png`, png);
  console.log(`wrote ${OUT}/icon${size}.png (${png.length} bytes)`);
}
console.log('done');
