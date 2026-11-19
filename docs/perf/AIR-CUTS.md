# Air cuts (playtest 6)

Cuts toward the [Mac budget](MAC-BUDGET.md): GPU median ≤ 2.0 ms, p95 ≤ 3.0 ms, ≤ 250 draws, ≤ 1.5 M triangles on the gate machine at the mac profile (1440×900 at device scale factor 2, High, pixel ratio capped at 1.5).

Numbers come from `tools/bench.mjs --headed --quality high --size 1440x900 --dpr 2` (the whole benchmark route, the game's own GPU timer) unless marked *per object*: those come from timer queries around each draw at one fixed view (Rillford, 11:00), which separate one cost from the rest. On this desktop GPU the route median moves about ±0.3 ms between identical runs, because the card changes clock state at these light loads; small cuts can only be seen per object.

## Cuts

| Cut | GPU median | GPU p95 | Triangles | Draws | Visual check |
| --- | ---: | ---: | ---: | ---: | --- |
| Baseline (0.0.15 with the profiling switches) | 9.92 · 10.01 · 9.95 ms | 15.8 · 16.1 · 16.0 ms | 4.31 M | 342 | — |
| 1. Leaf depth pre-pass (Medium, High) | 10.08 → 7.37 ms | 16.3 → 10.7 ms | 4.02 → 5.05 M | 338 → 359 | Rillford noon and landing 17:00 captures identical apart from grass sparkle (0.06 % of pixels differ by more than 8/255, none in crowns) |
| 2. Leaf masses from a baked noise volume; unused rough-cut noise skipped | 7.37 → 7.26 · 7.14 ms | 10.7 → 10.2 · 9.8 ms | ≈ 5.3 M | ≈ 363 | Crown masses fall in a different random pattern of the same size and strength (mean difference 0.4–0.5/255) |
| 3. Shadow pass writes depth only; depth pass skips the mass noise | no change measurable here (per object: casters 1.09–1.16 ms either way) | — | — | — | Shadows identical by construction (depth unchanged) |
| 4. Tree shadow casters only where their shadow can reach the view (outdoors) | per object: casters 1.15 → 0.72 ms; route within noise | — | 5.31 · 5.03 → 4.87 · 4.86 M | 364 · 350 → 331 · 327 | Rillford 11:00 and 18:20, landing 09:00: no shadow differs |
| **Final** | **7.68 · 7.11 ms** | **10.9 · 9.7 ms** | 5.13 M | 340 | Visual gate (mac profile): bow, vault 18/18 and shimmer pass; shimmer sparkle 0.047 against the baseline's 0.058 |

How each works:

1. **Leaf depth pre-pass.** A crown is many cut-out cards deep, and a cut-out shader (discard, alpha to coverage) stops the GPU rejecting hidden fragments before shading, so every card behind the nearest was lit, shadowed and coloured. Leaves now draw a depth-only pass first (the same program and cut-out, ending after it), then shade with depth test EQUAL, no depth write and no cut-out of their own: only the nearest leaf's samples pass, the very samples the depth pass covered, so multisampled edges are unchanged. Both passes declare `invariant gl_Position`. The pass costs a second run of the leaves' vertices, which the triangle count shows. `?prepass=0` turns it off.
2. **Baked leaf-mass noise.** Two octaves of 3D value noise per leaf pixel (sixteen hashes) became two fetches from a tiling 64³ volume of the same noise.
3. **Depth-only shadow pass.** Three's PCF shadow target has an RGBA8 colour buffer that nothing samples; its writes are masked for the shadow pass (`?shadowcolor=1` restores them). Expected to matter more on a tile-based GPU than here.
4. **View-aware shadow casters.** Off-screen trees inside the sun's shadow volume cast only if their bounds, swept 260 m away from the light, touch the view's left or right side. Top and bottom are not tested, so the water's reflection keeps its shadows; indoors, and while a window capture is shown, every caster stays.

## Where the remaining time goes

Per object at Rillford, 11:00, after the cuts (ms of GPU a frame):

| Part | ms |
| --- | ---: |
| Leaves, depth pass (near models) | 0.70–0.79 |
| Leaves, colour pass (near models) | 0.57–0.72 |
| Tree shadow casters | 0.72 |
| Settlement | 0.43–0.53 |
| Terrain | 0.44–0.53 |
| Trunks and branches | 0.35–0.44 |
| Water, groundcover, post passes | 0.2–0.4 each |

At a quarter of the resolution the leaves, trunks and settlement cost nearly the same (leaves 0.38 + 0.44 ms, trunks 0.34 ms, settlement 0.36 ms): they are bound by vertices and triangles, not pixels. Taking the wind out of the leaves' vertex shader changed nothing, so it is the triangle count itself.

The final build is about 5 ms over the 2.0 ms median and 7 ms over the 3.0 ms p95; triangles (5.1 M) and draws (340) are over too.

## A frame by pass, live 0.0.49 (November 2026)

Counted with `npm run perf:frame` on the live build (db16661) at High, 1440×900 at 2× (the Mac profile), 11:00. At each of the benchmark route's 13 stops the wanderer stands, facing along the route, and the camera follows him as in play. The sun's shadow is centred on him: the benchmark route itself (`tools/bench.mjs`) moves the camera alone, so its frames draw the landing's surroundings into the shadow map wherever the camera is. Draw calls and triangles are as three counts them; they need no GPU to measure, and they are what this machine-independent budget can be held to.

| Pass | Draws (median) | Triangles (median) | At its largest |
| --- | ---: | ---: | --- |
| Main view | 218 | 3.22 M | 330 draws, 4.70 M (the landing) |
| Leaves' depth pre-pass (the near leaves a second time) | 18 | 0.94 M | 2.07 M |
| Sun's shadow map, 4096², every daytime frame | 126 | 0.75 M | 148 draws, 1.11 M |
| Water's planar reflection, 512² (only with the sea in view) | none | none | 259 draws, 2.52 M, and 0.96 M more for its leaves' depth pass |
| Water composite (the sea's projected grid and inland water) | 6 | 0.11 M | |
| The frame | 385 | 5.10 M | 746 draws, 10.4 M |

By part of the world, over all passes (medians): forest 110 draws and 2.85 M triangles; scenery 141 draws and 0.68 M; groundcover 19 and 0.53 M; the wanderer 2 and 0.30 M; terrain 28 and 0.21 M; the sea's grid 0.09 M; scatter 28 and 0.06 M; every other part under 0.05 M.

The three largest costs, on a GPU the leaves, trunks and settlement leave bound by their triangles (above):

1. **The forest**, more than half of every frame's triangles. High draws every tree's full model at every distance on purpose (`floraPopulation.ts`: no lighter model may change a silhouette as you move), and lighter models at High were tried and seen (batch 10, below). Near the landing a hero pine's wood is about 0.5 M triangles and its needles 0.5 M twice (the depth pre-pass and the colour pass); the fir spires alike.
2. **The water's reflection**, when the sea is in view: up to a third of a frame's draws and triangles for a 512 px image of a rippled surface, after its trees have already been swapped for their middle models (A76). At one stop the sea shows at the edge of the view and the whole reflection is drawn for it.
3. **The sun's shadow map**: a third of all draw calls and 0.75 M triangles, redrawn every daytime frame (moving trees and people cast it). The wanderer's 150,000-triangle skinned mesh is a fifth of its triangles; the village's merged regions most of the rest.

Drawing into the reflection only what can appear in the part of the screen where the sea shows was measured and would save nothing on the route. At the four stops with the sea in view (6, 7, 8 and 11) the rectangle its water covers on screen, before even the ripples' margin, is the whole screen, so every mirrored object falls inside it. Lighter trees at High, and the leaves' pre-pass skipped for distant trees, are trades a GPU must judge.

### Cuts since

| Cut | Before | After | Picture |
| --- | --- | --- | --- |
| The wanderer's shadow from 15,000 of his own triangles (`hero/shadowCaster.ts`): meshoptimizer's simplifier chooses them over the same vertices, within 2 mm of his surface (1.8 mm reached), in a worker; the mesh swaps to them around each shadow draw | His shadow draw 149,974 triangles. Shadow map at three stops (the landing, stop 2, stop 9): 625 k, 1.10 M, 678 k | 15,000. Shadow map 490 k, 0.97 M, 543 k (−12 to −22 %); each frame 135 k triangles fewer, all of them dual-quaternion skinned | The same frame drawn with each: 72 of 2.9 M pixels differ by more than 2/255 (at most 25), on the shadow's contact line under a boot and a few points of its far edge; his body is untouched. The map's texels are 3.4 cm across and receivers look up 7.5 cm out along their normal |
| The sky's light keeps one image and one filtered target for the whole journey (`environment.ts`), and paints the image from directions worked out once per size | Every 1.8 s a new image and a new target: the frame after looked up the program of every lit material it drew again (34 lookups at the landing, a steady frame 10) and allocated one target and freed another, 8.8 ms of JavaScript against a steady 6.0 (the loop stopped, medians of 8). Painting 1.9 ms in the page | The same environment texture every frame: 10 lookups, nothing allocated; 6.3 and 7.2 ms in two runs against a steady 5.8 and 6.1. Painting 0.8 ms in the page (warm in Node 0.61 → 0.33 ms), the same half floats | The same frame lit by the kept target and by three's own conversion of the same image: identical, 0 of 1.3 M pixels differ |
| The doors drawn as one batch per material (`partBatch.ts`): three's `BatchedMesh` holds the 18 leaves, each an instance following its pivot as the door swings, with its own copies of the planks and iron materials and its own depth material | Each leaf two meshes, a draw call each in every pass that draws it. At the route's five village stops (4, 5, 6, 9, 11): 377, 323, 432, 308 and 758 draws a frame, 30 to 84 of them doors (the shadow map 20–28, the picture 4–32, the reflection up to 32) | Two in each pass: 327, 283, 402, 282 and 680 draws (26 to 78 fewer), the triangles the same in every pass | The same frame by the inn's door, opened part way, drawn by the batches and by the leaves' own meshes: 2 of 1.3 M pixels differ, by 1/255 |
| The pushable barrels and crates drawn as batches (`partBatch.ts`, the doors' batch made general): each prop's parts are instances following its body's pose as the physics steps, drawn with the props' own materials | Each prop two or three meshes, a draw call each in every pass: at stops 4, 5, 6, 9 and 11, 327, 283, 402, 282 and 680 draws a frame (after the doors' batch), up to 16 of them props in the shadow map and 16 in the picture | 308, 270, 396, 276 and 658 draws (6 to 22 fewer), the props 2 or 3 draws a pass | The same frame by a loose barrel in the village drawn both ways: 64 of 1.3 M pixels differ, 40 by more than 2/255 (at most 15), on one stretch of the barrel's shadow edge. An instance's matrix is kept in single precision, so a shadow-map texel on the edge can fall the other way; the barrel itself is the same |
| The settlement's other moving parts join the doors' batches (`partBatch.ts`): the inn sign, the archive's door and shutter, the bell's timber, the mill and sluice wheels, the sluice gate, brace and cracks, the shortcut gate and lever, the schedule board's posts, the guard's pole and the quest's pickups. Each part follows every holder between it and the settlement (a sign's swing on its bracket) and hides with any of them | Each part one to three meshes, a draw call each in every pass: at stops 4, 5, 6, 9 and 11, 308, 270, 396, 276 and 658 draws a frame (after the props' batch) | 285, 251, 367, 256 and 618 draws (19 to 40 fewer); with the doors and the props, 15 to 24 % fewer than 0.0.49 at these stops. The settlement's moving parts draw in four batches a pass (planks, iron, timber, vertex colour) | The same frame at the mill wheel drawn both ways, the reflection redrawn for each: 299 of 1.3 M pixels differ, all but 6 by 1 or 2/255, scattered over the turning wheel's own wood, which its single-precision instance matrix shades a hair apart (at most 6/255). At the sluice, 1 pixel by 1/255 |
| The scatter's chunks drawn as one batch per material (`scatter.ts`, `partBatch.ts`): rocks, the shore's driftwood, scrub and wrack, the streams' reeds and cattails. Each 96 m chunk is an instance in its material's batch, culled on its own by its own bounds as before; the chunks stand at the origin, so their instances' matrices are the identity | Each material in each chunk a draw call in every pass, up to 35 in a picture. At stops 0, 4, 5, 6, 9 and 11: 369, 285, 251, 367, 256 and 618 draws a frame | 335, 267, 236, 341, 241 and 555 draws (15 to 63 fewer), the triangles the same or fewer in every pass. The water's reflection again hides a batch's sub-pixel and drowned instances, as it hid them as single meshes (A78): the doors', props' and parts' batches had lost that, at most 528 triangles at stop 11 | The same frame at the landing, its rocks, wrack and the sea's reflection in view (redrawn for each), drawn by the batches and by the chunks' own meshes: identical, 0 of 1.3 M pixels differ; 143 draw calls against 167 |
| The water's reflection draws the wanderer from the 15,000 triangles his shadow is drawn from (`hero/shadowCaster.ts` `drawFromFewerTriangles`, by the world's reflection lightening beside the trees' middle models) | His reflection 149,974 skinned triangles wherever it shows (stop 11: the reflection 2.53 M triangles) | 15,000; the reflection at stop 11 2.38 M, the frame 10.39 → 10.29 M | The same frame at stop 11 drawn both ways, the reflection redrawn for each: identical, 0 of 1.3 M pixels differ; the same 543 draw calls, 134,974 triangles fewer |
| The thornback drawn as two batches, its hide and its bone (`partBatch.ts`, `characters.ts` `createThornback`): its twelve merged parts (one a joint and material) are instances following their joints through the pose and the fall (`EnemyActor.present`). batchParts now takes unindexed parts; the trunk, alone on its joint and so never merged, is given the merged parts' layout to join the hide's batch | Twelve meshes, a draw each in every pass that drew the creature: on 0.1.2, 12 of the main view's draws at nine of the 13 stops, and 12 of the shadow map's at stop 10 | 2 in each pass: 10 fewer draws at stops 0 to 5, 9 and 12, 20 at stop 10, the triangles the same (100 fewer over the route; each run's sky refilter, 15 draws in a counted frame now and then, left out) | Each part's vertices, drawn by its batch, are where its own mesh drew them (to 1e-5 m, the test's check), posed, turned, walking and fallen |
| The settlement's shells drawn as one batch per surface (`settlement.ts` `installRegionSun`, `partBatch.ts`): once the sun's casters are packed (`regionSun.ts`), each surface the regions share is one batch, each region's mesh an instance culled on its own and standing at the identity; glass, the panes and the glows stay meshes | On 0.1.3, after the thornback's batches: the settlement's draws in the picture and the reflection, at the route's 13 stops, 68, 64, 49, 57, 38, 35, 63, 56, 37, 31, 14, 125 and 56; a frame's median 267 draws | 41, 41, 34, 37, 30, 30, 50, 43, 33, 26, 14, 73 and 40: 201 fewer over the route, 52 at stop 11, the settlement's triangles the same in every pass; a frame's median 254 | The same frame at stops 4, 6 and 11 drawn by the batches and by the shells' own meshes (960×600): 7, 1 and 12 of 576,000 pixels differ (at most 29/255), single pixels where two surfaces meet at the same depth and draw order decides; drawn twice by the batches, identical. One more shader program at the first view (136); 24.6 MB more on the CPU, the batches' copy of the shells' 354,000 triangles |
| The woodland's waymarkers and roadside ruin drawn as one batch per surface (`forestLandmarks.ts`, `partBatch.ts`): the stone and moss every landmark has are a batch each, each landmark an instance culled on its own and standing at the identity; a surface only one landmark has stays its mesh | On 0.1.3, the landmarks' own draws at the stops that draw them (0 to 4, 11 and 12): 22, 21, 17, 12, 2, 24 and 4 (the shadow map along the track, the main view, the reflection at the sea), 102 over the route | 10, 6, 6, 4, 2, 9 and 2: 39 over the route, 63 fewer; the triangles the same | Every instance at the identity and every vertex its mesh's own (the test checks both): the same pixels |
| The stars by day and the empty droplet pool left out (`sky.ts`, `animals/hunting/impact.ts`): the struck animals' droplet pool, an instanced mesh never culled, is hidden while no droplets fly; the stars are hidden while the night's strength (`uNight`, every star's alpha) is zero | By day the stars were a draw call in the main view and another in the water's reflection; the empty pool was prepared (its program chosen, its uniforms uploaded) in the main view, the sun's shadow map and the reflection wherever the animals were drawn | 18 draws fewer over the route's 13 stops, and 20 preparations of the empty pool (three skips its draw call but not the program and uniforms before it) | The same pixels: an empty pool draws nothing, and a star of alpha zero, blended without writing depth, leaves its pixel as it was |
| Grass tiles the main camera draws none of hidden from it (`ground/tileStream.ts`): a tile whose blades are all faded out for the main camera is hidden from the main view and shown for the window view's draws alone, which work out their own counts (`showForCaptures`) | Such a tile stayed shown for the window view, so three prepared it in the main view every frame (its program chosen, its uniforms uploaded) before skipping its draw for want of blades | 41 → 11 preparations of empty grass tiles over the route's 13 stops; the 11 left are tiles the main camera's tighter test, run as three draws, finds out of view | The same pixels: the grass's draws are the same at every stop, and a hidden tile drew nothing |
| The sea's reflection left out while the land hides all the sea in view (`water/landHorizon.ts`, `waterRenderPass.ts`): each of the sea's visibility boxes in the frustum is tested against the terrain from the eye, conservatively (the height field's lowest corners, every degree of azimuth, refined to an eighth where a box needs it), before the planar capture is drawn for it | The sea counted as in view whenever one of its boxes lay in the frustum, behind the island's hills or not, and the reflection was drawn | Stops 6 and 7: 155 draw calls and 2.1 M triangles fewer (292 → 210, 252 → 179); stops 0, 8 and 11 keep it | The same pixels: with the test and without it, 0 of 144,000 differ at each of the 13 stops (480×300, time held) |
| The sea's grid left out while no sea is in view (`waterRenderPass.ts`): out of the water's draw, and out of the single render taken when no water is in view, wherever the sea counts as out of view (no visibility box in the frustum, or every one behind the land) | The grid (94,000 triangles, the waves in its vertex shader) is laid across the screen whatever the view, so three never culls it: it was drawn with the inland water at every stop, in view or not | 10 of the route's 13 stops: a draw and 94,000 triangles fewer each (0.94 M over the route) | The same pixels: as built and with the grid drawn as before, 0 of 144,000 differ at each stop (480×300, time held) |

### The frame after these cuts, live (November 2026)

Counted as above on the live build after them (5c39fc5), medians over the 13 stops. One stop's counted frame also refiltered the sky's light (15 small draws, every 1.8 s); they are left out, as the old build filtered it outside the frame's passes.

| Pass | 0.0.49 | After the cuts |
| --- | ---: | ---: |
| Main view | 218 draws, 3.22 M triangles | 159 draws, 3.22 M |
| Leaves' depth pre-pass | 18, 0.94 M | 18, 0.94 M |
| Sun's shadow map | 126, 0.75 M | 79, 0.66 M |
| Water's reflection, at stop 11 (the sea in view) | 259, 2.52 M, and 0.96 M for its leaves' depth pass | 182, 2.39 M, and 0.96 M |
| Water composite | 6, 0.11 M | 6, 0.11 M |
| The frame | 385, 5.10 M | 293, 4.97 M |
| The largest frame (stop 11) | 746, 10.41 M | 544, 10.17 M |

By part, over all passes (medians): the settlement 141 → 83 draws for the same 0.68 M triangles, the scatter 28 → 6, the physical supplies 18 → 5, the wanderer 0.30 → 0.16 M triangles; the forest is as it was, 110 draws and 2.85 M. At the five village stops (4, 5, 6, 9 and 11) a frame draws 265, 236, 341, 240 and 544 calls where 0.0.49 drew 375, 323, 432, 307 and 746: 21 to 29 % fewer. The three largest costs are the same three. The forest is now 57 % of a frame's triangles, and the shadow map holds 27 % of its draws (79 of 293).

## Batch 10 findings (tried, measured, not kept)

Same route and profile; each A/B pair run back to back, three laps each. The machine was shared with other GPU work during these runs, so laps with a CPU median above about 9 ms are contended and their GPU time is not comparable.

| Trial | GPU median | Triangles | Draws | Visual check | Verdict |
| --- | ---: | ---: | ---: | --- | --- |
| Uncontended baseline (same session) | 7.11 · 7.24 · 7.24 ms | 5.08–5.16 M | 335–341 | — | — |
| High trees crossfade to middle 90–130 m, far 300–400 m, every species (`?highlod=90,130,300,400&highlodsp=…`) | 7.43 ms (uncontended lap) | 4.35–4.38 M | 337–357 | Broadleaf crowns thin out and turn more see-through beyond 100 m; the dithered crossfade shows on bushes | Rejected: visible, no GPU gain |
| The same with bands 160–220 / 450–600 m | not benched | — | — | Broadleaf crowns still visibly thinner at about 200 m | Rejected |
| Conifers only, 90–130 / 300–400 m | 7.18 · 7.35 ms | 4.38–4.74 M | 337–359 | Firs indistinguishable at that range; solitary pines slightly flatter | Not kept: tris −8 %, GPU unchanged |
| Tree instances packed nearest first (so hidden crowns fail the depth test) | per object, leaf depth pass 1.26 → 1.37 ms, colour 0.99 → 1.05 ms | — | — | Identical by construction | Rejected: no gain, so the leaves are not fill-bound |

What these show on this card:

- **Resolution does not move the route time.** At 480×300 and device scale 1 the GPU median was 7.60 ms, against 7.1–8.0 ms at the Air profile (2160×1350 drawn).
- **Triangles alone do not either.** Hiding the whole forest (1.56 M triangles left, 238 draws) gave 7.22 ms; turning shadows off 8.30 ms; the reflection off 9.60 ms (a contended lap).
- Per pass at Rillford (camera at (−60, 16) looking east, 11:00): main view 5.3 ms, shadow map 0.69 ms, post passes about 0.4 ms. Per object in the main view: leaf depth pass 1.1–1.3 ms, leaf colour 0.65–1.0 ms, terrain 0.54 ms, near trunks 0.43–0.57 ms, settlement 0.41 ms.
- So on the gate machine the route median is dominated by fixed cost and clock state, not by pixels or triangles, and cuts of a few tenths of a millisecond cannot be seen there. The budget has to be judged on the Air itself (frame time and heat), or with a locked GPU clock; the triangle and draw counts are the dependable proxies here.

## Distance look (batch 10)

- **Dusk haze.** From dusk the fog colour is the horizon colour dimmed by up to 35 % with nightness, and night thickens the fog by 0.0006 instead of doubling it (0.0019 → 0.0038). At 19:48 a crown 400 m away keeps about 40 % of its own colour (was 17 %), so far woods read as a dark treeline against the glowing sky instead of pale ghosts lighter than the trees in front. Day is unchanged by construction (nightness 0). Captured with the visual gate's `woods`, `meadow` and `grove` runs at 19.8 against the previous build.

## Next cuts

- **Fewer near-crown triangles.** The near leaf models carry about 11–12 k triangles a tree (cluster canopies, 6,000 cards) and High draws them to 1 km. A lighter near model, or the middle model from a distance where the two cannot be told apart, attacks the largest cost three times over (depth, colour, shadow). Needs side-by-side captures; "Lighter distant trees" alone did not help on the route, because most leaf cost is within 120 m.
- **Shadow casters at a cheaper model.** Middle-model trunks (about 4,900 triangles) cast from 16 to 70 m; an earlier test with the far model from 24–36 m flattened crown self-shadowing visibly, so it needs a dedicated shadow model rather than the far one.
- **Settlement and terrain vertices.** Both cost about the same at a quarter of the resolution; merging and LOD for distant buildings, and terrain tile LOD, are the candidates.
- **Measure on the Air itself.** This card's clock states blur cuts under 0.3 ms; a locked-clock run or the Air's own frame time is needed to confirm the small ones.
