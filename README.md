# AI Shorts

Generates ~30 s vertical animated story shorts from a topic: flat 2D bean-head characters and animated 3D animals
in a low-poly 3D world, ink outlines, narrated in English with word-timed captions.

```
topic ─► Claude (claude -p, your subscription) ─► story.json ─► Edge TTS voice + word timings
      ─► timeline ─► Remotion + three.js engine ─► video.mp4
```

## Use
Double-click `Avvia AI Shorts.bat` → browser on http://127.0.0.1:8765 → type a topic or click **Idee** → **Genera video**.
CLI: `.venv\Scripts\python -m shorts "The Great Molasses Flood of 1919"`.
Background music: CC0 tracks in `music/<mood>/` (funny, upbeat, mysterious, sad, epic; see music/CREDITS.md). Claude picks the mood; the track is ducked under the voice and faded in/out.

## What Claude decides (shorts/spec.py)
- **Scenes**: narration, setting (town, city, countryside, forest, desert, beach, snow, harbor, castle, lab, space),
  time of day (day, golden, night), camera shot/move/target, effect and the word it lands on.
- **Cast**: humans (bald bean heads, shirt/pants/skin colours, adult/kid/elder) and 12 animated 3D animals
  (cat, cow, dog, eagle, horse, llama, pig, fish, pug, sheep, wolf, zebra); `count` makes crowds and herds.
- **Props**: any of the 369 CC0 models in the catalog by key (`pirate-kit/cannon`, `nature-kit/tent_detailedOpen`…),
  or a custom object built from boxes/cylinders/spheres/cones (`glow` parts light up at night).

The engine adds background scenery per setting (layered, never intersecting), keeps every actor in the narrow
9:16 frame by measuring what is on stage, and places the ground line low in wider shots.

## Layout
- `shorts/spec.py` contract · `llm.py` prompt + validate/retry · `tts.py` Edge voices · `timeline.py` frame timing
  (TTS silence trimmed) · `pipeline.py` jobs in `jobs/<id>/` + render · `catalog.py` model catalog · `server.py` + `static/` web UI
- `engine/` Remotion project: `src/world/*` (World, props, models, characters, look/scenery), `src/vendor/*`
  (toon characters, ink pass, grade from [claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts), MIT)
- `engine/public/models/` Kenney kits (CC0) and Quaternius animals (CC0, converted FBX→GLB); licences inside each folder

## Dev
`.venv\Scripts\python -m pytest` · `cd engine && npx tsc --noEmit` ·
stills: `cd engine && node scripts/stills.mjs <render.json> <outDir> 50,140 0.4` ·
new model pack: copy GLBs into `engine/public/models/<pack>/`, add its scale to `SCALES`, run `python -m shorts.catalog`.
