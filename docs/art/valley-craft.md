# Art and sound in the valley

The playable game uses original 3D geometry. Model the forms, draw the material patterns and write the score for this valley. The reference film informs the sense of quiet and the room between sounds. Its pictures, recordings, score and effects belong to the film.

## The valley in 0.1.2

Rillford’s homes and workshops have painted loft boards under their eaves. The bakery opens onto the lane with a shuttered serving hatch. The broken hull at the ford has individual planks around the opening where the wanderer finds his first weapon. Morning light catches the warm side of the joinery while the shaded faces pick up the cooler coastal sky. Foot traffic exposes patches of flat stone through the earth along the roads.

The wanderer wears a bound, asymmetric travelling cloak. His heel meets the ground first, his weight shifts over the planted foot, and his trailing heel lifts as he pushes off. The village dogs have a deeper chest, a tucked flank, folded ears and a charcoal saddle across the back. These shapes follow the existing skeletons in play.

Near-grass rendering retains the clumps whose blades can reach the camera’s visible distance band. The terrain worker prepares periodic noise sites once and reuses them when painting each texel.

## Original assets introduced in 0.1.1

| In the game | How it is made |
| --- | --- |
| Lantern Point fog bell | A revolved bronze wall folds back into its mouth. The clapper, timber pegs, iron straps and stone feet are separate solids. The [same faces](../../src/presentation/strandBell.ts) enter the lighthouse material batches and the journey screen. The latter projects them without opening a second WebGL context. |
| Warden’s standard | The Hegemony’s sword, wings, stars and rings come from the crest supplied by the project owner. The [cloth material](../../src/presentation/menu/menuBanner.ts) paints the embroidery and its light-through mask before the fabric moves in the wind. |
| Wanderer and residents | [Sculpted figures and wardrobes](../../src/presentation/human) use named colour schemes, articulated limbs and equipment. |
| Wildlife | [Animal bodies and movement](../../src/presentation/animals/valleyAnimals.ts) are shaped for the eight species. Their persistent identities also carry hunting and riding state. |
| Woods, rooms and shore | The [environment sources](../../tools/craft-environment) make the trees, household furnishings and coastal schist. [Tree geometry](../../tools/tree-gen) and [needle and leaf patterns](../../tools/leaf-atlas) supply the other forest families. |
| Music, foley and voices | *The Ford at First Light* is a three-beat piece written for the title. [Score and sound sources](../engineering/ford-audio.md) cover the instruments, water, tool strikes, footsteps and character gestures. Dialogue appears in writing. |

The [inventory](../../data/assets/manifest.json) records the source, licence and shipped status of file-backed media. Former prototype models and dated studies remain available for historical comparison. The playable loader rejects their paths; standalone exports remove their model files. The Gothic 3 study is a separate application.
