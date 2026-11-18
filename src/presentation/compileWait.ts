import type * as THREE from 'three';

/** What three's WebGLProgram offers for waiting on it (renderer.info.programs holds the same objects). */
interface LinkingProgram {
  isReady(): boolean;
  /** Materials using it; 0 once three has let it go. */
  usedTimes: number;
}

/**
 * The renderer's compileAsync made to wait for every program the compiled materials hold, not each one's latest. Three's
 * own resolves once each material's current program is linked, but a material drawn on several kinds of object (a static
 * mesh and a skinned figure, an instanced batch, the shadow warm-up's shared depth material) has a program for each, and
 * only the last one compiled is current. The others could still be linking when first drawn, and a program's first draw
 * waits for its link (three reads its uniforms then), stalling that frame. On 0.1.2 the first view's preparation left 10
 * of the 136 programs it made unwaited, and a wild cat's arrival the program its skinned shadow is drawn with.
 *
 * Where the browser cannot report a link's progress (no KHR_parallel_shader_compile), three counts every program as ready
 * at once, as before. A renderer without compile (a test's stand-in) is left as it is.
 */
export function installCompleteCompileWait(renderer: THREE.WebGLRenderer): void {
  if (typeof renderer.compile !== 'function') return;
  renderer.compileAsync = (scene, camera, targetScene = null) => {
    const materials = renderer.compile(scene, camera, targetScene);
    const programs = new Set<LinkingProgram>();
    for (const material of materials) {
      const held = (renderer.properties.get(material) as { programs?: Map<string, LinkingProgram> }).programs;
      for (const program of held?.values() ?? []) programs.add(program);
    }
    return new Promise<THREE.Object3D>((resolve) => {
      const check = () => {
        // A program let go meanwhile (its material disposed) is not waited for, as three's own wait does not.
        for (const program of programs) if (program.usedTimes === 0 || program.isReady()) programs.delete(program);
        if (programs.size === 0) resolve(scene);
        else setTimeout(check, 10);
      };
      check();
    });
  };
}
