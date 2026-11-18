# Tervain menu music analysis

The grove follows the three-beat pulse of The Ford at First Light. A single tempo map governs the performance and the animation, including the small ritardando at each eight-bar cadence. Six spectral bands, energy and attacks are measured offline from the shipped Opus recording. The game samples the controls from the current playback time when playing, pausing or seeking.

Run `python3 tools/analyze-menu-score.py` and `python3 tools/analyze-menu-rhythm.py` with Python 3, NumPy and FFmpeg. Pass `--check` to compare with the committed modules. [Score and synthesis](../docs/engineering/ford-audio.md) · [Editable score](world-audio/ford-score.json).
