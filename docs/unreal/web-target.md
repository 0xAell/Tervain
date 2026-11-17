# Unreal Engine 5.9's web target

Unreal Engine 5.9 can build a game for the browser. This page records what is known about that target as of 15
November 2026, how firmly, and what it means for Tervain. The engine was not available when this was written: nothing
here was built or run. Every statement says where it comes from: Epic's documentation or Epic's forum, read on the
page and listed in [`sources.json`](sources.json); a third party, also read on the page; or this project's own
judgement. One page could not be read, and nothing is taken from it.

The short of it: the target is experimental and in preview, it renders with the mobile renderer, and it has a memory
ceiling. Tervain's first Unreal build should be for desktop. The existing Three.js build stays the browser test bed
until the engine's web target is released and measured.

## What is established, and how

**From Epic's documentation** (the Unreal Engine 5.9 Preview release notes, last updated 9 November 2026, read on the
page on 15 November 2026), quoted:

> UE 5.9 introduces a new experimental WebAssembly target with its own project settings and WebGPU rendering support.

That sentence is all the release notes say about it. No page about the web target was found among the 5.9
documentation pages read for this document, and the release is a preview: the page's heading is "Unreal Engine 5.9
Preview Release Notes".

**From Epic's forum announcement of the preview** (posted by Epic staff with the known issues of the first preview, read
on the page on 15 November 2026), quoted:

| Point | What it says |
| --- | --- |
| Renderer | It "uses the mobile renderer". |
| Project | It "currently requires a source build and C++ project". A Blueprint-only project will not do. The same post's known issues speak of "Launcher-built C++ web games" and give "Use a source build on Mac/Linux to target the Wasm platform" as a workaround, and the third-party test below packaged with the Windows Launcher's engine. Plan on a C++ project, and on a source build at least on Mac and Linux; whether the Windows Launcher's engine is enough is for the first build to settle. |
| Browser | "Chrome offering the best experience". Chrome is the only desktop browser named. |
| Maturity | Parts of the web renderer are "prototypes we plan to refactor before the full 5.9 release ships". "Expect longer cook times and occasional performance issues as development continues." |
| Memory | Known issue UE-411671: the game crashes above 2 GB of WebAssembly memory. The workaround given: "Reduce content usage". |
| Saved data | Known issue UE-412003: save games and settings are lost on reload in C++ web games built with the Launcher's engine, with a workaround in the page arguments. |
| Opening from disk | Known issues UE-411308 and UE-411939: "Opening the packaged index.html from disk (file://) shows a cross-origin isolation error or a hosting card instead of starting the game." |
| Other known issues | "Bink video isn't supported on the web" (UE-411672). Projects made with the web-ready project template "can't join a server" because "the web build has no IpNetDriver" (UE-412027). "The premade builds on Mac and Linux are missing part of the Wasm (Web) support files." The first preview's web builds "work best on iOS 27" (UE-412148). |
| Size | "itch.io rejects oversized browser games: 500 MB total, 200 MB per file." "Lyra and Development builds exceed these limits." |

**From a third-party test of the preview**, read on the page, not confirmed by Epic: a write-up of a small C++ scene
(four boxes) packaged with the Windows Launcher's engine and run in desktop Chrome over a local server. "The main Wasm
module was 139,368,825 bytes raw and 25,589,983 bytes at Brotli quality 11." "The module's target triple was wasm64,
but the packaged module used lowered 32-bit linear memory". The server sent the isolation headers: "A local HTTP
server hosts the package so the browser gets the required isolation headers." Opened from disk, the page "displayed
the isolation error and never reached READY". In three cold runs "the median engine first frame was 2.093 seconds and
the server sent 50,111,928 bytes before READY", for that small scene on localhost.

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
unsupported on both mobile shading paths, and Epic's separate page on Lumen for mobile says "Lumen is available for
high-end devices compatible with Android Vulkan Shader Model 5 (SM5) running the desktop renderer." Until Epic says
otherwise for the web target, plan for no Lumen there: baked or
simple dynamic lighting, with Lumen as a desktop-only quality tier.

## What that means for Tervain

**Geometry.** No Nanite means every mesh needs real levels of detail and a triangle budget. Epic's mobile guidance
says "Triangle count of the entire scene should be <=500k for any view." and "Draw calls of the entire scene should be
<=700 for any single view." It was written for much older devices (the triangle figure is "the maximum poly count that
can hit 30fps on both iPad4 and iPad Air"), and so is a floor, not a target.
The web build today draws 284 draw calls and about 2.9 million triangles in the reference view of its budget check at
its High preset. Its draw calls already fit; its triangles are roughly six times the guidance, most of them trees
(up to 20,000 triangles each) and the hero (150,000). A web-target build of the port needs lighter tree levels and a
lighter hero than a desktop build, so the choice of tree assets matters: prefer packs with real LODs over ones that
depend on Nanite Foliage (see the asset manifest's notes).

**Lighting.** One sun, as the web build has now, with cascaded shadows. Lanterns and hearths as a few
point lights. No Virtual Shadow Maps. No Lumen. No volumetric clouds: use a sky dome or cloud layers.

**Materials.** Epic's mobile guidance: "You have five texture samplers available, but using all of those makes for a
fairly expensive Materials". For Landscape materials Epic says most platforms have no hard limit on layers, "The
exception being ES3.1 (mobile), which still has a hard limit in terms of sampler count (16), across all texture
accesses in the material." Whether that limit applies to the WebGPU target is not stated. The ground has eight layers:
plan the Landscape material around few shared texture sets.

**Memory.** With a crash above 2 GB a known issue (UE-411671, above), content has to fit well under it. The web
build serves about 280 MiB of assets in all; cooked Unreal content for the same world will be of a different size, and
must be measured. Texture
resolution and audio are the usual levers.

**Saving.** Until the save-game issue (UE-412003) is fixed, saved games cannot be relied on in a web build.

**Hosting.** The build needs the cross-origin isolation headers (above). That GitHub Pages cannot send them is this
project's own judgement, untested: GitHub's page of Pages limits does not mention response headers. If it holds, a web
build needs another host. GitHub documents a limit of 1 GB for a published site; its page, read on the page, says
"Published GitHub Pages sites may be no larger than 1 GB." and "GitHub Pages deployments will timeout if they take
longer than 10 minutes." This repository's build already holds the Three.js build to the size figure
(`PAGES_SITE_BYTE_LIMIT` in `tools/modelAssetDelivery.ts`). An Unreal web build would be built on a Windows machine
with the engine and uploaded as an artifact; nothing in this
repository's CI can build it.

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

Epic set out its plans for Unreal Engine 6 in a post, [The Road to UE 6](https://www.unrealengine.com/news/the-road-to-ue-6),
in June 2026. The post could not be read from where this was written (its site answers automated readers with a
challenge page), so this page takes no dates or plans from it. Users on Epic's forum quote it, in a thread read on the
page: "We're moving the gameplay programming model to Verse" and "while we aren't currently planning another official
UE5 release after 5.8". That is a report of the post, not the post, and Epic's own announcement of the 5.9 preview,
quoted above, speaks of "the full 5.9 release": this page follows Epic's announcement. Whether the web target continues in Unreal Engine 6
is not stated anywhere read.

For this port it argues for what the repository already does: keep the game's rules small, tested and separate from
engine classes, and keep its data in files, so that moving them again costs little.
