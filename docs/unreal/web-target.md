# Unreal Engine 5.9's web target

Unreal Engine 5.9 can build a game for the browser. This page records what is known about that target as of 14
November 2026, how firmly, and what it means for Tervain. The engine was not available when this was written: nothing
here was built or run.

The short of it: the target is experimental and in preview, it renders with the mobile renderer, and it has a memory
ceiling. Tervain's first Unreal build should be for desktop. The existing Three.js build stays the browser test bed
until the engine's web target is released and measured.

## What is established, and how

**From Epic's documentation** (the Unreal Engine 5.9 Preview release notes, last updated 9 November 2026), quoted:

> UE 5.9 introduces a new experimental WebAssembly target with its own project settings and WebGPU rendering support.

That sentence is all the documentation says. There is no web platform page in the 5.9 documentation yet, and the
release is a preview: the page's title is "Unreal Engine 5.9 Preview Release Notes".

**From Epic's forum announcement of the preview**, as reported by search results (the page itself was not
read when this was written, so these are not checked against the source):

| Point | As reported |
| --- | --- |
| Renderer | It "uses the mobile renderer". |
| Project | It "currently requires a source build and C++ project". A Blueprint-only project will not do. |
| Browser | "Chrome offering the best experience". Chrome is the only desktop browser named. |
| Maturity | Parts of the web renderer are "prototypes we plan to refactor before the full 5.9 release ships". Expect longer cook times and performance problems. |
| Memory | Known issue UE-411671: the game crashes above 2 GB of WebAssembly memory. The workaround given is to reduce content. |
| Saved data | Known issue UE-412003: save games and settings are lost on reload in some builds, with a workaround in the page arguments. |
| Other known issues | No Bink video. No IP network driver, so no joining a server. Mac and Linux prebuilt engines lack part of the web support files. One issue notes the target works best on iOS 27. |
| Size | itch.io refuses browser games over 500 MB in total or 200 MB a file; Epic's own samples exceed that in development builds. |

**From third-party tests of the preview**, not confirmed by Epic: the build is 32-bit WebAssembly; threads need
cross-origin isolation, which the exported page can set up with a service worker when the server cannot send the
headers; opening the page from disk does not work; one test's `.wasm` file was about 134 MiB.

**Not found anywhere from Epic:** a statement about Nanite, Virtual Shadow Maps, Lumen or ray tracing on the web target
specifically; which mobile shading path it uses; texture formats; audio; whether the target continues in Unreal
Engine 6.

## What the mobile renderer supports

Since the target uses the mobile renderer, Epic's "Mobile Rendering Features Reference" is the best guide to what it
can draw. The table has no web column, so whether every row holds on WebGPU is untested. Values are as given for the
Mobile Forward and Mobile Deferred columns; "Yes *" is Epic's mark for "supported, but may require some prerequisites
or additional setup".

| Feature | Mobile Forward | Mobile Deferred |
| --- | --- | --- |
| Nanite virtualized geometry | No | No |
| Virtual Shadow Maps | No | No |
| Lumen global illumination and reflections (software or hardware ray tracing) | No | No |
| Hardware ray tracing features | No | No |
| Cascaded shadow maps | Yes | Yes |
| Distance field shadows | Yes * | Yes * |
| Directional lights | one, of any type | one, of any type |
| Point light shadows | Yes * | Yes * |
| Volumetric fog | Yes * | Yes * |
| Volumetric clouds | No | No |
| Sky Atmosphere | Yes | Yes |
| Screen space reflections | Yes * | Yes * |
| Planar reflections | Yes | Yes |
| Single Layer Water, and the Water system | Yes | Yes |
| Runtime and streaming virtual textures | Yes | Yes |
| Temporal Super Resolution | No | No |
| Temporal anti-aliasing, FXAA | Yes | Yes |
| MSAA | Yes | No |

**On Lumen.** Lumen is sometimes described as experimental on the web target. Epic's table lists Lumen as
unsupported on both mobile shading paths, and Epic's separate page on Lumen for mobile covers only the desktop
renderer on some Android devices. Until Epic says otherwise for the web target, plan for no Lumen there: baked or
simple dynamic lighting, with Lumen as a desktop-only quality tier.

## What that means for Tervain

**Geometry.** No Nanite means every mesh needs real levels of detail and a triangle budget. Epic's mobile guidance
(written for much older devices, and so a floor, not a target) is at most 500,000 triangles and 700 draw calls in view.
The web build today draws 284 draw calls and about 2.9 million triangles in the reference view of its budget check at
its High preset. Its draw calls already fit; its triangles are roughly six times the guidance, most of them trees
(up to 20,000 triangles each) and the hero (150,000). A web-target build of the port needs lighter tree levels and a
lighter hero than a desktop build, so the choice of tree assets matters: prefer packs with real LODs over ones that
depend on Nanite Foliage (see the asset manifest's notes).

**Lighting.** One sun, as the web build has now, with cascaded shadows. Lanterns and hearths as a few
point lights. No Virtual Shadow Maps. No Lumen. No volumetric clouds: use a sky dome or cloud layers.

**Materials.** Epic's mobile guidance: "You have five texture samplers available, but using all of those makes for a
fairly expensive Materials", and for Landscape materials a hard limit of 16 samplers on the OpenGL ES 3.1 mobile path. The
ground has eight layers: plan the Landscape material around few shared texture sets.

**Memory.** With a crash reported above 2 GB, content has to fit well under it. The web build serves about 300 MiB of
assets in all; cooked Unreal content for the same world will be of a different size, and must be measured. Texture
resolution and audio are the usual levers.

**Saving.** Until the reported save-game issue is fixed, saved games cannot be relied on in a web build.

**Hosting.** GitHub Pages cannot send custom response headers, so a threaded build there depends on the exported
service worker. Pages limits a published site to 1 GB, which this repository's workflow already checks for the
Three.js build. An Unreal web build would be built on a Windows machine with the engine and uploaded as an artifact;
nothing in this repository's CI can build it.

**Project shape.** The target needs a C++ project. The seed in `unreal/` is one.

## What is safe to build now

- A C++ project, with gameplay in C++ and data in tables, as seeded.
- Content with real LODs and conservative texture sizes, so the same assets can serve a mobile-renderer build.
- One sun with cascaded shadows; lighting that does not require Lumen to read well.
- The built-in Water plugin and Single Layer Water.
- Landscape, instanced foliage and Landscape grass.
- Enhanced Input; UMG.
- Saving through the engine's save-game objects, with the web build's persistence treated as unproven.

## What to keep desktop-only or avoid for now

- Nanite meshes without usable LODs, Nanite Foliage and the Procedural Vegetation Editor (both experimental).
- Virtual Shadow Maps, Lumen, hardware ray tracing, volumetric clouds, Temporal Super Resolution as requirements.
- Anything that assumes more than 2 GB of memory in the browser.
- Bink video; networking.
- Committing to the web target for release before Unreal Engine 5.9 has shipped and a Tervain build has been measured
  in Chrome.

## Looking ahead to Unreal Engine 6

Epic has said (State of Unreal, June 2026) that Unreal Engine 6 enters early access at the end of 2027 with a full
release 12 to 18 months later, that gameplay programming moves to Verse with a new framework, and that "Actors and
Blueprints will be in early versions of UE6" and are to be deprecated later, with conversion tools. That was read from
search results of Epic's posts, not from the pages. Whether the web target continues in Unreal Engine 6 is not stated.

For this port it argues for what the repository already does: keep the game's rules small, tested and separate from
engine classes, and keep its data in files, so that moving them again costs little.
