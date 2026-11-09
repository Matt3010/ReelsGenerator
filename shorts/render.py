"""The short from still pictures: slow zoom/pan per scene, crossfades, word-timed captions (ASS), voice and
music ducked under the voice, all encoded by ffmpeg."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Callable

from PIL import Image

from .timeline import Timeline

SIZE = (1080, 1920)
ZOOM = 1.18          # how far a zoom travels / how much room a pan has
FADE = 8             # crossfade frames between scenes
YELLOW, WHITE = "&H4DE1FF&", "&HFFFFFF&"   # ASS colours are BGR


def _ease(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def crop_box(motion: str, t: float, w: int, h: int, aspect: float = 9 / 16) -> tuple[float, float, float, float]:
    """the part of the w x h picture shown at time t (0..1) of the scene, always with the output aspect"""
    bw, bh = (h * aspect, h) if w / h >= aspect else (w, w / aspect)   # largest 9:16 box
    e = _ease(t)
    if motion in ("zoom_in", "zoom_out"):
        s = 1 + (1 / ZOOM - 1) * (e if motion == "zoom_in" else 1 - e)
        cw, ch = bw * s, bh * s
        x0, y0 = (w - cw) / 2, (h - ch) / 2
        return (x0, y0, x0 + cw, y0 + ch)
    cw, ch = bw / ZOOM, bh / ZOOM
    sx, sy = w - cw, h - ch
    x0, y0 = sx / 2, sy / 2
    if motion == "pan_left":
        x0 = sx * (1 - e)
    elif motion == "pan_right":
        x0 = sx * e
    elif motion == "pan_up":
        y0 = sy * (1 - e)
    elif motion == "pan_down":
        y0 = sy * e
    return (x0, y0, x0 + cw, y0 + ch)


def frame_image(im: Image.Image, box: tuple[float, float, float, float], size: tuple[int, int] = SIZE) -> Image.Image:
    """sub-pixel crop + scale, so slow moves do not jitter"""
    return im.transform(size, Image.Transform.EXTENT, box, Image.Resampling.BICUBIC)


def scene_index(tl: Timeline, frame: int) -> int:
    for i, s in enumerate(tl.scenes):
        if frame < s.start + s.frames:
            return i
    return len(tl.scenes) - 1


def iter_frames(tl: Timeline, images: list[Path], motions: list[str], size: tuple[int, int] = SIZE):
    pics = [Image.open(p).convert("RGB") for p in images]

    def shot(i: int, f: int) -> Image.Image:
        s = tl.scenes[i]
        pic = pics[i]
        return frame_image(pic, crop_box(motions[i], (f - s.start) / max(1, s.frames - 1), *pic.size), size)

    for f in range(tl.total):
        i = scene_index(tl, f)
        im = shot(i, f)
        into = f - tl.scenes[i].start
        if i > 0 and into < FADE:
            im = Image.blend(shot(i - 1, f), im, (into + 1) / (FADE + 1))
        yield im


# ---------------------------------------------------------------- captions

def _chunks(tl: Timeline) -> list[list]:
    words = [w for s in tl.scenes for w in s.words]
    out, cur = [], []
    for w in words:
        if cur and w.start - cur[-1].end > 8:          # never run a caption across a pause
            out.append(cur)
            cur = []
        cur.append(w)
        text = " ".join(x.text for x in cur)
        if len(cur) == 3 or len(text) > 16 or re.search(r"[.,!?;:]$", w.text):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def _ts(frame: int, fps: int) -> str:
    cs = round(frame * 100 / fps)
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def _clean(text: str) -> str:
    return re.sub(r"[.,!?;:]+$", "", text).upper().replace("{", "(").replace("}", ")")


def ass_captions(tl: Timeline, width: int = SIZE[0], height: int = SIZE[1]) -> str:
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial Black,104,&H00FFFFFF,&H00FFFFFF,&H001A0C12,&H59000000,1,0,0,0,100,100,1,0,1,10,6,8,70,70,{round(height * 0.24)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    chunks = _chunks(tl)
    for ci, chunk in enumerate(chunks):
        nxt = chunks[ci + 1][0].start if ci + 1 < len(chunks) else None
        for wi, w in enumerate(chunk):
            if wi + 1 < len(chunk):
                end = chunk[wi + 1].start
            else:
                end = w.end + 8 if nxt is None else min(nxt, w.end + 8)
            words = [f"{{\\c{YELLOW}}}{_clean(x.text)}{{\\c{WHITE}}}" if x is w else _clean(x.text) for x in chunk]
            pop = "{\\fscx88\\fscy88\\t(0,120,\\fscx100\\fscy100)}" if wi == 0 else ""
            lines.append(f"Dialogue: 0,{_ts(w.start, tl.fps)},{_ts(max(end, w.start + 1), tl.fps)},Cap,,0,0,0,,"
                         f"{pop}{' '.join(words)}")
    return head + "\n".join(lines) + "\n"


# ---------------------------------------------------------------- audio

def audio_graph(tl: Timeline, music: str | None, first_input: int = 1) -> tuple[list[str], str]:
    """ffmpeg inputs (paths relative to the job folder) and the filter graph that ends in [aout]"""
    fps, total = tl.fps, tl.total / tl.fps
    inputs: list[str] = []
    parts: list[str] = []

    def add(path: str) -> int:
        inputs.append(path)
        return first_input + len(inputs) - 1

    voices = []
    for i, s in enumerate(tl.scenes):
        if not s.audio:
            continue
        n = add(s.audio)
        parts.append(f"[{n}:a]atrim=start={s.audio_trim / fps:.3f},asetpts=PTS-STARTPTS,"
                     f"adelay={round(s.audio_start / fps * 1000)}:all=1[v{i}]")
        voices.append(f"[v{i}]")
    parts.append(f"{''.join(voices)}amix=inputs={len(voices)}:normalize=0[voice]")
    mix = ["[voice]"]
    if music:
        n = add(music)
        parts.append(f"[{n}:a]aloop=loop=-1:size=2000000000,atrim=duration={total:.3f},volume=0.30,"
                     f"afade=t=in:d=0.4,afade=t=out:st={max(0.0, total - 1):.3f}:d=1[mus]")
        parts.append("[voice]asplit=2[voicemix][sc]")
        parts.append("[mus][sc]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=500[ducked]")
        mix = ["[voicemix]", "[ducked]"]
    parts.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,apad,atrim=duration={total:.3f}[aout]")
    return inputs, ";\n".join(parts)


# ---------------------------------------------------------------- encode

def render_video(job_dir: Path, tl: Timeline, images: list[Path], motions: list[str], music: str | None,
                 captions: bool, out: Path, log: Callable[[str], None] = print) -> None:
    """frames are piped to ffmpeg as raw RGB; paths in the graph are relative to job_dir (ffmpeg runs there)"""
    inputs, agraph = audio_graph(tl, music)
    vgraph = "[0:v]ass=captions.ass[vout]" if captions else "[0:v]null[vout]"
    if captions:
        (job_dir / "captions.ass").write_text(ass_captions(tl), encoding="utf-8")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{SIZE[0]}x{SIZE[1]}",
           "-r", str(tl.fps), "-i", "-"]
    for p in inputs:
        cmd += ["-i", p]
    cmd += ["-filter_complex", f"{vgraph};\n{agraph}", "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264",
            "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-movflags", "+faststart", str(out.resolve())]
    proc = subprocess.Popen(cmd, cwd=job_dir, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin
    try:
        for n, im in enumerate(iter_frames(tl, images, motions)):
            proc.stdin.write(im.tobytes())
            if n % (tl.fps * 5) == 0:
                log(f"frame {n}/{tl.total}")
        proc.stdin.close()
    except (BrokenPipeError, OSError):
        pass
    err = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg failed: {err[-2000:]}")
