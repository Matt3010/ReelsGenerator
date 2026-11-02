"""Turn per-scene voice clips into a frame-accurate timeline for the engine."""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Word:
    text: str
    start: float  # seconds, relative to the clip
    end: float


@dataclass
class SceneAudio:
    audio: str
    duration: float  # seconds
    words: list[Word] = field(default_factory=list)


@dataclass
class FrameWord:
    text: str
    start: int
    end: int


@dataclass
class SceneTiming:
    audio: str
    start: int
    frames: int
    audio_start: int
    words: list[FrameWord]
    audio_trim: int = 0  # frames of leading silence skipped in the clip


@dataclass
class Timeline:
    fps: int
    total: int
    scenes: list[SceneTiming]

    def to_dict(self) -> dict:
        return {
            "fps": self.fps,
            "total": self.total,
            "scenes": [
                {
                    "audio": s.audio, "start": s.start, "frames": s.frames,
                    "audio_start": s.audio_start, "audio_trim": s.audio_trim,
                    "words": [{"text": w.text, "start": w.start, "end": w.end} for w in s.words],
                }
                for s in self.scenes
            ],
        }


def build_timeline(
    clips: list[SceneAudio], fps: int = 30, lead: float = 0.3, gap: float = 0.15, tail: float = 1.0,
    trim: bool = True, pre: float = 0.08, post: float = 0.15,
) -> Timeline:
    """lay the clips end to end; with trim, the TTS padding around the words is cut (pre/post seconds kept)"""
    scenes: list[SceneTiming] = []
    cursor = 0
    for i, clip in enumerate(clips):
        lead_f = round(lead * fps) if i == 0 else 0
        tail_f = round(tail * fps) if i == len(clips) - 1 else 0
        t0, t1 = 0.0, clip.duration
        if trim and clip.words:
            t0 = max(0.0, clip.words[0].start - pre)
            t1 = min(clip.duration, clip.words[-1].end + post)
        audio_f = math.ceil((t1 - t0) * fps - 1e-6)
        frames = lead_f + audio_f + round(gap * fps) + tail_f
        audio_start = cursor + lead_f
        words = [
            FrameWord(w.text, audio_start + round((w.start - t0) * fps), audio_start + round((w.end - t0) * fps))
            for w in clip.words
        ]
        scenes.append(SceneTiming(clip.audio, cursor, frames, audio_start, words, round(t0 * fps)))
        cursor += frames
    return Timeline(fps, cursor, scenes)
