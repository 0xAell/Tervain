/** Lantern Point's tide bell. Dimensions in metres. Both the loading study and the keeper's
 * outdoor signal use these same faces. All profiles, joinery, casting bands and colours live here. */
export type Point = readonly [number, number, number];
export type BellMaterial = 'bronze' | 'metal' | 'timber' | 'stone';
export interface BellFace { points: [Point, Point, Point, Point]; material: BellMaterial; color: number }

export function makeStrandBell(): BellFace[] {
  const faces: BellFace[] = [];
  const quad = (material: BellMaterial, color: number, a: Point, b: Point, c: Point, d: Point) =>
    faces.push({ material, color, points: [a, b, c, d] });

  function block(material: BellMaterial, color: number, x: number, y: number, z: number, w: number, h: number, d: number, lean = 0) {
    const loop = (height: number): Point[] => [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([sx, sz]) =>
      [x + sx! * w / 2 + lean * height, y + height, z + sz! * d / 2]);
    const low = loop(0), high = loop(h);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(material, color, low[i]!, low[j]!, high[j]!, high[i]!);
    }
    quad(material, color, high[0]!, high[1]!, high[2]!, high[3]!);
    quad(material, color, low[3]!, low[2]!, low[1]!, low[0]!);
  }

  // Turn the wall back inside the flared mouth so the bell is hollow even when viewed from below.
  const profile: [number, number, number][] = [
    [2.33, .055, 0xab8354], [2.30, .19, 0x876c48], [2.22, .28, 0x64847b],
    [2.18, .32, 0xc29c66], [2.155, .32, 0xab8e61], [2.14, .30, 0x50776f],
    [2.03, .35, 0x60887c], [1.90, .39, 0x51786c], [1.68, .48, 0x789081],
    [1.56, .55, 0x8b9580], [1.545, .57, 0xc7ae79], [1.52, .57, 0x7c8a72],
    [1.46, .61, 0x8e9b85], [1.39, .69, 0xa79d79], [1.35, .71, 0xd3b781],
    [1.32, .70, 0xb49f71], [1.32, .64, 0x5b5647], [1.42, .58, 0x444e46],
    [1.67, .42, 0x384940], [2.09, .23, 0x333f38], [2.18, .035, 0x3b4a42],
  ];
  const at = (r: number, y: number, i: number): Point => [r * Math.cos(i * Math.PI / 12), y, r * Math.sin(i * Math.PI / 12)];
  for (let j = 1; j < profile.length; j++) {
    const [y0, r0, tone] = profile[j - 1]!, [y1, r1] = profile[j]!;
    for (let i = 0; i < 24; i++) quad('bronze', tone, at(r0, y0, i), at(r0, y0, i + 1), at(r1, y1, i + 1), at(r1, y1, i));
  }

  // A broken tide-line picked out in bronze on the skirt. Three long notches mark the keeper's watch.
  for (let i = 0; i < 18; i++) {
    const theta = i * 2 * Math.PI / 18;
    const point = (t: number, y: number): Point => {
      const r = .543 - (y - 1.58) * .54;
      return [r * Math.cos(t), y, r * Math.sin(t)];
    };
    quad('bronze', i % 6 === 0 ? 0xd3b782 : 0xb59d70,
      point(theta - .042, 1.61), point(theta, 1.64), point(theta + .042, 1.61), point(theta, i % 6 === 0 ? 1.565 : 1.59));
  }

  for (const side of [-1, 1]) {
    const x = side * .98;
    block('stone', 0x71796e, x, -.09, 0, .55, .24, .74);
    block('stone', 0x969383, x, .15, 0, .50, .08, .65);
    block('timber', 0x806952, x, .23, 0, .21, 2.37, .28, -side * .035);
    block('timber', 0x8e7356, x - side * .06, 1.96, .005, .12, .55, .15, -side * .70);
    // Two square-headed nails through the lap at each knee brace.
    for (const y of [2.02, 2.48]) block('metal', 0x697067, x - side * .072, y, .153, .051, .051, .025);
    for (const y of [.36, .43, 2.41]) block('metal', 0x5b655e, x - side * (y - .23) * .035, y, 0, .225, .037, .295);
    block('metal', 0x6c6d5e, side * .055, 2.28, 0, .038, .22, .038);
  }
  block('timber', 0x9a7b58, 0, 2.50, 0, 2.45, .17, .31);
  block('timber', 0xba9871, 0, 2.67, 0, 2.56, .055, .37);
  block('metal', 0x51594f, 0, 1.13, .01, .052, 1.13, .052);
  block('bronze', 0xa18053, 0, 1.11, .01, .135, .14, .135);
  // Iron hoops clamp the projecting lintel ends. A bell keeper can reach the knotted pull from the ground.
  for (const x of [-1.08, 1.08]) block('metal', 0x69726d, x, 2.49, 0, .06, .19, .325);
  block('timber', 0x9e8664, .01, .56, .04, .025, .58, .025, -.018);
  block('timber', 0xb89a70, .006, .54, .04, .056, .063, .056);
  return faces;
}
