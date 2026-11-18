import * as THREE from 'three';

const _skinIndex = new THREE.Vector4(), _skinWeight = new THREE.Vector4(), _base = new THREE.Vector4(), _weighted = new THREE.Vector4();
const vertexOf = THREE.Mesh.prototype.getVertexPosition;

/**
 * A skinned mesh's vertices where three's own CPU skinning puts them (`SkinnedMesh.getVertexPosition`, the linear
 * blending its bounds and raycasts use), for many vertices of one pose. Three works out each weighted bone's skinning
 * matrix (its world matrix after its inverse bind) again for every vertex and weight; here each is worked out once a pose.
 * The rest is three's arithmetic, step for step, on the same values, so the same positions to the last bit
 * (tests/presentation/posedVertices.test.ts holds this against three's).
 *
 * The bones must stand still from `pose()` to the last `at()` of that pose.
 */
export class PosedVertices {
  private readonly skinning: THREE.Matrix4[] = [];
  private readonly posedAt: number[] = [];
  private current = 0;

  constructor(readonly mesh: THREE.SkinnedMesh) {}

  /** Start a pose: the bones' world matrices as they now are place every vertex asked for until the next call. */
  pose(): this {
    this.current++;
    return this;
  }

  /** Where vertex `index` is drawn on the CPU, in the mesh's own space. */
  at(index: number, target: THREE.Vector3): THREE.Vector3 {
    const mesh = this.mesh, geometry = mesh.geometry;
    vertexOf.call(mesh, index, target);
    _skinIndex.fromBufferAttribute(geometry.attributes.skinIndex as THREE.BufferAttribute, index);
    _skinWeight.fromBufferAttribute(geometry.attributes.skinWeight as THREE.BufferAttribute, index);
    _base.set(target.x, target.y, target.z, 1);
    target.set(0, 0, 0);
    _base.applyMatrix4(mesh.bindMatrix);
    for (let i = 0; i < 4; i++) {
      const weight = _skinWeight.getComponent(i);
      if (weight !== 0) target.addScaledVector(_weighted.copy(_base).applyMatrix4(this.boneSkinning(_skinIndex.getComponent(i))), weight);
    }
    return target.applyMatrix4(mesh.bindMatrixInverse);
  }

  private boneSkinning(bone: number): THREE.Matrix4 {
    const matrix = this.skinning[bone] ??= new THREE.Matrix4();
    if (this.posedAt[bone] !== this.current) {
      const skeleton = this.mesh.skeleton;
      matrix.multiplyMatrices(skeleton.bones[bone]!.matrixWorld, skeleton.boneInverses[bone]!);
      this.posedAt[bone] = this.current;
    }
    return matrix;
  }
}
