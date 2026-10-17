// A QR code for a short URL, drawn with terminal half-blocks. Zero dependencies, so
// this is the small encoder: byte mode, error correction L, versions 1-6 (up to 134
// bytes), which is far more than a tailnet address needs.

// [codewords in all, error-correction codewords per block, blocks] for ECC L.
const VERSIONS = [[26, 7, 1], [44, 10, 1], [70, 15, 1], [100, 20, 1], [134, 26, 1], [172, 18, 2]] as const;
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

function gfMul(a: number, b: number) {
  let r = 0;
  for (; b; b >>= 1) { if (b & 1) r ^= a; a <<= 1; if (a & 0x100) a ^= 0x11d; }
  return r;
}

function rsRemainder(data: number[], degree: number) {
  const div = Array(degree).fill(0); div[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { div[j] = gfMul(div[j], root); if (j + 1 < degree) div[j] ^= div[j + 1]; }
    root = gfMul(root, 2);
  }
  const out: number[] = Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ out.shift()!; out.push(0);
    div.forEach((c, i) => { out[i] ^= gfMul(c, f); });
  }
  return out;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const v = VERSIONS.findIndex(([total, ec, n]) => total - ec * n >= bytes.length + 2);
  if (v < 0) throw new Error("text too long for qr()");
  const [total, ecLen, nBlocks] = VERSIONS[v]!;
  const dataLen = total - ecLen * nBlocks;
  const size = 17 + 4 * (v + 1);

  const bits: number[] = [];
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);

  const per = dataLen / nBlocks;
  const blocks = Array.from({ length: nBlocks }, (_, i) => data.slice(i * per, (i + 1) * per));
  const ecs = blocks.map((b) => rsRemainder(b, ecLen));
  const words: number[] = [];
  for (let i = 0; i < per; i++) blocks.forEach((b) => words.push(b[i]!));
  for (let i = 0; i < ecLen; i++) ecs.forEach((e) => words.push(e[i]!));

  const m: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y]![x] = dark; fn[y]![x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v]!;
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === al.at(-1)) || (cx === al.at(-1) && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  const format = (mask: number) => {
    const d = (1 << 3) | mask;                       // ECC L is 01
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);

  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y]![x] && i < words.length * 8) { m[y]![x] = ((words[i >> 3]! >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }

  const MASKS = [
    (x: number, y: number) => (x + y) % 2 === 0, (_: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  // ponytail: penalty counts only runs and 2x2 blocks (rules 1-2 of 4); every mask
  // decodes, this just picks a calmer one. Add the other two rules if scans fail.
  const penalty = (g: boolean[][]) => {
    let p = 0;
    for (let a = 0; a < size; a++) for (const row of [true, false]) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const same = row ? g[a]![b] === g[a]![b - 1] : g[b]![a] === g[b - 1]![a];
        run = same ? run + 1 : 1;
        if (run === 5) p += 3; else if (run > 5) p++;
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      if (g[y]![x] === g[y]![x + 1] && g[y]![x] === g[y + 1]![x] && g[y]![x] === g[y + 1]![x + 1]) p += 3;
    }
    return p;
  };
  const masked = (k: number) => m.map((row, y) => row.map((d, x) => (!fn[y]![x] && MASKS[k]!(x, y) ? !d : d)));
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) { const p = penalty(masked(k)); if (p < bestP) { bestP = p; best = k; } }
  format(best);
  return masked(best);
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const v = VERSIONS.findIndex(([total, ec, n]) => total - ec * n >= bytes.length + 2);
  if (v < 0) throw new Error("text too long for qr()");
  const [total, ecLen, nBlocks] = VERSIONS[v]!;
  const dataLen = total - ecLen * nBlocks;
  const size = 17 + 4 * (v + 1);

  const bits: number[] = [];
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);

  const per = dataLen / nBlocks;
  const blocks = Array.from({ length: nBlocks }, (_, i) => data.slice(i * per, (i + 1) * per));
  const ecs = blocks.map((b) => rsRemainder(b, ecLen));
  const words: number[] = [];
  for (let i = 0; i < per; i++) blocks.forEach((b) => words.push(b[i]!));
  for (let i = 0; i < ecLen; i++) ecs.forEach((e) => words.push(e[i]!));

  const m: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y]![x] = dark; fn[y]![x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v]!;
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === al.at(-1)) || (cx === al.at(-1) && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  const format = (mask: number) => {
    const d = (1 << 3) | mask;                       // ECC L is 01
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);

  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y]![x] && i < words.length * 8) { m[y]![x] = ((words[i >> 3]! >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }

  const MASKS = [
    (x: number, y: number) => (x + y) % 2 === 0, (_: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  // ponytail: penalty counts only runs and 2x2 blocks (rules 1-2 of 4); every mask
  // decodes, this just picks a calmer one. Add the other two rules if scans fail.
  const penalty = (g: boolean[][]) => {
    let p = 0;
    for (let a = 0; a < size; a++) for (const row of [true, false]) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const same = row ? g[a]![b] === g[a]![b - 1] : g[b]![a] === g[b - 1]![a];
        run = same ? run + 1 : 1;
        if (run === 5) p += 3; else if (run > 5) p++;
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      if (g[y]![x] === g[y]![x + 1] && g[y]![x] === g[y + 1]![x] && g[y]![x] === g[y + 1]![x + 1]) p += 3;
    }
    return p;
  };
  const masked = (k: number) => m.map((row, y) => row.map((d, x) => (!fn[y]![x] && MASKS[k]!(x, y) ? !d : d)));
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) { const p = penalty(masked(k)); if (p < bestP) { bestP = p; best = k; } }
  format(best);
  const out = masked(best);
  // masked() copied the format bits drawn for mask 0; redraw them into the result.
  const fm = m;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fn[y]![x]) out[y]![x] = fm[y]![x]!;
  return out;
}

// Light modules are the filled blocks, so a dark terminal shows dark modules on a
// white field with a two-module quiet zone, which is what phone cameras expect.
export function qr(text: string): string {
  const g = qrMatrix(text), q = 2, n = g.length + 2 * q;
  const dark = (x: number, y: number) => g[y - q]?.[x - q] === true;
  const lines: string[] = [];
  for (let y = 0; y < n; y += 2) {
    let line = "";
    for (let x = 0; x < n; x++) {
      const t = dark(x, y), b = y + 1 < n && dark(x, y + 1);
      line += t ? (b ? " " : "▄") : (b ? "▀" : "█");
    }
    lines.push(line);
  }
  return lines.join("\n");
}
