import * as THREE from 'three';
import { requiredAnimalClips, type AnimalClip, type AnimalDefinition, type AnimalSpecies } from '../../core/content/animals';
import { ellipsoid, Mesher, mul3, tube, type RGB, type V3, type WeightFn } from '../human/skin';

/** Proportions in metres. Hock height, long necks, muzzles and ears matter more at a distance than coat markings. */
interface Shape {
  ribs: V3;
  hip: number;
  cheek: number;
  neck: number;
  muzzle: number;
  tail: number;
  fur: number;
  bib: number;
}

const SHAPES: Record<AnimalSpecies, Shape> = {
  deer:  { ribs: [.245, .31, .65], hip: 1.04, cheek: .155, neck: .47, muzzle: .23, tail: .19, fur: 0xad7652, bib: 0xe6ce9d },
  tiger: { ribs: [.32, .36, .78], hip: .82, cheek: .235, neck: .13, muzzle: .18, tail: .90, fur: 0xc6874e, bib: 0xded0ac },
  lion:  { ribs: [.32, .36, .79], hip: .87, cheek: .22, neck: .16, muzzle: .18, tail: .88, fur: 0xb49a67, bib: 0xd1ba8d },
  bear:  { ribs: [.45, .46, .74], hip: .83, cheek: .23, neck: .12, muzzle: .23, tail: .10, fur: 0x57483e, bib: 0x92785c },
  wolf:  { ribs: [.22, .255, .53], hip: .65, cheek: .145, neck: .15, muzzle: .25, tail: .48, fur: 0x837f73, bib: 0xcdc2a6 },
  dog:   { ribs: [.174, .215, .41], hip: .49, cheek: .124, neck: .12, muzzle: .17, tail: .34, fur: 0xa87650, bib: 0xe4d4b0 },
  boar:  { ribs: [.29, .34, .54], hip: .57, cheek: .179, neck: .025, muzzle: .30, tail: .205, fur: 0x5d4b42, bib: 0x97775d },
  cat:   { ribs: [.083, .115, .22], hip: .225, cheek: .075, neck: .05, muzzle: .051, tail: .30, fur: 0x888985, bib: 0xe5d7be },
};

const pigment = (hex: number): RGB => { const { r, g, b } = new THREE.Color(hex); return [r, g, b]; };
const INK = pigment(0x302925);
const HORN = pigment(0xc7bda1);
const EYE = pigment(0xcaac6c);
const rad = Math.PI * 2;

export interface ValleyAnimal { scene: THREE.Group; animations: THREE.AnimationClip[] }

/** Each beast is one mesh on a named joint hierarchy. The same animated skin receives light, hunting hits and hoof contacts. */
export function sculptValleyAnimal(def: AnimalDefinition): ValleyAnimal {
  const s = SHAPES[def.species], sp = def.species, deer = sp === 'deer', boar = sp === 'boar';
  const r = s.ribs, h = s.hip, c = s.cheek, seated = !!def.seated;
  const tint = .93 + (Number(def.id.slice(-3)) % 11) * .013;
  const fur = mul3(pigment(s.fur), tint), bib = pigment(s.bib), dark = mul3(fur, .53);
  const mesh = new Mesher(), body = new THREE.Group(), bones: THREE.Bone[] = [], at: V3[] = [];
  const joint = (name: string, position: V3, parent = -1) => {
    const bone = new THREE.Bone(), p = at[parent] ?? [0, 0, 0];
    bone.name = name; bone.position.set(position[0] - p[0], position[1] - p[1], position[2] - p[2]);
    (bones[parent] ?? body).add(bone); bones.push(bone); at.push(position);
    return bones.length - 1;
  };
  const weight = (index: number): WeightFn => () => [[index, 1]];
  const blob = (index: number, center: V3, radius: V3, color: RGB | ((direction: V3) => RGB), sides = 12) =>
    ellipsoid(mesh, center, radius, color, weight(index), { ws: sides, hs: Math.max(5, sides >> 1) });
  const stroke = (index: number, line: V3[], width: number[], color: RGB, sides = 9) =>
    tube(mesh, line, width, color, { wf: weight(index), sides, up: [1, 0, 0], capStart: true, capEnd: true });
  const trunk = joint('body', [0, h, 0]), neck = joint('neck', [0, h + r[1]*.21, r[2]*.63], trunk);
  const hy = h + r[1]*.53 + s.neck, hz = r[2] + c*.37;
  const head = joint('head', [0, hy, hz], neck), jaw = joint('jaw', [0, hy-c*.25, hz+c*.37], head);
  const antlers = deer ? joint('antlers', at[head]!, head) : -1;
  const tail = joint('tail', [0, h+r[1]*.18, -r[2]*.80], trunk);
  body.name = 'Valley ' + sp;
  body.userData.animal = { motionSpeeds: { Walk: def.walk, Run: def.run } };
  const coat = ([x,y,z]: V3): RGB => {
    if (y < -.44) return mul3(bib, .74 + .23 * Math.abs(x));
    if (sp === 'tiger' && Math.sin(z*24 + y*y*5 + Math.abs(x)*1.3) > .50 && y > -.26) return INK;
    if ((sp === 'dog' || sp === 'wolf') && (y > .62 || (z < -.14 && Math.abs(x) > .62))) return dark;
    if (sp === 'cat' && Math.cos(z*24 + Math.abs(x)*2) > .64 && y > .05) return dark;
    return mul3(fur, .91 + .13*Math.abs(x) + .035*y);
  };
  blob(trunk, [0, h, 0], r, coat, 30);
  // A sitting cat carries its rump on the ground and holds its chest upright between its forelegs.
  if (seated) blob(trunk, [0, h*.68, -r[2]*.56], [r[0]*1.14,h*.68,r[2]*.64], fur, 18);
  stroke(neck, [at[neck]!, [0, (hy+h)*.5, r[2]*.83], at[head]!], [r[0]*.9, c*.84, c*.71], fur, 15);
  if (sp === 'lion') {
    const mane = pigment(0x79543a);
    blob(neck, [0,hy-c*.32,hz-c*.30], [c*1.52,c*1.69,c*1.25], mane, 20);
    for (const side of [-1,1]) {
      for (const [along, drop] of [[.42,1.48],[-.35,1.82]] as const) {
        stroke(neck, [[side*c*.90,hy+c*.14,hz+c*along],[side*c*1.22,hy-c*.66,hz+c*(along-.22)],
          [side*c*1.05,hy-c*drop,hz+c*(along-.48)]], [c*.43,c*.31,c*.018], mane);
      }
    }
  }
  if (sp === 'bear' || boar) blob(trunk, [0, h+r[1]*.19, r[2]*.31], [r[0]*.95,r[1],r[2]*.62], fur, 18);
  blob(head, at[head]!, [c, c*(deer ? 1.15 : 1), c*1.08], fur, 18);
  const noseZ = hz + c*.67 + s.muzzle;
  blob(jaw, [0,hy-c*.38,hz+c*.69+s.muzzle*.32], [c*.52,c*.32,s.muzzle*.70], bib);
  blob(head, [0,hy-c*.16,hz+c*.68+s.muzzle*.37], [c*(boar ? .64 : .56),c*.4,s.muzzle*.70], sp === 'tiger' || sp === 'cat' ? bib : fur);
  blob(head, [0,hy-c*.15,noseZ], [c*(boar ? .55 : .34),c*(boar ? .35 : .22),c*.19], boar ? pigment(0x947669) : INK);
  for (const side of [-1,1]) {
    const eyeAt: V3 = [side*c*.80,hy+c*.17,hz+c*.56];
    blob(head, eyeAt, [c*.23,c*.20,c*.21], INK, 10);
    blob(head, [eyeAt[0]+side*c*.13,eyeAt[1]+c*.025,eyeAt[2]+c*.07], [c*.12,c*.11,c*.10], EYE, 9);
    blob(head, [eyeAt[0]+side*c*.208,eyeAt[1]+c*.027,eyeAt[2]+c*.108], [c*.06,c*.084,c*.056], INK, 8);
    // The big cats' pale whisker pads and dark cheek marks break up their broad face.
    if (sp === 'tiger' || sp === 'lion') {
      blob(head, [side*c*.36,hy-c*.25,hz+c*.95+s.muzzle*.47], [c*.41,c*.26,c*.31], bib);
      if (sp === 'tiger') stroke(head, [[side*c*.61,hy+c*.47,hz+c*.54],[side*c*.81,hy+c*.29,hz+c*.56],
        [side*c*.90,hy+c*.12,hz+c*.39]], [c*.08,c*.105,c*.03], INK);
    }
    const e: V3 = [side*c*.66,hy+c*.63,hz-c*.25];
    if (sp === 'bear' || sp === 'lion' || sp === 'tiger') {
      blob(head, [e[0]*1.1,e[1]+c*.25,e[2]], [c*.32,c*.39,c*.21], dark);
    } else {
      const length = deer ? 1.55 : .92, sideways = deer || boar ? 1.70 : .97;
      stroke(head, [e,[e[0]*1.39,e[1]+c*.36,e[2]],[side*c*sideways,e[1]+c*length,e[2]-c*.28]], [c*.25,c*.32,c*.014], fur);
    }
    if (deer) {
      const base: V3 = [side*c*.45,hy+c*.86,hz-c*.2];
      const beam: V3 = [side*c*1.6,hy+c*2.37,hz-c*1.16];
      stroke(antlers, [base,[side*c*.88,hy+c*1.7,hz-c*.42],beam,[side*c*2.1,hy+c*3.18,hz-c*1.33]], [c*.15,c*.13,c*.095,c*.014], HORN);
      stroke(antlers, [beam,[side*c*1.76,hy+c*2.82,hz-c*.65]], [c*.09,c*.012], HORN);
      stroke(antlers, [[side*c*.83,hy+c*1.62,hz-c*.4],[side*c*.86,hy+c*2.36,hz+c*.20]], [c*.105,c*.012], HORN);
    }
    if (boar) stroke(jaw, [[side*c*.47,hy-c*.42,noseZ-c*.54],[side*c*.69,hy-c*.35,noseZ-c*.36],[side*c*.78,hy+c*.04,noseZ-c*.41]], [c*.14,c*.11,c*.012], HORN);
  }
  // The mount's ochre pack-cloth and raised seat follow its back in every gait.
  if (def.tame) {
    blob(trunk, [0,h+r[1]*.67,-r[2]*.02], [r[0]*1.08,r[1]*.45,r[2]*.47], pigment(0x934c39), 18);
    blob(trunk, [0,h+r[1]*.98,-r[2]*.02], [r[0]*.73,r[1]*.26,r[2]*.31], pigment(0x49342a), 16);
  }
  const lifted = sp === 'cat' || sp === 'dog';
  const tailEnd: V3 = [r[0]*.29, h + (lifted ? 1.05 : -.64)*r[1], -r[2]-s.tail*(lifted ? .58 : .79)];
  const tailCurve: V3[] = [at[tail]!, [0,h-r[1]*.04,-r[2]-s.tail*.17],
    [r[0]*.06,h+r[1]*(lifted ? .21 : -.49),-r[2]-s.tail*.50],
    [r[0]*.18,h+r[1]*(lifted ? .80 : -.76),-r[2]-s.tail*.72], tailEnd];
  stroke(tail, tailCurve, [r[0]*.31,r[0]*(sp==='wolf' ? .45 : .27),r[0]*.23,r[0]*.15,r[0]*.055], deer ? bib : fur);

  if (sp === 'lion') blob(tail, tailEnd, [r[0]*.20,r[0]*.25,r[0]*.30], dark);
  for (const front of [true,false]) for (const left of [true,false]) {
    const name = front ? 'front' : 'hind', side = left ? 'L' : 'R', x = (left ? 1 : -1)*r[0]*.63;
    const z = (front ? .64 : -.65)*r[2], high = seated && !front ? h*.65 : h;
    const upper = joint(name+'Upper'+side, [x,high,z], trunk);
    const knee = joint(name+'Lower'+side, [x,high*.51,z + (front ? -.10 : .20)*r[2]], upper);
    const paw = joint(name+'Paw'+side, [x,h*.115,z+(front ? -.04 : -.12)*r[2]], knee);
    const foot = deer || boar ? INK : dark;
    const thick = r[0]*(front ? .47 : .56), ankle = r[0]*(deer ? .17 : .26);
    stroke(upper, [at[upper]!,[x,(high+at[knee]![1])*.5,(z+at[knee]![2])*.5],at[knee]!], [thick,thick*1.03,thick*.56], fur);
    stroke(knee, [at[knee]!,[x,high*.29,at[paw]![2] - (front ? 0 : r[2]*.09)],at[paw]!], [thick*.58,ankle,ankle*.85], fur);
    // The hoof overlaps its ankle, including the long, thin pastern on a deer.
    const py = Math.max(at[paw]![1]*.57, Math.min(h*.078, ankle*.95));
    blob(paw,[x,py,at[paw]![2]+ankle*.45],[ankle*1.18,py,ankle*1.74],foot);
  }
  body.updateMatrixWorld(true);
  const skin = new THREE.SkinnedMesh(mesh.geometry()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 }));
  skin.name = def.species + ' / hide';
  skin.userData.anatomicalSkin = true;
  body.add(skin); skin.bind(new THREE.Skeleton(bones));
  return { scene: body, animations: requiredAnimalClips(def).map(clip => movement(clip, def, h)) };
}

/** In-place closed joint curves. The game supplies world travel; paw sweep scales with its real walk/run pace. */
function movement(clip: AnimalClip, def: AnimalDefinition, height: number): THREE.AnimationClip {
  const gait = clip === 'Walk' || clip === 'Run', fast = clip === 'Run';
  const duration = gait ? fast ? .56 : 1.10 : clip === 'Alert' ? 2 : 4;
  const tracks: THREE.KeyframeTrack[] = [];
  const count = 20, times = Array.from({length: count + 1}, (_,i) => i*duration/count);
  const rotation = (bone: string, pose: (phase: number) => V3) => {
    const q = new THREE.Quaternion(), values: number[] = [];
    for (let i=0; i<=count; i++) values.push(...q.setFromEuler(new THREE.Euler(...pose(i/count*rad))).toArray());
    tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, values));
  };
  if (gait) {
    const sweep = Math.min(.86, Math.asin(Math.min(.75,(fast ? def.run : def.walk)*duration/(4*height))));
    for (const front of [true,false]) for (const left of [true,false]) {
      const leg = front ? 'front' : 'hind', side = left ? 'L' : 'R';
      const offset = (fast ? (front ? 0 : Math.PI) + (left ? 0 : .64) : (front === left ? 0 : Math.PI) + (front ? .40 : 0));
      rotation(leg+'Upper'+side, t => [-sweep*Math.sin(t+offset),0,0]);
      rotation(leg+'Lower'+side, t => [(front ? -.60 : .72)*Math.max(0, Math.cos(t+offset))*(fast ? 1 : .66),0,0]);
    }
  }
  rotation('neck', t => {
    if (clip==='Graze') return [.85-.18*Math.cos(t),.16*Math.sin(t),0];
    if (clip==='Groom') return [.39+.18*Math.cos(2*t),.88+.17*Math.sin(t),-.18];
    if (clip==='Sleep') return [.46,.64,-.28];
    if (clip==='Call') return [-.21*(1-Math.cos(t)),0,0];
    if (clip==='Alert') return [-.18*(1-Math.cos(t)),.36*Math.sin(t),0];
    return [Math.sin(gait ? 2*t : t)*(gait ? .058 : .033),.07*Math.sin(t),0];
  });
  rotation('jaw', t => [clip==='Call' ? .20*(1-Math.cos(2*t)) : clip==='Graze' ? .045*(1-Math.cos(4*t)) : 0,0,0]);
  rotation('tail', t => [0, Math.sin(t)*(def.species==='dog' ? .52 : .21), .07*Math.cos(t)]);
  return new THREE.AnimationClip(clip, duration, tracks);
}
