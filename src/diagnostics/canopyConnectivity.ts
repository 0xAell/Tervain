import * as THREE from 'three';

// Shared component-graph detection: the canopy audit and the generator both use these, so they agree on which clumps are detached.
export type CutoutSampler = { uv: string; cutoff: number; alpha(u: number, v: number): number;
  /** Conservative hint: false only when the whole UV triangle is transparent. */
  mayHaveOpaque?(u0: number, v0: number, u1: number, v1: number, u2: number, v2: number): boolean } | null | undefined;
export interface Component { box: THREE.Box3; samples: THREE.Vector3[]; vertices?: number[] }
export const boxGap = (a: THREE.Box3, b: THREE.Box3) => Math.hypot(
  Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),Math.max(0,a.min.y-b.max.y,b.min.y-a.max.y),Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z));
/**
 * The point of a triangle nearest to (x, y, z), written to `out`: three's Triangle.closestPointToPoint (Ericson's test of
 * which region of the triangle the point lies in) with the same arithmetic in the same order, so the same doubles come
 * out, without six vectors and their calls per triangle. The corners are read from `corners` at `o`: a, b, then c.
 */
export function closestPointOnTriangle(corners: ArrayLike<number>, o: number, x: number, y: number, z: number, out: Float64Array): void {
  const ax = corners[o]!, ay = corners[o + 1]!, az = corners[o + 2]!, bx = corners[o + 3]!, by = corners[o + 4]!, bz = corners[o + 5]!;
  const cx = corners[o + 6]!, cy = corners[o + 7]!, cz = corners[o + 8]!;
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = x - ax, apy = y - ay, apz = z - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return; }
  const bpx = x - bx, bpy = y - by, bpz = z - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); out[0] = ax + abx * v; out[1] = ay + aby * v; out[2] = az + abz * v; return; }
  const cpx = x - cx, cpy = y - cy, cpz = z - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); out[0] = ax + acx * w; out[1] = ay + acy * w; out[2] = az + acz * w; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out[0] = bx + (cx - bx) * w; out[1] = by + (cy - by) * w; out[2] = bz + (cz - bz) * w; return;
  }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
}

/**
 * Puts ids[start, end) in order of their keys, keys[id * stride + offset], keeping equal keys in the order they came:
 * the order a stable sort with the comparator (a, b) => key(a) - key(b) gives, as V8's sorts do, without calling a
 * comparator for every comparison. `scratch` holds at least end - start ids. No key may be NaN.
 */
export function sortByKey(ids: Int32Array | number[], start: number, end: number, keys: ArrayLike<number>, stride: number, offset: number, scratch: Int32Array): void {
  const length = end - start, key = (id: number) => keys[id * stride + offset]!;
  // Runs of eight by insertion; each moves past only a strictly greater key, so equal keys keep their order.
  for (let low = start; low < end; low += 8) {
    const high = Math.min(end, low + 8);
    for (let i = low + 1; i < high; i++) {
      const id = ids[i]!, k = key(id);
      let j = i - 1;
      while (j >= low && key(ids[j]!) > k) { ids[j + 1] = ids[j]!; j--; }
      ids[j + 1] = id;
    }
  }
  // Then neighbouring runs merged, back and forth between the ids and the scratch: the right run's id goes first only
  // when its key is strictly smaller.
  let inScratch = false;
  for (let width = 8; width < length; width *= 2) {
    const from = inScratch ? scratch : ids, fromAt = inScratch ? 0 : start, to = inScratch ? ids : scratch, toAt = inScratch ? start : 0;
    for (let low = 0; low < length; low += 2 * width) {
      const middle = Math.min(length, low + width), high = Math.min(length, low + 2 * width);
      let i = low, j = middle, k = low;
      while (i < middle && j < high) {
        const a = from[fromAt + i]!, b = from[fromAt + j]!;
        if (key(b) < key(a)) { to[toAt + k++] = b; j++; } else { to[toAt + k++] = a; i++; }
      }
      while (i < middle) to[toAt + k++] = from[fromAt + i++]!;
      while (j < high) to[toAt + k++] = from[fromAt + j++]!;
    }
    inScratch = !inScratch;
  }
  if (inScratch) for (let i = 0; i < length; i++) ids[start + i] = scratch[i]!;
}

/** A box's distance from a point: three's Box3.distanceToPoint (the point clamped into the box, and how far it moved), in scalars. */
export function boxPointDistance(box: THREE.Box3, x: number, y: number, z: number): number {
  const dx = Math.max(box.min.x, Math.min(box.max.x, x)) - x, dy = Math.max(box.min.y, Math.min(box.max.y, y)) - y, dz = Math.max(box.min.z, Math.min(box.max.z, z)) - z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function union(size: number) {
  const parent=Int32Array.from({length:size},(_,i)=>i);
  const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]!]!;i=parent[i]!;}return i;};
  return {find,join:(a:number,b:number)=>{parent[find(a)]=find(b);}};
}
export function components(g: THREE.BufferGeometry, charge: () => void, cutout?: CutoutSampler): Component[] {
  const p=g.getAttribute('position');if(!p||p.count===0)throw new Error('Missing leaf positions');const index=g.index;
  // Alpha mode: each triangle's opaque texels are their own part; welded quads no longer join leaves that do not touch.
  if(cutout){
    for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))throw new Error('Nonfinite leaf positions');
    const uv=g.getAttribute(cutout.uv);if(!uv)throw new Error('Missing leaf UVs for alpha audit');
    const opaque=new Map<number,THREE.Vector3[]>(),N=6,point=new THREE.Vector3(),corners=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],edgeA=new THREE.Vector3(),edgeB=new THREE.Vector3();
    // Atlas cards repeat UV triangles. Cache only their opaque weights within this cutout's scan.
    const patterns=new Map<string,[number,number,number][]>();
    for(let i=0;i+2<(index?.count??p.count);i+=3){const v=[0,1,2].map(j=>index?.getX(i+j)??i+j) as [number,number,number],key=i;
      charge();for(let k=0;k<3;k++)corners[k]!.fromBufferAttribute(p,v[k]!);
      const u0=uv.getX(v[0]),u1=uv.getX(v[1]),u2=uv.getX(v[2]),t0=uv.getY(v[0]),t1=uv.getY(v[1]),t2=uv.getY(v[2]);
      const patternKey=`${u0},${t0},${u1},${t1},${u2},${t2}`;
      let weights=patterns.get(patternKey);
      if(!weights){weights=[];for(let a=0;a<=N;a++)for(let b=0;a+b<=N;b++){
        const w=[a/N,b/N,(N-a-b)/N] as [number,number,number];
        if(cutout.alpha(w[0]*u0+w[1]*u1+w[2]*u2,w[0]*t0+w[1]*t1+w[2]*t2)<cutout.cutoff)continue;
        weights.push(w);
      }
      // A clear coarse grid does not prove a clear card: thin needles can lie between its samples.
      // Retain positive fine-grid witnesses rather than aborting the whole audit. Cache empty patterns too.
      if(!weights.length){
        // Do not seed the empty-pattern cache from a collapsed card: a real card can reuse its UVs later.
        if(edgeA.subVectors(corners[1]!,corners[0]!).cross(edgeB.subVectors(corners[2]!,corners[0]!)).lengthSq()===0)continue;
        for(let a=0;a<=48;a++)for(let b=0;a+b<=48;b++){
          charge();const w0=a/48,w1=b/48,w2=(48-a-b)/48;
          if(cutout.alpha(w0*u0+w1*u1+w2*u2,w0*t0+w1*t1+w2*t2)>=cutout.cutoff)
            weights.push([w0,w1,w2]);
        }
        // A thin opaque edge can also evade the 48-grid. Refine only patterns with conservative positive hints.
        if(!weights.length&&cutout.mayHaveOpaque){
          charge();if(cutout.mayHaveOpaque(u0,t0,u1,t1,u2,t2))for(let a=0;a<=192;a++)for(let b=0;a+b<=192;b++){
            charge();const w0=a/192,w1=b/192,w2=(192-a-b)/192;
            if(cutout.alpha(w0*u0+w1*u1+w2*u2,w0*t0+w1*t1+w2*t2)>=cutout.cutoff)weights.push([w0,w1,w2]);
          }
        }
      }
      patterns.set(patternKey,weights);}
      for(const w of weights){point.set(0,0,0);for(let k=0;k<3;k++)point.addScaledVector(corners[k]!,w[k]!);
        const list=opaque.get(key)??[];list.push(point.clone());opaque.set(key,list);}}
    return [...opaque.values()].map(points=>{const box=new THREE.Box3().setFromPoints(points),centre=box.getCenter(new THREE.Vector3());
      // A cutout can leave the box centre transparent. Only opaque samples may establish wood contact.
      let nearest=points[0]!;for(const point of points)if(point.distanceToSquared(centre)<nearest.distanceToSquared(centre))nearest=point;
      const samples=[nearest];
      for(let i=0;i<Math.min(8,points.length);i++)samples.push(points[Math.floor(i*points.length/Math.min(8,points.length))]!);return{box,samples};});}
  // Unmasked mode alone needs welded vertex connectivity. Alpha mode returns above.
  const graph=union(p.count),weld=weldTable(p.count);
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))throw new Error('Nonfinite leaf positions');const other=weld(Math.round(x*1e4),Math.round(y*1e4),Math.round(z*1e4),i);if(other>=0)graph.join(i,other);}
  const used=new Set<number>();for(let i=0;i+2<(index?.count??p.count);i+=3){const a=index?.getX(i)??i,b=index?.getX(i+1)??i+1,c=index?.getX(i+2)??i+2;graph.join(a,b);graph.join(a,c);used.add(a);used.add(b);used.add(c);}
  const groups=new Map<number,number[]>();for(const i of used){const key=graph.find(i),group=groups.get(key)??[];group.push(i);groups.set(key,group);}
  // A bounding-box centre can sit in a hole, outside the actual leaf surface. Project it onto its component.
  const triangles=new Map<number,number[]>();
  for(let i=0;i+2<(index?.count??p.count);i+=3){const key=graph.find(index?.getX(i)??i),list=triangles.get(key)??[];list.push(i);triangles.set(key,list);}
  const triangle=new THREE.Triangle(),point=new THREE.Vector3();
  return [...groups.entries()].map(([key,vertices])=>{
    const box=new THREE.Box3();for(const i of vertices)box.expandByPoint(point.fromBufferAttribute(p,i));
    const centre=box.getCenter(new THREE.Vector3()),surface=new THREE.Vector3();let distance=Infinity;
    for(const i of triangles.get(key)!){
      charge();triangle.a.fromBufferAttribute(p,index?.getX(i)??i);triangle.b.fromBufferAttribute(p,index?.getX(i+1)??i+1);triangle.c.fromBufferAttribute(p,index?.getX(i+2)??i+2);
      triangle.closestPointToPoint(centre,point);const d=point.distanceToSquared(centre);
      if(d<distance){distance=d;surface.copy(point);}if(distance===0)break;
    }
    if(!Number.isFinite(distance))throw new Error('Unsupported leaf surface');
    const samples=[surface];
    for(let i=0;i<Math.min(8,vertices.length);i++)samples.push(new THREE.Vector3().fromBufferAttribute(p,vertices[Math.floor(i*vertices.length/Math.min(8,vertices.length))]!));
    return{box,samples,vertices};
  });
}
/**
 * Welds vertices at the same position rounded to 0.1 mm: `weld(x, y, z, i)` gives the first index stored at that rounded
 * position, or stores `i` there and gives -1. An open-addressed table over typed arrays, where a map keyed by the
 * position as text built a string for every vertex.
 */
function weldTable(count: number): (x: number, y: number, z: number, index: number) => number {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, count * 2))), mask = size - 1;
  const held = new Int32Array(size).fill(-1), at = new Float64Array(size * 3);
  return (x, y, z, index) => {
    for (let slot = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) & mask; ; slot = (slot + 1) & mask) {
      const first = held[slot]!;
      if (first < 0) { held[slot] = index; at[slot * 3] = x; at[slot * 3 + 1] = y; at[slot * 3 + 2] = z; return -1; }
      if (at[slot * 3] === x && at[slot * 3 + 1] === y && at[slot * 3 + 2] === z) return first;
    }
  };
}
export interface LeafNode { box: THREE.Box3; ids?: number[]; left?: LeafNode; right?: LeafNode; uniform: number }
export function boundsTree(boxes: readonly THREE.Box3[], charge: () => void): LeafNode {
  // Each box's centre, doubled, on each axis: the sorts read it from an array instead of from two boxes by axis name.
  const doubledCentre={x:new Float64Array(boxes.length),y:new Float64Array(boxes.length),z:new Float64Array(boxes.length)};
  boxes.forEach((b,i)=>{doubledCentre.x[i]=b.min.x+b.max.x;doubledCentre.y[i]=b.min.y+b.max.y;doubledCentre.z[i]=b.min.z+b.max.z;});
  // Each box's corners in one array: a node's box is the least and greatest of its boxes' corners, as Box3.union takes them.
  const bounds=new Float64Array(boxes.length*6),scratch=new Int32Array(boxes.length);
  boxes.forEach((b,i)=>{b.min.toArray(bounds,i*6);b.max.toArray(bounds,i*6+3);});
  const build=(ids:number[]):LeafNode=>{charge();
    let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
    for(const i of ids){const o=i*6;x0=Math.min(x0,bounds[o]!);y0=Math.min(y0,bounds[o+1]!);z0=Math.min(z0,bounds[o+2]!);x1=Math.max(x1,bounds[o+3]!);y1=Math.max(y1,bounds[o+4]!);z1=Math.max(z1,bounds[o+5]!);}
    const box=new THREE.Box3(new THREE.Vector3(x0,y0,z0),new THREE.Vector3(x1,y1,z1));if(ids.length<=8)return{box,ids,uniform:-1};
    const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z',centre=doubledCentre[axis];
    sortByKey(ids,0,ids.length,centre,1,0,scratch);
    const middle=ids.length>>1;return{box,left:build(ids.slice(0,middle)),right:build(ids.slice(middle)),uniform:-1};};
  if(!boxes.length)throw new Error('Missing support triangles');return build(boxes.map((_,i)=>i));
}

/** Boruvka's minimum spanning forest: nearest foreign component queries avoid dense all-pairs graphs. */
export function spanningLeafEdges(parts: Component[], limit: number, charge: () => void): [number,number,number][] {
  if (!parts.length) return [];
  const root=boundsTree(parts.map(p=>p.box),charge),graph=union(parts.length),edges:[number,number,number][]=[];
  const mark=(node:LeafNode):number=>{charge();if(node.ids){const first=graph.find(node.ids[0]!);return node.uniform=node.ids.every(i=>graph.find(i)===first)?first:-1;}const a=mark(node.left!),b=mark(node.right!);return node.uniform=a===b?a:-1;};
  for(;;){mark(root);const best=new Map<number,[number,number,number]>();
    for(let i=0;i<parts.length;i++){const group=graph.find(i);if(best.get(group)?.[2]===0)continue;const box=parts[i]!.box;let distance=best.get(group)?.[2]??limit,other=-1;
      const visit=(node:LeafNode)=>{charge();if(node.uniform===group||boxGap(box,node.box)>distance)return;
        if(node.ids){for(const j of node.ids){if(graph.find(j)===group)continue;charge();const d=boxGap(box,parts[j]!.box);if(d<=distance){distance=d;other=j;if(d===0)return;}}return;}
        const left=node.left!,right=node.right!,first=boxGap(box,left.box)<=boxGap(box,right.box)?left:right,second=first===left?right:left;
        visit(first);if(distance!==0)visit(second);
      };visit(root);if(other>=0)best.set(group,[i,other,distance]);
    }
    let changed=false;for(const[a,b,d]of best.values())if(graph.find(a)!==graph.find(b)){graph.join(a,b);edges.push([a,b,d]);changed=true;}
    if(!changed)break;
  }
  return edges;
}

/** Offline geometric candidates, not an art verdict. Full population adapters bypass render culling. */
/** Each component's nearest wood distance (surface, in the leaf geometry's units); Infinity when none within maxGap. */
export function contactDistances(parts: readonly Component[], wood: THREE.BufferGeometry, maxGap: number, charge: () => void = () => {}): number[] {
  const p = wood.getAttribute('position'), index = wood.index;
  if (!p) throw new Error('Missing wood positions');
  // Each triangle's corners in one array (a, b, c), as the vectors three's triangles held them, and its bounds.
  const count = Math.floor((index?.count ?? p.count) / 3), corners = new Float64Array(count * 9), corner = new THREE.Vector3();
  const woodBounds: THREE.Box3[] = [];
  for (let t = 0; t < count; t++) {
    const box = new THREE.Box3();
    for (let k = 0; k < 3; k++) { corner.fromBufferAttribute(p, index?.getX(t * 3 + k) ?? t * 3 + k).toArray(corners, t * 9 + k * 3); box.expandByPoint(corner); }
    woodBounds.push(box);
  }
  const support = boundsTree(woodBounds, charge), nearest = new Float64Array(3);
  // A component's contact is the first triangle found within maxGap from any of its samples, searching the nearer half
  // of each node first. The nodes still to search wait on a stack with their boxes' distances, in the order the search
  // visits them; `charge` is called at each node and each triangle, as the search reaches them.
  const pendingNode: LeafNode[] = [], pendingDistance: number[] = [];
  return parts.map(c => {
    for (const sample of c.samples) {
      const x = sample.x, y = sample.y, z = sample.z;
      pendingNode.length = 0; pendingDistance.length = 0;
      pendingNode.push(support); pendingDistance.push(boxPointDistance(support.box, x, y, z));
      while (pendingNode.length) {
        const node = pendingNode.pop()!, boxDistance = pendingDistance.pop()!;
        charge(); if (boxDistance > maxGap) continue;
        if (node.ids) {
          for (const i of node.ids) {
            charge(); closestPointOnTriangle(corners, i * 9, x, y, z, nearest);
            const dx = nearest[0]! - x, dy = nearest[1]! - y, dz = nearest[2]! - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d <= maxGap) return d;
          }
          continue;
        }
        const left = node.left!, right = node.right!, toLeft = boxPointDistance(left.box, x, y, z), toRight = boxPointDistance(right.box, x, y, z);
        // The nearer child is searched first, so it goes on the stack last.
        if (toLeft <= toRight) { pendingNode.push(right, left); pendingDistance.push(toRight, toLeft); }
        else { pendingNode.push(left, right); pendingDistance.push(toLeft, toRight); }
      }
    }
    return Infinity;
  });
}

/**
 * The detached-clump rule: a component is far when its contact distance exceeds `reach`; far components join into
 * clumps through spanning edges no longer than `limit`. A clump is detached when none of its components is near wood.
 */
export function farClumps(parts: readonly Component[], contacts: readonly number[], reach: number, limit: number, maxGap: number, charge: () => void = () => {}): { far: boolean[]; clumpOf: number[]; detachedClumps: number } {
  const isFar = (i: number) => !(contacts[i]! <= reach);
  const far = union(parts.length);
  const farIds = parts.map((_, i) => i).filter(isFar);
  if (farIds.length === parts.length) {
    for (const [a, b, d] of spanningLeafEdges(parts as Component[], maxGap, charge)) { charge(); if (d <= limit) far.join(a, b); }
  } else if (farIds.length > 1) {
    for (const [a, b] of spanningLeafEdges(farIds.map(i => parts[i]!), limit, charge)) far.join(farIds[a]!, farIds[b]!);
  }
  const clumps = new Set<number>();
  const far2 = parts.map((_, i) => isFar(i));
  for (let i = 0; i < parts.length; i++) if (far2[i]) clumps.add(far.find(i));
  return { far: far2, clumpOf: parts.map((_, i) => far.find(i)), detachedClumps: clumps.size };
}

/** Detached cards and clumps of one leaf geometry against one wood geometry, in the leaf geometry's own units. */
export function detachedClumpSet(leaves: THREE.BufferGeometry, wood: THREE.BufferGeometry, reach: number, gap: number, charge: () => void = () => {}) {
  const parts = components(leaves, charge);
  const maxGap = Math.max(gap, reach);
  const contacts = contactDistances(parts, wood, maxGap, charge);
  return { parts, components: parts.length, contacts, ...farClumps(parts, contacts, reach, gap, maxGap, charge) };
}
