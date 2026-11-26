export type FieldAccent = keyof typeof sounds;

type Layer = {
  delay: number;
  time: number;
  attack: number;
  frequency: readonly [number, number];
  level: number;
  noise?: true;
};

const air = (delay: number, time: number, attack: number, from: number, to: number, level: number): Layer =>
  ({ delay, time, attack, frequency: [from, to], level, noise: true });
const tone = (delay: number, time: number, attack: number, from: number, to: number, level: number): Layer =>
  ({ delay, time, attack, frequency: [from, to], level });

// Original accents for the close mix. Blade and guard carry the treble; body and fall carry the weight.
const sounds = {
  // Bell partials decay at different rates; the clapper is audible only at the strike.
  villageBell: [
    air(0, 0.026, 0.002, 5200, 1100, 0.24),
    tone(0, 1.85, 0.004, 248.8, 248.6, 0.18),
    tone(0.001, 1.45, 0.003, 501, 501, 0.19),
    tone(0, 0.86, 0.002, 603, 602, 0.12),
    tone(0.002, 0.56, 0.002, 1243, 1242, 0.13),
    tone(0, 0.32, 0.002, 1716, 1714, 0.09),
  ],
  ropeDraw: [
    air(0, 0.24, 0.035, 1280, 410, 0.30),
    tone(0.045, 0.14, 0.02, 176, 245, 0.10),
    air(0.13, 0.15, 0.016, 680, 210, 0.17),
  ],
  bucketDry: [
    air(0, 0.10, 0.003, 2700, 440, 0.37), tone(0, 0.095, 0.002, 216, 136, 0.24),
    tone(0.21, 0.057, 0.003, 1130, 680, 0.15),
  ],
  bucketWater: [
    tone(0, 0.08, 0.005, 198, 115, 0.16), air(0.04, 0.37, 0.06, 3400, 850, 0.40),
    tone(0.24, 0.075, 0.004, 1060, 580, 0.13), tone(0.34, 0.06, 0.003, 870, 530, 0.10),
  ],
  jumpLift: [air(0, 0.105, 0.012, 1050, 2800, 0.33), tone(0, 0.063, 0.009, 155, 102, 0.12)],
  groundLanding: [
    air(0, 0.052, 0.002, 2100, 590, 0.32),
    tone(0.004, 0.155, 0.045, 129, 58, 0.48),
  ],
  waterLanding: [
    air(0, 0.069, 0.003, 4200, 1450, 0.42),
    tone(0.004, 0.133, 0.038, 160, 67, 0.28),
    air(0.024, 0.191, 0.032, 2150, 520, 0.31),
  ],
  bladeSwing: [air(0, 0.125, 0.029, 850, 4900, 0.56), tone(0.012, 0.095, 0.021, 750, 1080, 0.028)],
  handSwing: [air(0, 0.09, 0.021, 460, 1550, 0.49), tone(0, 0.062, 0.013, 178, 91, 0.043)],
  bladeHit: [
    air(0, 0.054, 0.0015, 7400, 1800, 0.75),
    tone(0.004, 0.137, 0.003, 181, 67, 0.32),
    tone(0.048, 0.206, 0.007, 1218, 980, 0.076),
    air(0.073, 0.231, 0.032, 1720, 420, 0.095),
  ],
  bodyHit: [air(0, 0.055, 0.0015, 2700, 510, 0.65), tone(0.003, 0.146, 0.003, 146, 54, 0.38)],
  playerHit: [air(0, 0.083, 0.0015, 3100, 490, 0.63), tone(0.003, 0.2, 0.003, 123, 49, 0.43)],
  guard: [
    air(0, 0.037, 0.001, 8000, 2600, 0.69),
    tone(0, 0.181, 0.0025, 1560, 1430, 0.24),
    tone(0.003, 0.13, 0.0025, 2370, 2200, 0.12),
  ],
  windup: [air(0, 0.31, 0.071, 290, 1390, 0.55), tone(0.014, 0.24, 0.08, 115, 182, 0.075)],
  defeat: [
    tone(0.031, 0.363, 0.057, 88, 40, 0.43),
    air(0.07, 0.331, 0.044, 2100, 460, 0.22),
    tone(0.111, 0.274, 0.036, 347, 229, 0.07),
  ],
} satisfies Record<string, readonly Layer[]>;

const accentRate = 24000;

/** Render before play so the event can start an AudioBufferSource on its own frame. */
export function fieldAccentBuffers(ctx: Pick<BaseAudioContext, 'createBuffer'>): Record<FieldAccent, AudioBuffer> {
  const variants = {} as Record<FieldAccent, AudioBuffer>;
  for (const accent of Object.keys(sounds) as FieldAccent[]) {
    const layers = sounds[accent];
    const size = Math.ceil(Math.max(...layers.map((layer) => layer.delay + layer.time)) * accentRate) + 1;
    const buffer = ctx.createBuffer(1, size, accentRate);
    const samples = buffer.getChannelData(0);
    let seed = 0x16adca05;
    for (const layer of layers) {
      const offset = Math.round(layer.delay * accentRate);
      const count = Math.round(layer.time * accentRate);
      let phase = 0;
      let filtered = 0;
      let low = 0;
      for (let index = 0; index < count; index++) {
        const fraction = index / count;
        const elapsed = index / accentRate;
        const frequency = layer.frequency[0] + (layer.frequency[1] - layer.frequency[0]) * fraction;
        const envelope = Math.min(1, elapsed / layer.attack) * (1 - fraction) ** 2;
        let signal: number;
        if (layer.noise) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const noise = seed / 0x80000000 - 1;
          filtered += (noise - filtered) * Math.min(0.95, (2 * Math.PI * frequency) / accentRate);
          low += (filtered - low) * 0.023;
          signal = filtered - low;
        } else {
          phase += (2 * Math.PI * frequency) / accentRate;
          signal = Math.sin(phase);
        }
        samples[offset + index] = samples[offset + index]! + signal * envelope * layer.level;
      }
    }
    // Bound every added accent and leave mixing headroom for the foley and score underneath.
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index]!;
      samples[index] = sample / (1 + 0.58 * Math.abs(sample));
    }
    variants[accent] = buffer;
  }
  return variants;
}
