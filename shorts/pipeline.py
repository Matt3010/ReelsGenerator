"""Topic -> story.json -> voice -> timeline -> Remotion render, one folder per job."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Callable

from .spec import Story, norm
from .timeline import SceneAudio, Timeline, build_timeline

ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
JOBS = ROOT / "jobs"
MUSIC = ROOT / "music"
MODELS_DIR = ENGINE / "public" / "models"
SFX_DIR = ENGINE / "public" / "sfx"
REMOTION_TMP = Path(os.environ.get("REMOTION_TMP", Path.home() / "remotion-tmp"))


_LOCK = threading.RLock()  # status.json is read and rewritten from the web thread and the worker


class Job:
    def __init__(self, path: Path):
        self.dir = path
        self.id = path.name

    @classmethod
    def create(cls, root: Path, topic: str, voice: str, captions: bool) -> "Job":
        stamp = time.strftime("%Y%m%d-%H%M%S")
        path = root / f"{stamp}-{uuid.uuid4().hex[:6]}"
        path.mkdir(parents=True)
        job = cls(path)
        job._write({"topic": topic, "voice": voice, "captions": captions, "state": "queued",
                    "step": "In coda", "title": None, "error": None, "created": time.time()})
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


def hit_frames(story: Story, tl: Timeline) -> list[int]:
    """frame where each scene's effect / reaction lands: on its effect_word, else 40 % into the speech"""
    out = []
    for scene, t in zip(story.scenes, tl.scenes):
        frame = None
        if scene.effect_word:
            target = norm(scene.effect_word)
            frame = next((w.start for w in t.words if norm(w.text) == target), None)
        if frame is None:
            if t.words:
                a, b = t.words[0].start, t.words[-1].end
            else:
                a, b = t.start, t.start + t.frames
            frame = a + round(0.4 * (b - a))
        out.append(frame)
    return out


def link_models(job_dir: Path) -> None:
    """the job folder is Remotion's public dir: give it the shared 3D models as hard links (no copy, no symlink,
    which Remotion cannot handle on Windows); falls back to a real copy across drives"""
    for base, name in ((MODELS_DIR, "models"), (SFX_DIR, "sfx")):
        for src in base.rglob("*"):
            if not src.is_file():
                continue
            dst = job_dir / name / src.relative_to(base)
            if dst.exists():
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(src, dst)
            except OSError:
                shutil.copy2(src, dst)


def resolve_beats(story: Story, tl: Timeline) -> list[list[int]]:
    """frame of every beat: the first spoken occurrence of its word, else 40 % into the speech"""
    out: list[list[int]] = []
    for scene, t in zip(story.scenes, tl.scenes):
        frames = []
        for b in scene.beats:
            target = norm(b.word)
            f = next((w.start for w in t.words if norm(w.text) == target), None)
            if f is None:
                a, z = (t.words[0].start, t.words[-1].end) if t.words else (t.start, t.start + t.frames)
                f = a + round(0.4 * (z - a))
            frames.append(f)
        out.append(frames)
    return out


EFFECT_SOUND = {"shake": "thud", "explosion": "explosion", "splash": "splash", "confetti": "pop", "smoke": "whoosh", "flash": "ding"}
SYMBOL_SOUND = {"exclaim": "pop", "question": "question", "idea": "ding", "anger": "punch", "stars": "bell", "hearts": "pop", "sweat": "click"}
ACTION_SOUND = {"jump": "boing", "fall": "thud", "run": "footsteps", "walk": "footsteps"}


def sound_events(story: Story, tl: Timeline, beat_frames: list[list[int]], hits: list[int]) -> list[dict]:
    """sound effects: explicit beat sfx, plus automatic ones for cuts, symbols, actions and scene effects"""
    ev: dict[tuple[str, int], float] = {}

    def add(sound: str, frame: int, volume: float) -> None:
        key = (sound, frame)
        ev[key] = max(volume, ev.get(key, 0))

    for scene, frames, hit in zip(story.scenes, beat_frames, hits):
        if scene.effect in EFFECT_SOUND:
            add(EFFECT_SOUND[scene.effect], hit, 0.9)
        for b, f in zip(scene.beats, frames):
            if b.sfx:
                add(b.sfx, f, 0.8)
            elif b.symbol in SYMBOL_SOUND:
                add(SYMBOL_SOUND[b.symbol], f, 0.6)
            elif b.action in ACTION_SOUND:
                add(ACTION_SOUND[b.action], f, 0.6)
            if b.camera:
                add("whoosh", f, 0.35)
    return [{"sound": s, "frame": f, "volume": v} for (s, f), v in sorted(ev.items(), key=lambda kv: kv[0][1])]


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


def cleanup_remotion_tmp(tmp: Path = REMOTION_TMP) -> None:
    """every Remotion bundle copies the whole project (~60 MB) into the temp dir and never deletes it"""
    if not tmp.exists():
        return
    for d in tmp.iterdir():
        if d.is_dir() and d.name.startswith(("remotion-webpack-bundle-", "puppeteer_dev_chrome_profile-")):
            shutil.rmtree(d, ignore_errors=True)


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


def remotion_render(job_dir: Path, props_path: Path, out_path: Path, log: Callable[[str], None]) -> None:
    REMOTION_TMP.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "TEMP": str(REMOTION_TMP), "TMP": str(REMOTION_TMP)}
    raw = out_path.with_name(out_path.stem + "_raw.mp4")
    cmd = ["npx", "remotion", "render", "src/index.ts", "Short", str(raw.resolve()),
           f"--props={props_path.resolve()}", f"--public-dir={job_dir.resolve()}", "--codec=h264", "--crf=18",
           "--gl=angle", "--concurrency=4"]
    proc = subprocess.Popen(cmd, cwd=ENGINE, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace", shell=os.name == "nt")
    assert proc.stdout
    for line in proc.stdout:
        log(line)
    code = proc.wait()
    cleanup_remotion_tmp()  # one job renders at a time, so nothing else is using these bundles
    if code != 0:
        raise RuntimeError(f"remotion render failed (exit {code}), see log.txt")
    log("normalising loudness to -14 LUFS")
    normalize_audio(raw, out_path)
    raw.unlink(missing_ok=True)


def run_job(job: Job, generate: Callable[[str], Story], tts: Callable[[str, str, Path], SceneAudio],
            render: Callable = remotion_render) -> None:
    st = job.status()
    try:
        story_path = job.dir / "story.json"
        if story_path.exists():
            story = Story.model_validate_json(story_path.read_text(encoding="utf-8"))
        else:
            job.update(state="running", step="Claude scrive la storia")
            story = generate(st["topic"])
            story_path.write_text(story.model_dump_json(indent=1), encoding="utf-8")
        job.update(state="running", title=story.title, step="Voce narrante")

        clips = []
        for i, scene in enumerate(story.scenes, 1):
            job.update(step=f"Voce narrante {i}/{len(story.scenes)}")
            clips.append(tts(scene.narration, st["voice"], job.dir / f"s{i:02d}.mp3"))
        tl = build_timeline(clips)
        timeline = tl.to_dict()
        hits = hit_frames(story, tl)
        beat_frames = resolve_beats(story, tl)
        for s, hit, scene, frames in zip(timeline["scenes"], hits, story.scenes, beat_frames):
            s["effect_frame"] = hit
            s["beats"] = [{**b.model_dump(), "frame": f} for b, f in zip(scene.beats, frames)]

        music = pick_music(story.mood, st["topic"])
        if music:
            (job.dir / "music" ).mkdir(exist_ok=True)
            (job.dir / "music" / music.name).write_bytes(music.read_bytes())
        props = {"story": story.model_dump(), "timeline": timeline, "captions": st["captions"],
                 "music": f"music/{music.name}" if music else None,
                 "sfx": sound_events(story, tl, beat_frames, hits)}
        link_models(job.dir)
        props_path = job.dir / "render.json"
        props_path.write_text(json.dumps(props, ensure_ascii=False), encoding="utf-8")

        job.update(step=f"Rendering ({tl.total / tl.fps:.0f} s di video)")
        render(job.dir, props_path, job.dir / "video.mp4", job.log)
        job.update(state="done", step="Fatto", error=None, duration=round(tl.total / tl.fps, 1))
    except Exception as e:  # noqa: BLE001 - every failure must reach the UI
        job.log(traceback.format_exc())
        job.update(state="error", step="Errore", error=f"{type(e).__name__}: {e}")
