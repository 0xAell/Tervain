# Local menu film recorder

This optional development tool records the actual animated Tervain menu scene at **1920 × 1080, 30 fps, High quality**.
It imports the game's `MenuScene` and `Grade`, including the tree, figure, Hegemony standard, fire, smoke, crows, wind,
mist, sky, and lanterns. The camera remains fixed, as in the game menu.

The film canvas composites the original procedural wordmark, bronze frame, leather, grime, and menu text over the
native WebGL render. `createMenuScreen` and the real stylesheet provide desktop layout and font measurements. This is
not a DOM screenshot or a recording of the computer screen; no still image is looped. The 2D text/compositor reproduces
the menu presentation but does not capture browser focus, hover, the SVG ink filter, or audio-unlock controls.

The tool is a separate development entry point. It is not imported by the game or included in the production bundle.
It requires the existing repository dependencies and does not add packages or use an external recording service.

## Start and inspect

From the repository root, run:

```sh
node tools/menu-film-server.mjs
```

Open **http://127.0.0.1:5180/tools/menu-film.html**. The server binds only to `127.0.0.1`. After the menu textures,
Hegemony emblem, shaders, and sky lighting finish preparing, the page exposes two buttons:

- **Record 5-second wisp test**: inspect image composition, actual animation, dimensions, and frame pacing before a full run.
- **Record full song**: record **237 seconds** of menu motion, leaving room for the complete Alderweir recording.

The test starts at song time **0:40**, during the wisp sequence. The full recording always starts at **0:00**, even
after running a test. The recorder passes elapsed song time to the native menu animation, so the tree door and wisps
follow the same score timeline as the game. The version footer comes from the current game's `GAME_VERSION`.

Keep the recorder page active and visible throughout the recording. Background tabs can throttle animation or canvas
capture. The preview scales to the window, while the underlying render and recorded canvas remain 1920 × 1080 pixels.

The browser uses WebM VP9 when supported, with VP8/WebM fallbacks, at a requested video bitrate of 16 Mbps. It records
video only. Chunks upload serially to the local receiver and stream to disk without holding the full video in memory.
The visible progress and completion message report elapsed time, rendered frames, bytes, and the exact output path.

## Output directory

By default, recordings are written to **`../tervain-menu-film-output`**, a sibling directory outside the repository.
Override it when launching the server:

```sh
TERVAIN_MENU_FILM_OUTPUT='/absolute/path/to/menu-film-output' node tools/menu-film-server.mjs
```

If the default port is occupied, set `TERVAIN_MENU_FILM_PORT` (for example `5182`) and open the corresponding local URL.

Each run creates a new `test-motion-<UUID>.webm` or `menu-motion-<UUID>.webm` file. Existing files are never overwritten.
Interrupted or failed runs remain partial files and are reported as incomplete. `GET /__menu_film/status` exposes local
recording progress; recording write endpoints accept requests only from this recorder's own local origin.

## Add the complete song

The captured WebM has no audio. After the full recording completes, mux the **complete approved AAC score** separately.
FFprobe reports **11,304,000 samples at 48 kHz** for Alderweir’s AAC track. Its **235.5 seconds**
fill exactly **7,065 frames at 30 fps**. The command below trims the video to that frame count, encodes
it to H.264 and copies the full AAC stream.

```sh
ffmpeg -i '/absolute/path/menu-motion-UUID.webm' \
  -i 'public/assets/audio/world/alderweir/title.m4a' \
  -map 0:v:0 -map 1:a:0 \
  -vf 'fps=30,trim=end_frame=7065,setpts=PTS-STARTPTS' \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart \
  '/absolute/path/Tervain-menu-Alderweir.mp4'
```

The recorder takes its timeline from the game’s score data. When the music changes, read the new AAC
stream duration with FFprobe and round up its duration in seconds multiplied by 30 for the final video
frame count. Verify the encoded file’s stream durations and video frame count before delivery.

```sh
ffprobe -v error -show_entries stream=codec_name,duration,nb_frames -of compact \
  '/absolute/path/Tervain-menu-Alderweir.mp4'
```
