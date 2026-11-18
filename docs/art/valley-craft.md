# Art and sound in 0.1.1

The playable game uses original 3D geometry. Model the forms, draw the material patterns and write the score for this valley. The reference film informs the sense of quiet and the room between sounds. Its pictures, recordings, score and effects belong to the film.

| In the game | How it is made |
| --- | --- |
| Lantern Point fog bell | A revolved bronze wall folds back into its mouth. The clapper, timber pegs, iron straps and stone feet are separate solids. The [same faces](../../src/presentation/strandBell.ts) enter the lighthouse material batches and the journey screen. The latter projects them without opening a second WebGL context. |
| Warden’s standard | Three ward stakes stitched into dyed wool. The [cloth material](../../src/presentation/menu/menuBanner.ts) paints the stitch pattern and its light-through mask before the fabric moves in the wind. |
| Wanderer and residents | [Sculpted figures and wardrobes](../../src/presentation/human) use named colour schemes, articulated limbs and equipment. |
| Wildlife | [Animal bodies and movement](../../src/presentation/animals/valleyAnimals.ts) are shaped for the eight species. Their persistent identities also carry hunting and riding state. |
| Woods, rooms and shore | The [environment sources](../../tools/craft-environment) make the trees, household furnishings and coastal schist. [Tree geometry](../../tools/tree-gen) and [needle and leaf patterns](../../tools/leaf-atlas) supply the other forest families. |
| Music, foley and voices | *The Ford at First Light* is a three-beat piece written for the title. [Score and sound sources](../engineering/ford-audio.md) cover the instruments, water, tool strikes, footsteps and character gestures. Dialogue appears in writing. |

The [inventory](../../data/assets/manifest.json) records the source, licence and shipped status of file-backed media. Former prototype models and dated studies remain available for historical comparison. The playable loader rejects their paths; standalone exports remove their model files. The Gothic 3 study is a separate application.
