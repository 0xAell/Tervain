/** Distance between the closest two advected bubbles leaves a branching network of foam filaments.
 * Baking one periodic field gives each surface pixel a pair of inexpensive samples at runtime. */
const SIZE = 128,
  CELLS = 16,
  STRIDE = SIZE / CELLS;
function seed(x: number, y: number, salt: number) {
  let n = Math.imul((x & 15) + 17, 73856093) ^ Math.imul((y & 15) + 31, 19349663) ^ salt;
  n = Math.imul(n ^ (n >>> 15), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const cells = Array.from(
  { length: CELLS * CELLS },
  (_, i) => [0.12 + seed(i % 16, i >> 4, 33) * 0.76, 0.12 + seed(i % 16, i >> 4, 91) * 0.76] as const
);
const field = Uint8Array.from({ length: SIZE * SIZE }, (_, i) => {
  const x = (i % SIZE) / STRIDE,
    y = (i >> 7) / STRIDE,
    cx = x | 0,
    cy = y | 0;
  let first = Infinity,
    second = Infinity;
  for (let j = -1; j <= 1; j++)
    for (let k = -1; k <= 1; k++) {
      const p = cells[((cy + j) & 15) * CELLS + ((cx + k) & 15)]!;
      const dx = cx + k + p[0] - x,
        dy = cy + j + p[1] - y,
        d = dx * dx + dy * dy;
      if (d < first) {
        second = first;
        first = d;
      } else if (d < second) second = d;
    }
  return Math.round(Math.min(1, Math.max(0, (Math.sqrt(second) - Math.sqrt(first)) * 2.6)) * 255);
});
export function foamCell(x: number, y: number) {
  return field[((y & 127) << 7) | (x & 127)]! / 255;
}
