"""Topic -> story (local LLM) -> pictures (library or stable-diffusion.cpp) -> voice -> timeline -> ffmpeg,
one folder per job."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .images import Generator, plan_images, produce_images
from .library import Library
from .llm import Runner, choose_image, generate_story, research_notes
from .render import render_video
from .news import NewsItem, article_text, fetch_news
from .spec import Source, Story, norm
from .timeline import SceneAudio, Timeline, build_timeline

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "jobs"
MUSIC = ROOT / "music"
LIBRARY = ROOT / "library"
STYLE = "toon"


_GPU = threading.Lock()  # the 6 GB card holds one model at a time: llama-server OR stable-diffusion.cpp


class GpuBusy(RuntimeError):
    pass


@contextmanager
def gpu(wait: bool = True):
    if not _GPU.acquire(blocking=wait):
        raise GpuBusy("la GPU sta già facendo un video: riprova quando ha finito")
    try:
        yield
    finally:
        _GPU.release()


_LOCK = threading.RLock()
_last_created = 0.0  # status.json is read and rewritten from the web thread and the worker


class Job:
    def __init__(self, path: Path):
        self.dir = path
        self.id = path.name

    @classmethod
    def create(cls, root: Path, topic: str, voice: str, captions: bool, news: dict | None = None) -> "Job":
        stamp = time.strftime("%Y%m%d-%H%M%S")
        path = root / f"{stamp}-{uuid.uuid4().hex[:6]}"
        path.mkdir(parents=True)
        job = cls(path)
        global _last_created
        with _LOCK:  # strictly increasing, so jobs created in the same clock tick keep their order
            _last_created = max(time.time(), _last_created + 1e-3)
            created = _last_created
        job._write({"topic": topic, "voice": voice, "captions": captions, "state": "queued",
                    "step": "In coda", "title": None, "error": None, "created": created, "news": news})
        return job

    @classmethod
    def list(cls, root: Path) -> list["Job"]:
        if not root.exists():
            return []
        jobs = [cls(p) for p in root.iterdir() if (p / "status.json").exists()]
        return sorted(jobs, key=lambda j: j.status().get("created", 0), reverse=True)

    def status(self) -> dict:
        with _LOCK:
            return json.loads((self.dir / "status.json").read_text(encoding="utf-8"))

    def _write(self, st: dict) -> None:
        with _LOCK:
            tmp = self.dir / "status.json.tmp"
            tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(self.dir / "status.json")

    def update(self, **kw) -> None:
        with _LOCK:
            st = self.status()
            st.update(kw)
            self._write(st)

    def log(self, line: str) -> None:
        with (self.dir / "log.txt").open("a", encoding="utf-8") as f:
            f.write(line.rstrip() + "\n")


def pick_music(mood: str, topic: str, folder: Path = MUSIC) -> Path | None:
    """a track from music/<mood>/ (any mood if that folder is empty), the same one for the same topic"""
    if not folder.exists():
        return None
    audio = lambda d: sorted(p for p in d.rglob("*") if p.suffix.lower() in {".mp3", ".wav", ".ogg", ".m4a"})
    tracks = audio(folder / mood) if (folder / mood).is_dir() else []
    tracks = tracks or audio(folder)
    if not tracks:
        return None
    return tracks[int(hashlib.sha1(topic.encode()).hexdigest(), 16) % len(tracks)]


def normalize_audio(src: Path, dst: Path, lufs: float = -14.0) -> None:
    """two-pass EBU R128 loudness normalisation to the level short-video platforms play at; video is copied"""
    import json as _json
    import re as _re
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af", f"loudnorm=I={lufs}:TP=-1.5:LRA=11:print_format=json",
                            "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    m = _json.loads(_re.findall(r"\{[^{}]*\}", probe)[-1])
    filt = (f"loudnorm=I={lufs}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
            f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", filt, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-ar", "48000", str(dst)], check=True)


@dataclass
class Engines:
    llm: Callable[[], AbstractContextManager[Runner]]   # starts the local model for a `with` block
    generate: Generator
    tts: Callable[[str, str, Path], SceneAudio]
    library: Library
    model_name: str
    render: Callable = render_video
    normalize: Callable[[Path, Path], None] = normalize_audio
    style: str = STYLE
    max_seconds: int = 30
    article: Callable[[NewsItem], str] = article_text


def topic_seed(topic: str) -> int:
    return int(hashlib.sha1(topic.encode()).hexdigest(), 16) % 2**31


def run_job(job: Job, eng: Engines) -> None:
    st = job.status()
    try:
        lib = eng.library
        story_path, plan_path = job.dir / "story.json", job.dir / "plan.json"
        if story_path.exists():
            story = Story.model_validate_json(story_path.read_text(encoding="utf-8"))
        else:
            job.update(state="running", step="Avvio del modello locale")
            news = NewsItem(**st["news"]) if st.get("news") else None
            article = None
            if news:
                job.update(state="running", step=f"Leggo l'articolo ({news.outlet})")
                article = eng.article(news)
                (job.dir / "article.txt").write_text(article, encoding="utf-8")
            with eng.llm() as run:
                job.update(step="Il modello ragiona sui fatti")
                notes = research_notes(st["topic"], run, source_text=article)
                (job.dir / "notes.txt").write_text(notes, encoding="utf-8")
                job.update(step="Il modello scrive la storia")
                story = generate_story(st["topic"], run, notes=notes, max_seconds=eng.max_seconds, news_text=article)
                if news:
                    story.source = Source(outlet=news.outlet, title=news.title, url=news.url,
                                          published=news.published)
                story_path.write_text(story.model_dump_json(indent=1), encoding="utf-8")
                job.update(step="Cerco immagini riusabili")
                plan = plan_images(story, lib, eng.style, choose=lambda p, c: choose_image(p, c, run))
                plan_path.write_text(json.dumps(plan), encoding="utf-8")
        plan = json.loads(plan_path.read_text()) if plan_path.exists() else plan_images(story, lib, eng.style, None)
        job.update(state="running", title=story.title, step="Immagini")

        assets = produce_images(story, lib, plan, eng.generate, eng.style, topic_seed(st["topic"]), eng.model_name,
                                job.dir / "work", progress=lambda i, n: job.update(step=f"Disegno l'immagine {i}/{n}"))
        (job.dir / "images.json").write_text(json.dumps([a.id for a in assets]), encoding="utf-8")
        shutil.rmtree(job.dir / "work", ignore_errors=True)

        clips = []
        for i, scene in enumerate(story.scenes, 1):
            job.update(step=f"Voce narrante {i}/{len(story.scenes)}")
            clips.append(eng.tts(scene.narration, st["voice"], job.dir / f"s{i:02d}.mp3"))
        tl = build_timeline(clips)

        music = pick_music(story.mood, st["topic"])
        if music:
            (job.dir / "music").mkdir(exist_ok=True)
            shutil.copyfile(music, job.dir / "music" / music.name)

        job.update(step=f"Montaggio ({tl.total / tl.fps:.0f} s di video)")
        raw = job.dir / "video_raw.mp4"
        eng.render(job.dir, tl, [a.path for a in assets], [s.motion for s in story.scenes],
                   f"music/{music.name}" if music else None, st["captions"], raw, job.log)
        job.update(step="Volume a -14 LUFS")
        eng.normalize(raw, job.dir / "video.mp4")
        raw.unlink(missing_ok=True)
        job.update(state="done", step="Fatto", error=None, duration=round(tl.total / tl.fps, 1))
    except Exception as e:  # noqa: BLE001 - every failure must reach the UI
        job.log(traceback.format_exc())
        job.update(state="error", step="Errore", error=f"{type(e).__name__}: {e}")


@contextmanager
def local_llm():
    from .llm import LlamaServer, llama_runner
    with LlamaServer(log=JOBS / "llama-server.log") as url:
        yield llama_runner(url)


def default_engines() -> Engines:
    from .images import SdConfig, sd_generator
    from .tts import synthesize
    cfg = SdConfig()
    return Engines(llm=local_llm, generate=sd_generator(cfg), tts=synthesize, library=Library(LIBRARY),
                   model_name=cfg.name)


def run_default(job: Job) -> None:
    with gpu():
        run_job(job, default_engines())


def default_news() -> list[NewsItem]:
    return fetch_news()


def default_ideas() -> list[str]:
    from .llm import suggest_topics
    with gpu(wait=False), local_llm() as run:
        return suggest_topics(run)
