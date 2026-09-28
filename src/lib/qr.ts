/**
 * Minimal QR encoder, no dependencies (byte mode, ECC level L, versions 1–5, mask 0),
 * after Nayuki's reference implementation. Enough for a receipt verification URL (≤ 106 bytes).
 */
const gfMul = (x: number, y: number) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};
function rsRemainder(data: number[], degree: number) {
  const div = new Array<number>(degree).fill(0);
  div[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      div[j] = gfMul(div[j], root);
      if (j + 1 < degree) div[j] ^= div[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  const res = new Array<number>(degree).fill(0);
  for (const b of data) {
    const f = b ^ (res.shift() as number);
    res.push(0);
    for (let i = 0; i < degree; i++) res[i] ^= gfMul(div[i], f);
  }
  return res;
}
/** Encodes `text` as a scannable QR matrix (true = dark). Throws past 106 bytes. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const CAP = [0, 19, 34, 55, 80, 108];
  const ECN = [0, 7, 10, 15, 20, 26];
  let v = 1;
  while (v <= 5 && bytes.length + 2 > CAP[v]) v++;
  if (v > 5) throw new Error("QR text too long");
  const size = 17 + 4 * v;
  const bits: number[] = [];
  const put = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  const capBits = CAP[v] * 8;
  put(0, Math.min(4, capBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; cw.length < CAP[v]; pad ^= 0xec ^ 0x11) cw.push(pad);
  const all = cw.concat(rsRemainder(cw, ECN[v]));

  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, d: boolean) => {
    m[y][x] = d;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  if (v >= 2) {
    const c = 4 * v + 10;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask: number) => {
    const data = (1 << 3) | mask; // ECC level L = 01
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        const b = i < all.length * 8 ? ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
        m[y][x] = b !== ((x + y) % 2 === 0); // mask 0
      }
  }
  return m;
}
