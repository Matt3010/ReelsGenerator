"""Web UI: pick or type a topic, click Generate, watch progress, play and download the short."""
from __future__ import annotations

import queue
import re
import threading
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, HttpUrl, field_validator

from .news import NewsItem
from .pipeline import JOBS, Job, default_news, run_default
from .tts import VOICES

STATIC = Path(__file__).parent / "static"


class NewsRef(BaseModel):
    title: str
    url: HttpUrl
    published: str = ""
    outlet: str
    summary: str = ""


class NewJob(BaseModel):
    topic: str
    voice: str = "en-US-GuyNeural"
    captions: bool = True
    news: NewsRef | None = None

    @field_validator("topic")
    @classmethod
    def topic_present(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("topic is empty")
        return v[:300]

    @field_validator("voice")
    @classmethod
    def known_voice(cls, v: str) -> str:
        if v not in VOICES:
            raise ValueError(f"unknown voice {v}")
        return v


def create_app(root: Path = JOBS, runner: Callable[[Job], None] = run_default,
               news: Callable[[], list[NewsItem]] = default_news) -> FastAPI:
    app = FastAPI(title="AI Shorts")
    root.mkdir(parents=True, exist_ok=True)
    work: "queue.Queue[Job]" = queue.Queue()

    def worker():  # one job at a time: renders use the whole GPU/CPU
        while True:
            job = work.get()
            try:
                runner(job)
            except Exception as e:  # noqa: BLE001
                job.update(state="error", error=str(e))

    threading.Thread(target=worker, daemon=True).start()

    def get_job(jid: str) -> Job:
        if not re.fullmatch(r"[0-9]{8}-[0-9]{6}-[0-9a-f]{6}", jid) or not (root / jid / "status.json").exists():
            raise HTTPException(404, "job not found")
        return Job(root / jid)

    @app.get("/", response_class=HTMLResponse)
    def index():
        return (STATIC / "index.html").read_text(encoding="utf-8")

    @app.get("/api/voices")
    def voices():
        return VOICES

    @app.get("/api/news")
    def get_news():
        return [n.to_dict() for n in news()]

    @app.get("/api/jobs")
    def list_jobs():
        return [{"id": j.id, **j.status()} for j in Job.list(root)]

    @app.post("/api/jobs")
    def new_job(req: NewJob):
        ref = req.news.model_dump(mode="json") if req.news else None
        job = Job.create(root, req.topic, req.voice, req.captions, news=ref)
        work.put(job)
        return {"id": job.id}

    @app.post("/api/jobs/{jid}/retry")
    def retry(jid: str):
        job = get_job(jid)
        job.update(state="queued", step="In coda", error=None)
        work.put(job)
        return {"id": job.id}

    @app.get("/api/jobs/{jid}/story")
    def story(jid: str):
        p = get_job(jid).dir / "story.json"
        if not p.exists():
            raise HTTPException(404, "no story yet")
        return FileResponse(p, media_type="application/json")

    @app.get("/api/jobs/{jid}/video")
    def video(jid: str):
        p = get_job(jid).dir / "video.mp4"
        if not p.exists():
            raise HTTPException(404, "no video yet")
        return FileResponse(p, media_type="video/mp4", filename=f"{jid}.mp4")

    return app
