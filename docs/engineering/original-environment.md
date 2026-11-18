# The valley’s original environment

The hermitage is built in metres from one branching tree. Its buttresses surround the door and its twig tips hold the canopy. Each leaf card has a fixed stem and moves at its tip in the same wind field as the meadow. The hollow, door, wisps and perches share that geometry on all three quality settings. The title builds its tree locally.

The playable woodland uses Tervain’s oak, birch, orchard, shrub, sentinel and pine generators. Saved tree keys also resolve to the original silver fir and three coastal palms. The silver fir carries branching whorls of folded needle sprays. The date and leaning palms carry paired leaflets along arched ribs. The fan palm opens radial, creased blades at the end of a shorter stalk. Each has three independently built levels of detail. Ground-layer plantings and tree clearances use the current shapes. All 451 trees retain their gameplay identity, planar position, heading and footprint.

The village’s 29 furnishings are modelled from timber, woven cloth, pottery, wax and iron. Every piece fits its existing room footprint and height, with its front facing positive Z. The coast’s eight-piece schist outcrop uses tilted bedding planes. The same mesh provides its visible and physical surfaces.

| Art | Editable source | Game files |
| --- | --- | --- |
| Hermitage, hollow and leaves | `src/presentation/menu/menuTree.ts`, `menuHollow.ts`, `treeTextures.ts` | Built in memory |
| Silver fir, shore pine, three palms and schist | `tools/craft-environment/woodland.mjs` | `public/models/flora/craft/`, `public/models/scenery/intertidal-schist.glb` |
| Village furniture | `tools/craft-environment/furniture.mjs`, `src/core/world/furnitureSizes.ts` | `public/models/craft/furniture/` |
| Fir needle colour, coverage and translucency | `tools/leaf-atlas/conifer.mjs`, `tools/leaf-atlas/build.mjs` | `public/textures/leaf/` |
| Other woodland trees | `tools/tree-gen/`, `tools/tree-gen-pine/` | `public/models/flora/hero/` |

Run `node tools/leaf-atlas/build.mjs` to draw the leaf atlases, then `node tools/craft-environment/build.mjs` to rebuild the scenery and furniture. The models use their own shapes, vertex colours and embedded textures. The furniture inventory records each finished file’s size, dimensions, triangle count and SHA-256 digest.
