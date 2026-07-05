import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import path from 'node:path'

// Generates app/public/og.png — the social share card. 1200x630, Ledger Dark:
// near-black canvas, real SPY sparkline (recent window) with emerald fill,
// wordmark + tagline in a hand-rolled block font. Pure Node, no deps.
const W = 1200, H = 630
const buf = Buffer.alloc(W * H * 3)
const BG = [12, 15, 14]      // #0c0f0e
const FG = [242, 246, 244]   // near-white
const MUT = [150, 165, 158]  // muted
const EM = [52, 211, 153]    // emerald

for (let i = 0; i < W * H; i++) { buf[i*3]=BG[0]; buf[i*3+1]=BG[1]; buf[i*3+2]=BG[2] }
const px = (x, y, c, a = 1) => {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const o = (y * W + x) * 3
  for (let k = 0; k < 3; k++) buf[o+k] = Math.round(buf[o+k] * (1 - a) + c[k] * a)
}
const rect = (x, y, w, h, c, a = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x+i, y+j, c, a) }

// --- sparkline from real SPY data (recent ~4y, log-free linear on recent window) ---
const root = path.resolve(import.meta.dirname, '..')
let closes = []
try {
  const spy = JSON.parse(readFileSync(path.join(root, 'app/public/data/tickers/SPY.json'), 'utf8'))
  const recs = spy.records.slice(-1008)
  // split-adjust (splits only)
  let f = 1; const adj = new Array(recs.length)
  for (let i = recs.length - 1; i >= 0; i--) { adj[i] = recs[i].close / f; const s = recs[i].splitFactor; if (s && s !== 1) f *= s }
  const step = Math.max(1, Math.floor(adj.length / 300))
  for (let i = 0; i < adj.length; i += step) closes.push(adj[i])
} catch { closes = Array.from({ length: 300 }, (_, i) => 100 + i + Math.sin(i / 8) * 12) }
const min = Math.min(...closes), max = Math.max(...closes)
const chartTop = 300, chartBot = 560, chartL = 60, chartR = 1140
const X = i => chartL + (i / (closes.length - 1)) * (chartR - chartL)
const Y = v => chartBot - ((v - min) / (max - min || 1)) * (chartBot - chartTop)
// gradient fill under the line
for (let i = 0; i < closes.length - 1; i++) {
  const x0 = X(i), x1 = X(i+1), y0 = Y(closes[i]), y1 = Y(closes[i+1])
  const steps = Math.max(1, Math.round(x1 - x0))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t
    for (let yy = Math.round(y); yy < chartBot; yy++) { const a = 0.14 * (1 - (yy - y) / (chartBot - y)); px(x, yy, EM, Math.max(0, a)) }
  }
}
// the line (2.5px)
for (let i = 0; i < closes.length - 1; i++) {
  const x0 = X(i), x1 = X(i+1), y0 = Y(closes[i]), y1 = Y(closes[i+1])
  const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)))
  for (let s = 0; s <= steps; s++) { const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; for (let d = -1; d <= 1; d++) px(x, y + d, EM, 0.9) }
}

// --- tiny 5x7 block font for the wordmark + tagline ---
const FONT = {
  f:['01110','10000','10000','11100','10000','10000','10000'],
  a:['00000','00000','01110','00010','01110','10010','01110'],
  t:['01000','01000','11110','01000','01000','01000','00110'],
  h:['10000','10000','11100','10010','10010','10010','10010'],
  o:['00000','00000','01100','10010','10010','10010','01100'],
  m:['00000','00000','11100','10101','10101','10101','10101'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  B:['11100','10010','11100','10010','10010','10010','11100'],
  c:['00000','00000','01110','10000','10000','10000','01110'],
  k:['10000','10010','10100','11000','10100','10010','10010'],
  s:['00000','00000','01110','10000','01100','00010','11100'],
  e:['00000','00000','01100','10010','11110','10000','01110'],
  i:['00100','00000','01100','00100','00100','00100','01110'],
  n:['00000','00000','11100','10010','10010','10010','10010'],
  l:['01100','00100','00100','00100','00100','00100','01110'],
  r:['00000','00000','10110','11000','10000','10000','10000'],
  d:['00010','00010','01110','10010','10010','10010','01110'],
  u:['00000','00000','10010','10010','10010','10010','01110'],
  y:['00000','00000','10010','10010','01110','00010','01100'],
  p:['00000','00000','11100','10010','11100','10000','10000'],
  v:['00000','00000','10010','10010','10010','01100','00100'],
  '.':['00000','00000','00000','00000','00000','00000','00100'],
  ',':['00000','00000','00000','00000','00000','00100','01000'],
  b:['10000','10000','11100','10010','10010','10010','11100'],
  g:['00000','00000','01110','10010','01110','00010','01100'],
  w:['00000','00000','10001','10001','10101','10101','01010'],
}
const text = (str, x, y, scale, c, a = 1) => {
  let cx = x
  for (const ch of str) {
    const g = FONT[ch] || FONT[' ']
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (g[r][col] === '1') rect(cx + col*scale, y + r*scale, scale, scale, c, a)
    cx += 6 * scale
  }
  return cx
}

// wordmark (all-lowercase to match the mono brand), accent bar below it, taglines
text('fathom', 84, 90, 14, FG)                                             // 90..188
rect(84, 205, 260, 6, EM)
text('backtesting . allocation . monte carlo', 86, 238, 4, MUT)
text('decades of market data, shareable by link', 86, 282, 4, MUT)

// --- encode PNG ---
const png = () => {
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) { raw[y * (W*3+1)] = 0; buf.copy(raw, y * (W*3+1) + 1, y*W*3, (y+1)*W*3) }
  const idat = deflateSync(raw, { level: 9 })
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}
let CRC
function crc32(b) { if (!CRC) { CRC = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c } } let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff }

writeFileSync(path.join(root, 'app/public/og.png'), png())
console.log('wrote app/public/og.png', W + 'x' + H, 'from', closes.length, 'sparkline points')
