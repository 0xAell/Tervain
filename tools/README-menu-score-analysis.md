# Alderweir menu music analysis

The grove reads the playback position of the 235.5-second title track. The authored MIDI supplies the rubato pulse, two dotted-quarter beats per 6/8 bar. The first downbeat is at 4.5 seconds. The swell, six frequency bands and individual accents are measured in the shipped Opus recording. All analysis runs offline. The game samples the generated controls when playing, pausing or seeking.

Regenerate the two modules from the repository root with Python 3, NumPy, Mido and FFmpeg available.

```sh
python3 tools/analyze-menu-score.py
python3 tools/analyze-menu-rhythm.py
```

Pass `--check` to either command to compare its result with the committed module. The source record identifies the lossless chamber stem and both delivery encodings. [Audio source record](../docs/engineering/alderweir-audio.json) · [Editable score](world-audio/alderweir.mid) · [Earlier menu choreography and credits](../docs/engineering/menu-grove-score.md).
