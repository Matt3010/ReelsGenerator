# AI Shorts

Vertical story shorts (~30 s, English) from today's news or a topic, made entirely on this PC: a local LLM writes the
story, a local image model draws one cartoon picture per scene (reusing pictures it already made), Edge TTS narrates,
ffmpeg animates the stills with slow zooms/pans and burns word-timed captions.

```
news article / topic ─► llama.cpp (Qwen3-8B): facts, then story.json ─► library? reuse : stable-diffusion.cpp (DreamShaper XL Turbo)
                     ─► Edge TTS voice + word timings ─► zoom/pan frames + ASS captions + voice ─► ffmpeg ─► video.mp4
```

## Use
Double-click `Avvia AI Shorts.bat` (Docker Desktop with the WSL 2 backend and the NVIDIA driver) → http://127.0.0.1:8765
→ **Notizie di oggi** or type a topic → **Genera video**. The first start builds the images (llama.cpp and sd.cpp are
compiled for the GTX 1060) and downloads the models into the `models` volume if they are not there yet.

## Containers (`docker-compose.yml`)
- `web` — nginx, the only way in (127.0.0.1:8765): serves the Svelte app, passes `/api` to the API, streams the videos.
- `api` — Node + Hono API and the pipeline, with the GPU: starts `llama-server` only while the story is written, then
  `sd-cli` draws (the 6 GB card holds one model at a time). Volumes: `models` (12 GB) and `data` (`jobs/`, `library/`).

## Layout
- `backend/` TypeScript: `spec` story contract (zod) · `llm` llama-server, research and story prompts · `images` sd.cpp
  and the reuse plan · `library` picture index (Drizzle ORM + SQLite, migrations in `drizzle/`) · `news` RSS feeds (BBC,
  ANSA English, The Guardian, NPR, Al Jazeera) and article text · `tts` Edge voices · `timeline` · `render` frames (sharp), captions,
  audio graph, ffmpeg · `pipeline` jobs · `server` API · `setup` model downloads · `config` paths from the environment.
- `frontend/` Svelte 5 + Vite with SendLater's design system (tokens, glass surfaces, Inter, lucide icons).
- `docker/` the two images and nginx's config.

## Dev
`cd backend && npm test` · `cd frontend && npm test && npm run check` ·
outside Docker: `cd backend && npm start` (API on :3000, Windows binaries in `tools/`, models in `models/`) and
`cd frontend && npm run dev` (http://localhost:5173). New table or column: edit `backend/src/db.ts`, then
`npx drizzle-kit generate`.
