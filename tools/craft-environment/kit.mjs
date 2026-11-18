// Modelling tools in metres. Components are baked into one indexed mesh per surface.
import * as THREE from 'three';
import sharp from 'sharp';
export const TAU = 2 * Math.PI;
const vec = (a) => new THREE.Vector3(...a);
const up = vec([0, 1, 0]);
export class Form {
  pos = [];
  nrm = [];
  uv = [];
  col = [];
  idx = [];
  get vertexCount() {
    return this.pos.length / 3;
  }
  add(geometry, tint, centre = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const q = rotation.isQuaternion ? rotation : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    geometry.applyMatrix4(new THREE.Matrix4().compose(vec(centre), q, vec(scale)));
    const base = this.vertexCount,
      p = geometry.attributes.position,
      n = geometry.attributes.normal,
      uv = geometry.attributes.uv;
    const c = new THREE.Color(tint),
      rgb = [c.r, c.g, c.b].map((v) => Math.round(255 * v));
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(uv?.getX(i) ?? p.getX(i), uv?.getY(i) ?? p.getY(i));
      this.col.push(...rgb, 255);
    }
    for (const i of geometry.index?.array ?? Array.from({ length: p.count }, (_, k) => k)) this.idx.push(base + i);
    geometry.dispose();
  }
  board(centre, size, tint, rotation) {
    this.add(new THREE.BoxGeometry(), tint, centre, size, rotation);
  }
  oval(centre, radii, tint, rotation, sides = 12) {
    this.add(new THREE.SphereGeometry(1, sides, Math.max(4, Math.round(sides / 2))), tint, centre, radii, rotation);
  }
  beam(a, b, r0, r1, tint, sides = 8) {
    const direction = vec(b).sub(vec(a)),
      middle = vec(a).add(vec(b)).multiplyScalar(0.5).toArray();
    this.add(
      new THREE.CylinderGeometry(r1, r0, direction.length(), sides),
      tint,
      middle,
      [1, 1, 1],
      new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()),
    );
  }
  lathe(centre, profile, tint, segments = 12, scale = [1, 1, 1]) {
    this.add(
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        segments,
      ),
      tint,
      centre,
      scale,
    );
  }
  surface(points, indices, tint, uvs) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs?.flat() ?? points.flatMap((p) => [p[0], p[1]]), 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    this.add(g, tint);
  }
  fit(size) {
    const box = new THREE.Box3().setFromArray(this.pos),
      s = box.getSize(new THREE.Vector3()),
      c = box.getCenter(new THREE.Vector3());
    const fac = [size[0] / s.x, size[1] / s.y, size[2] / s.z],
      origin = [c.x, box.min.y, c.z];
    for (let i = 0; i < this.pos.length; i += 3) {
      const mag = Math.hypot(...fac.map((f, k) => this.nrm[i + k] / f));
      for (let k = 0; k < 3; k++) {
        this.pos[i + k] = (this.pos[i + k] - origin[k]) * fac[k];
        this.nrm[i + k] /= fac[k] * (mag || 1);
      }
    }
  }
}
export const surfaces = async () => {
  const n = 96;
  const bake = async (name, grain) => {
    const raw = Buffer.alloc(n * n * 3);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = (TAU * x) / n,
          b = (TAU * y) / n;
        const coarseness = 0.5 + 0.5 * Math.sin(6 * a + Math.sin(2 * b) * 0.7 + Math.sin(4 * b) * 0.35);
        const value = Math.round(
          grain
            ? 209 + 24 * coarseness + 9 * Math.sin(18 * a + Math.sin(3 * b)) + 5 * Math.sin(4 * a + 3 * b)
            : 219 +
                11 * Math.sin(6 * a + 4 * b + 2 * Math.sin(b)) +
                8 * Math.sin(3 * a - 7 * b) +
                6 * Math.cos(15 * a + 2 * b),
        );
        raw.fill(value, (y * n + x) * 3, (y * n + x + 1) * 3);
      }
    return {
      name,
      mimeType: 'image/png',
      data: await sharp(raw, { raw: { width: n, height: n, channels: 3 } })
        .png()
        .toBuffer(),
    };
  };
  return { grain: await bake('Hand-cut grain', true), stone: await bake('Mineral fleck', false) };
};
export const material = (name, texture = 0) => ({
  name,
  pbrMetallicRoughness: { baseColorTexture: { index: texture }, metallicFactor: 0, roughnessFactor: 0.9 },
});
