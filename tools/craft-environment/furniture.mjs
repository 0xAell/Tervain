// River-valley joinery, pottery, woven cloth and provisions. +Z faces the room.
import { Form, TAU } from './kit.mjs';
const wood = ['#946041', '#9f7047', '#885c40', '#a9794c'],
  edge = '#684732',
  iron = '#51545a',
  brass = '#b39055',
  linen = '#d5c6a7',
  blue = '#486d70',
  rust = '#ad6952',
  clay = '#b77a58',
  glaze = '#677d77',
  stone = '#898581';
export function makeFurniture(id, size) {
  const f = new Form();
  const board = (x, y, z, w, h, d, c = wood[0], rot) => f.board([x, y, z], [w, h, d], c, rot);
  const pin = (a, b, r, c = wood[0], r1 = r) => f.beam(a, b, r, r1, c);
  const pot = (
    x,
    y,
    z,
    s,
    c,
    shape = [
      [0, 0],
      [0.19, 0],
      [0.31, 0.13],
      [0.33, 0.38],
      [0.23, 0.5],
      [0.22, 0.54],
      [0.24, 0.57],
      [0.19, 0.57],
      [0.17, 0.5],
      [0.18, 0.43],
    ],
  ) => f.lathe([x, y, z], shape, c, 16, [s, s, s]);
  const boards = (x, y, z, w, d, n, c = wood) => {
    for (let i = 0; i < n; i++) board(x, y, z + d * ((i + 0.5) / n - 0.5), w, 0.07, d / n - 0.005, c[i % c.length]);
  };
  const posts = (w, d, h, base = 0, thick = 0.08) => {
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) board(x, base + h / 2, z, thick, h, thick, edge);
  };
  const rails = (w, d, y) => {
    for (const z of [-d / 2, d / 2]) board(0, y, z, w, 0.09, 0.065);
    for (const x of [-w / 2, w / 2]) board(x, y, 0, 0.065, 0.09, d);
  };
  const tabletop = (w, h, d) => {
    posts(w - 0.16, d - 0.16, h);
    rails(w - 0.12, d - 0.11, h - 0.1);
    boards(0, h, 0, w, d, 5);
  };
  const candle = (x, y, z, k) => {
    pin([x, y, z], [x, y + k * 0.82, z], 0.083 * k, '#e3c68c');
    pin([x, y + k * 0.8, z], [x, y + k, z], 0.01 * k, '#3f3228');
  };
  const cabinet = (w, h, d, levels) => {
    posts(w - 0.06, d - 0.06, h);
    for (const x of [-w / 2, w / 2]) board(x, h / 2, 0, 0.055, h, d);
    for (let i = 0; i < 5; i++) board(((i - 2) * w) / 5, h * 0.5, -d * 0.48, w * 0.194, h, 0.045, wood[(i + 1) % 4]);
    for (let i = 0; i <= levels; i++) boards(0, 0.08 + ((h - 0.08) * i) / levels, 0, w + 0.08, d + 0.05, 3);
  };
  const blanket = (y) => {
    f.oval([0, y + 0.08, 0], [0.95, 0.12, 0.46], linen);
    board(-0.23, y + 0.17, 0, 1.29, 0.12, 0.91, blue);
    for (const x of [-0.77, -0.72, 0.33]) board(x, y + 0.233, 0, 0.028, 0.012, 0.91, linen);
    f.oval([0.68, y + 0.2, 0], [0.22, 0.105, 0.37], '#ddcdae', [0, 0, -0.08]);
  };
  switch (id) {
    case 'bed':
    case 'bunk': {
      const top = id === 'bunk' ? 1.44 : 0.84;
      posts(1.94, 0.97, top);
      for (const y of id === 'bunk' ? [0.26, 1.08] : [0.26]) {
        rails(1.94, 0.97, y);
        boards(0, y, 0, 1.92, 0.9, 8);
        blanket(y);
      }
      for (const x of [-0.97, 0.97]) for (let i = 0; i < 3; i++) board(x, top - 0.12 - i * 0.12, 0, 0.06, 0.09, 0.93);
      if (id === 'bunk') {
        for (const x of [-0.74, -0.32]) pin([x, 0, 0.63], [x, 1.35, 0.52], 0.028);
        for (let k = 1; k < 6; k++) pin([-0.74, 0.21 * k, 0.63 - 0.017 * k], [-0.32, 0.21 * k, 0.63 - 0.017 * k], 0.025);
      }
      break;
    }
    case 'table':
    case 'workbench':
    case 'desk':
    case 'counter': {
      tabletop(1.55, 0.8, 0.75);
      if (id === 'desk') {
        board(0, 0.88, -0.22, 1.42, 0.14, 0.22);
        board(-0.25, 0.95, -0.04, 0.43, 0.025, 0.28, linen, [0, 0.18, 0]);
        pot(0.46, 0.84, -0.12, 0.22, glaze);
      }
      if (id === 'workbench') {
        boards(0, 0.27, 0, 1.43, 0.61, 3);
        board(0.43, 0.89, 0.13, 0.28, 0.07, 0.16, edge);
        pin([0.36, 0.91, 0.28], [0.58, 0.91, 0.28], 0.019, iron);
        board(-0.36, 0.87, -0.14, 0.31, 0.032, 0.075, iron, [0, 0.15, 0]);
      }
      if (id === 'counter') {
        for (let i = 0; i < 7; i++) board((i - 3) * 0.209, 0.42, 0.32, 0.195, 0.74, 0.05, wood[i % 4]);
        for (const y of [0.14, 0.7]) board(0, y, 0.36, 1.52, 0.064, 0.05, edge);
      }
      break;
    }
    case 'chair':
    case 'stool': {
      const back = id === 'chair';
      for (const x of [-0.2, 0.2])
        for (const z of [-0.19, 0.19]) pin([1.16 * x, 0, 1.18 * z], [x, back && z < 0 ? 0.92 : 0.46, z], 0.035, edge, 0.03);
      if (back) {
        for (const y of [0.71, 0.84]) board(0, y, -0.2, 0.45, 0.087, 0.035);
        for (const x of [-0.2, 0.2]) pin([x, 0.17, -0.2], [x, 0.17, 0.2], 0.021);
      }
      boards(0, 0.45, 0, 0.49, 0.47, 4);
      break;
    }
    case 'shelf':
    case 'bookshelf':
    case 'cupboard': {
      cabinet(1, 1.65, 0.43, 3);
      if (id === 'cupboard') {
        for (const x of [-0.25, 0.25]) {
          board(x, 0.86, 0.24, 0.47, 1.43, 0.055);
          for (const y of [0.28, 1.41]) board(x, y, 0.285, 0.43, 0.065, 0.025, edge);
          f.oval([x * 0.34, 0.85, 0.31], [0.033, 0.033, 0.025], brass);
        }
      } else if (id === 'bookshelf')
        for (let row = 0; row < 3; row++)
          for (let i = 0; i < 7 - (row % 2); i++) {
            const x = -0.39 + i * 0.108,
              y = 0.11 + row * 0.523,
              h = 0.26 + 0.085 * ((i + row) % 3);
            board(x, y + h / 2, 0, 0.08, h, 0.29, [rust, blue, edge, '#837449'][i % 4], [0, 0, i % 4 === 2 ? 0.085 : 0]);
            board(x, y + h * 0.7, 0.151, 0.067, 0.014, 0.01, brass);
          }
      else {
        pot(0.25, 0.62, 0, 0.44, clay);
        pot(-0.28, 1.14, -0.02, 0.38, glaze);
      }
      break;
    }
    case 'altar': {
      board(0, 0.08, 0, 1.08, 0.16, 0.65, stone);
      board(0, 0.43, 0, 0.81, 0.65, 0.47, '#7e8073');
      board(0, 0.78, 0, 1.12, 0.14, 0.72, '#999483');
      board(-0.03, 0.86, 0, 0.33, 0.022, 0.72, linen);
      board(-0.03, 0.67, 0.37, 0.33, 0.38, 0.018, linen);
      board(-0.03, 0.52, 0.384, 0.32, 0.024, 0.012, rust);
      pot(0.31, 0.85, -0.05, 0.51, brass, [
        [0, 0],
        [0.12, 0],
        [0.1, 0.12],
        [0.35, 0.23],
        [0.37, 0.27],
        [0.32, 0.27],
        [0.08, 0.15],
      ]);
      candle(-0.36, 0.85, -0.18, 0.28);
      candle(-0.28, 0.85, 0.1, 0.18);
      break;
    }
    case 'barrel': {
      pot(0, 0, 0, 1, wood[1], [
        [0, 0],
        [0.35, 0],
        [0.4, 0.13],
        [0.44, 0.43],
        [0.4, 0.72],
        [0.35, 0.85],
        [0, 0.85],
      ]);
      for (const [r, y] of [
        [0.393, 0.11],
        [0.432, 0.29],
        [0.432, 0.55],
        [0.393, 0.74],
      ])
        pot(0, 0, 0, 1, iron, [
          [r - 0.004, y],
          [r + 0.011, y],
          [r + 0.011, y + 0.036],
          [r - 0.004, y + 0.036],
        ]);
      for (let i = 1; i < 6; i++) {
        const x = (i - 3) * 0.102;
        board(x, 0.853, 0, 0.007, 0.007, 2 * Math.sqrt(0.33 ** 2 - x * x), edge);
      }
      break;
    }
    case 'crate':
    case 'chest': {
      const w = 0.91,
        h = 0.49,
        d = 0.53;
      posts(w - 0.08, d - 0.08, h);
      for (let i = 0; i < 5; i++)
        for (const z of [-d / 2, d / 2]) board(((i - 2) * w) / 5, h / 2, z, w / 5 - 0.007, h, 0.045, wood[i % 4]);
      for (const x of [-w / 2, w / 2]) board(x, h / 2, 0, 0.045, h, d);
      boards(0, h, 0, w + 0.04, d + 0.02, 5);
      for (const x of [-0.33, 0.33]) {
        board(x, h / 2, d * 0.55, 0.048, h, 0.018, id === 'chest' ? iron : edge);
        board(x, h + 0.046, 0, 0.048, 0.017, d + 0.05, id === 'chest' ? iron : edge);
      }
      if (id === 'chest') board(0, h - 0.05, d * 0.59, 0.099, 0.14, 0.025, brass);
      else board(0, h / 2, d * 0.6, 0.97, 0.06, 0.025, edge, [0, 0, 0.41]);
      break;
    }
    case 'candle':
      pot(0, 0, 0, 1, brass, [
        [0, 0],
        [0.12, 0],
        [0.145, 0.023],
        [0.09, 0.038],
        [0.055, 0.068],
      ]);
      candle(0, 0.038, 0, 0.39);
      break;
    case 'bread': {
      f.oval([0, 0.075, 0], [0.4, 0.16, 0.25], '#c69258');
      for (const x of [-0.14, 0, 0.14])
        f.oval([x, 0.214 - 0.18 * Math.abs(x), 0], [0.021, 0.008, 0.088], '#eed0a1', [0, 0.38, 0]);
      break;
    }
    case 'jug': {
      pot(0, 0, 0, 1, clay, [
        [0, 0],
        [0.16, 0],
        [0.24, 0.17],
        [0.22, 0.32],
        [0.105, 0.42],
        [0.1, 0.52],
        [0.13, 0.54],
        [0.09, 0.54],
        [0.075, 0.45],
      ]);
      const p = [
        [0.085, 0.45, 0],
        [0.24, 0.44, 0],
        [0.28, 0.34, 0],
        [0.21, 0.25, 0],
      ];
      for (let i = 1; i < p.length; i++) pin(p[i - 1], p[i], 0.03, clay);
      break;
    }
    case 'pots': {
      for (const [x, z, s, c] of [
        [-0.22, 0.05, 0.92, clay],
        [0.17, 0.15, 0.67, glaze],
        [0.13, -0.2, 0.78, '#966449'],
      ])
        pot(x, 0, z, s, c);
      break;
    }
    case 'cauldron': {
      pot(0, 0.07, 0, 1, iron, [
        [0, 0],
        [0.16, 0.014],
        [0.27, 0.15],
        [0.28, 0.3],
        [0.245, 0.38],
        [0.265, 0.405],
        [0.23, 0.405],
        [0.21, 0.32],
        [0.18, 0.17],
        [0, 0.1],
      ]);
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        pin([Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], [Math.cos(a) * 0.18, 0.14, Math.sin(a) * 0.18], 0.034, iron);
      }
      const p = Array.from({ length: 11 }, (_, i) => [
        0.275 * Math.cos((i * Math.PI) / 10),
        0.39 + 0.18 * Math.sin((i * Math.PI) / 10),
        0,
      ]);
      for (let i = 1; i < p.length; i++) pin(p[i - 1], p[i], 0.011, iron);
      break;
    }
    case 'oven': {
      board(0, 0.18, 0, 1.2, 0.36, 1.3, '#77756c');
      f.oval([0, 0.45, 0], [0.59, 0.71, 0.62], '#ad8060');
      board(0, 0.89, -0.31, 0.3, 0.68, 0.3, '#8b715b');
      f.oval([0, 0.47, 0.585], [0.33, 0.255, 0.067], '#392f2a');
      for (let i = 0; i <= 8; i++) {
        const a = (i * Math.PI) / 8;
        board(0.35 * Math.cos(a), 0.47 + 0.25 * Math.sin(a), 0.616, 0.11, 0.13, 0.12, stone, [0, 0, a]);
      }
      board(0, 0.33, 0.48, 0.85, 0.08, 0.51, stone);
      break;
    }
    case 'firewood': {
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 4 - row; i++) {
          const x = (i - (3 - row) / 2) * 0.2,
            y = 0.105 + row * 0.155,
            z = 0.035 * ((row + i) % 3);
          pin([x, y, z - 0.35], [x, y, z + 0.34], 0.103, edge, 0.094);
          pin([x, y, z + 0.34], [x, y, z + 0.347], 0.084, '#bf9768');
        }
      break;
    }
    case 'sacks': {
      for (const [x, z, s, c] of [
        [-0.25, -0.12, 1, '#b19d71'],
        [0.22, 0.04, 0.8, '#bcaa7d'],
        [-0.17, 0.23, 0.55, '#9b8b63'],
      ]) {
        pot(x, 0, z, s, c, [
          [0, 0],
          [0.21, 0],
          [0.31, 0.19],
          [0.25, 0.43],
          [0.065, 0.55],
          [0.1, 0.62],
          [0.05, 0.61],
        ]);
        pin([x, 0.53 * s, z], [x, 0.56 * s, z], 0.077 * s, edge);
      }
      break;
    }
    case 'loom': {
      for (const x of [-0.72, 0.72]) {
        board(x, 0.92, 0, 0.085, 1.82, 0.1);
        board(x, 0.07, 0, 0.16, 0.14, 0.57);
      }
      for (const y of [0.32, 0.85, 1.62]) pin([-0.76, y, 0], [0.76, y, 0], 0.058, wood[1]);
      for (let i = 0; i < 36; i++) {
        const x = (i - 17.5) * 0.033;
        pin([x, 0.32, 0.035], [x, 1.62, 0.035], 0.005, linen);
      }
      board(0, 0.58, 0.052, 1.19, 0.47, 0.022, blue);
      for (let i = 0; i < 4; i++) board(0, 0.39 + i * 0.072, 0.072, 1.17, 0.012, 0.008, i % 2 ? rust : linen);
      break;
    }
    case 'rack':
    case 'tools': {
      if (id === 'rack') {
        posts(1.13, 0.22, 1.55);
        board(0, 1.44, 0, 1.22, 0.09, 0.09);
        boards(0, 0.2, 0, 1.25, 0.39, 3);
      }
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.28,
          z = 0.05 * (i % 2);
        pin([x - 0.09, 0.08, z + 0.07], [x + 0.03, 1.36 - i * 0.08, z], 0.021, wood[1]);
        const h = 1.36 - i * 0.08;
        if (i === 0) {
          board(x + 0.055, h, z, 0.23, 0.055, 0.08, iron);
        } else if (i === 1) {
          f.oval([x + 0.03, h, z], [0.112, 0.14, 0.023], iron, [0, 0, -0.12], 8);
        } else {
          for (const off of [-0.07, 0, 0.07]) pin([x + 0.03 + off, h - 0.01, z], [x + 0.03 + off, h + 0.2, z], 0.011, iron);
          board(x + 0.03, h, z, 0.175, 0.03, 0.034, iron);
        }
      }
      break;
    }
    case 'antlers': {
      f.oval([0, 0.1, -0.045], [0.15, 0.17, 0.055], edge);
      for (const s of [-1, 1]) {
        const p = [
          [0, 0.12, 0],
          [s * 0.15, 0.19, 0.085],
          [s * 0.26, 0.33, 0.11],
          [s * 0.34, 0.48, 0.165],
          [s * 0.3, 0.63, 0.16],
        ];
        for (let i = 1; i < p.length; i++) pin(p[i - 1], p[i], 0.043 - i * 0.006, '#baa27c', 0.035 - i * 0.007);
        pin(p[1], [s * 0.12, 0.36, 0.19], 0.029, '#c3ad89', 0.004);
        pin(p[2], [s * 0.21, 0.52, 0.09], 0.025, '#c3ad89', 0.004);
      }
      break;
    }
    case 'pelt': {
      const edgePts = [
        [-0.12, 0.99],
        [0.12, 0.99],
        [0.18, 0.91],
        [0.23, 0.8],
        [0.41, 0.86],
        [0.49, 0.79],
        [0.3, 0.61],
        [0.27, 0.44],
        [0.41, 0.2],
        [0.45, 0.03],
        [0.33, 0.06],
        [0.12, 0.24],
        [0, 0.16],
        [-0.12, 0.24],
        [-0.34, 0.04],
        [-0.44, 0.06],
        [-0.36, 0.31],
        [-0.25, 0.47],
        [-0.3, 0.64],
        [-0.49, 0.77],
        [-0.43, 0.85],
        [-0.23, 0.8],
        [-0.16, 0.92],
      ];
      const pts = [[0, 0.52, 0.045], ...edgePts.map(([x, y]) => [x, y, -0.01 + 0.035 * Math.sin(y * 12)])];
      const triangles = edgePts.flatMap((_, i) => [0, 1 + ((i + 1) % edgePts.length), 1 + i]);
      f.surface(pts, triangles, '#a48b68');
      f.oval([0, 0.5, 0.041], [0.11, 0.33, 0.018], '#bba47d');
      break;
    }
    case 'herbs': {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4,
          x = 0.21 * Math.cos(a),
          z = 0.12 * Math.sin(a),
          h = 0.24 + 0.12 * (i % 3);
        pin([0, 0.53, 0], [x, 0.53 - h, z], 0.009, '#8e855b');
        for (let k = 1; k < 5; k++)
          f.oval(
            [(x * k) / 4, 0.53 - (h * k) / 4, (z * k) / 4],
            [0.042, 0.067, 0.021],
            ['#718357', '#809064', '#777e50'][i % 3],
            [0, a, (i % 2 ? 1 : -1) * 0.55],
            6,
          );
      }
      pin([0, 0.47, 0], [0, 0.52, 0], 0.039, '#b9a477');
      break;
    }
    default:
      throw Error('Missing furniture design ' + id);
  }
  f.fit(size);
  return f;
}
