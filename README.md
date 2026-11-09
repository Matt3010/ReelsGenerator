# AI Shorts

Generates ~30 s vertical story shorts from a topic, entirely on this PC: a local LLM writes the story, a local image
model draws one cartoon picture per scene (reusing pictures it already made), Edge TTS narrates, ffmpeg animates the
stills with slow zooms/pans and burns word-timed captions.

```
topic ─► llama.cpp (Qwen3-8B) ─► story.json ─► library? reuse : stable-diffusion.cpp (DreamShaper XL Turbo)
      ─► Edge TTS voice + word timings ─► timeline ─► zoom/pan frames + ASS captions + voice + music ─► ffmpeg ─► video.mp4
```

## Use
Double-click `Avvia AI Shorts.bat` → browser on http://127.0.0.1:8765 → type a topic or click **Idee** → **Genera video**.
CLI: `.venv\Scripts\python -m shorts "The Great Molasses Flood of 1919"`.

## Local models (in the repo folder, git-ignored)
- `tools/llama/` llama.cpp Windows CUDA 12.4 build (the GTX 1060 is Pascal: CUDA 13 builds do not support it)
- `tools/sd/` stable-diffusion.cpp Windows CUDA 12 build (`sd-cli.exe`)
- `models/Qwen3-8B-Q4_K_M.gguf`, `models/DreamShaperXL_Turbo_v2_1.safetensors`, `models/sdxl.vae.safetensors`

The 6 GB card holds one model at a time: llama-server runs only while the story is written (and while the model
decides whether a library picture fits), then stops; sd.cpp then draws (~70 s per 768x1344 picture).

## Picture library
`library/images/*.png` + `library/library.db` (SQLite through SQLAlchemy, schema by Alembic migrations in
`shorts/migrations/`). Every picture keeps prompt, tags, style, seed, model and a use count. Before drawing, a scene
reuses a picture with the identical prompt, or asks the LLM to choose among pictures with similar tags.

## Layout
`shorts/spec.py` story contract · `llm.py` prompts, llama-server lifecycle · `images.py` sd.cpp + reuse plan ·
`library.py` picture index · `tts.py` Edge voices · `timeline.py` frame timing · `render.py` frames, captions, audio
graph, ffmpeg · `pipeline.py` jobs in `jobs/<id>/` · `server.py` + `static/` web UI.
Music: CC0 tracks in `music/<mood>/`, ducked under the voice. No sound effects.

## Dev
`.venv\Scripts\python -m pytest`
