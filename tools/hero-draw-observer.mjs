// This function also runs inside the gate's browser against older builds.
export function observeHeroDraws(app) {
  let attached, rig, detach, drew = false;
  return {
    beforeWorld() {
      const next = app.player.rig;
      const authored = next.person?.mesh;
      if (next === rig && attached && (!authored || attached === authored)) return;
      detach?.();
      rig = next;
      // The original authored rig carries a second skinned mesh for its optional sash. Older streamed
      // heroes validate one character skin at import; identify it by the actual hip joint in its skeleton.
      let body = authored;
      if (!body && next.hero) next.body.traverse((object) => {
        if (object.isSkinnedMesh && object !== next.sash && object.skeleton.bones.includes(next.hips)) body = object;
      });
      attached = body;
      if (!body) return;
      const before = body.onBeforeRender, after = body.onAfterRender;
      let start = -1;
      body.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        before.call(this, renderer, scene, camera, geometry, material, group);
        const target = renderer.getRenderTarget();
        start = scene === app.world.scene && camera === app.cam.camera && (target === null || target === app.grade?.target)
          && material.colorWrite && material.visible && !(material.transparent && material.opacity === 0)
          ? renderer.info.render.triangles : -1;
      };
      body.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
        if (start >= 0 && renderer.info.render.triangles > start) drew = true;
        start = -1;
        after.call(this, renderer, scene, camera, geometry, material, group);
      };
      detach = () => { body.onBeforeRender = before; body.onAfterRender = after; detach = undefined; };
    },
    presented() {
      const visible = drew;
      drew = false;
      return visible;
    },
  };
}
