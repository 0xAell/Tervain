# The Ford at First Light

The ford theme is a three-beat call in D Dorian. The opening reed gives way to held bowed notes, struck wire and a wooden pulse. A second melody answers lower in the phrase. Four arrangements carry these ideas into the vale, deepwood, spring and night. The earlier original Tervain suite supplies further exploration pieces, story stings and local lute tunes.

The editable [score](../../tools/world-audio/ford-score.json) specifies modes, melodies, harmonies and section tempos. The [performer](../../tools/world-audio/ford_score.py) shapes the notes, pan, early reflections and rubato. [Material and animal synthesis](../../tools/world-audio/ford_foley.py) creates the individual impacts, periodic environmental beds and calls. Speaker-specific nonverbal gestures follow text rhythm. Written dialogue carries the words.

Run the following from the repository root with Python 3, NumPy, Node with TypeScript stripping, and FFmpeg available.

```sh
python3 tools/world-audio/render-ford.py
python3 tools/analyze-menu-score.py
python3 tools/analyze-menu-rhythm.py
```

The performer and analyser share one beat grid. The spectral controls use the actual playable Opus encoding. The [recording ledger](tervain-audio.json) records every playable audio file, the independently verified earlier [code-composed Tervain pieces](../../tools/world-audio/compose) and the hashes of the score and renderers. Regeneration with different encoder versions can change container or compressed bytes.

Historical records preserve the earlier productions and their original credits. The [0.1.0 film score](alderweir-audio.json) used VSCO 2 Community Edition instruments under CC0. Earlier prototype assets have separate [world](world-audio-assets.json), [speech](voice-assets.json), [animal](animal-audio-assets.json) [hunting](hunting-sounds-archive.json) and [title](menu-score.md) records. Their recordings are retired from the playable build.
