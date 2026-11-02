"""Narration with Microsoft Edge neural voices (free, needs internet), with per-word timings."""
from __future__ import annotations

import asyncio
import time
from pathlib import Path

import edge_tts
from mutagen.mp3 import MP3

from .timeline import SceneAudio, Word

VOICES = {
    "en-US-GuyNeural": "Guy (US, deep narrator)",
    "en-US-AndrewNeural": "Andrew (US, warm)",
    "en-US-ChristopherNeural": "Christopher (US, calm)",
    "en-GB-RyanNeural": "Ryan (UK)",
    "en-US-AriaNeural": "Aria (US, female)",
    "en-GB-SoniaNeural": "Sonia (UK, female)",
}


async def _speak(text: str, voice: str, out_path: Path) -> list[Word]:
    words: list[Word] = []
    comm = edge_tts.Communicate(text, voice, rate="+6%", boundary="WordBoundary")
    with out_path.open("wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7
                words.append(Word(chunk["text"], start, start + chunk["duration"] / 1e7))
    return words


def _attach_punctuation(text: str, words: list[Word]) -> list[Word]:
    """Edge drops punctuation from word events; put it back so captions can break on sentence ends."""
    tokens = text.split()
    out, i = [], 0
    for w in words:
        while i < len(tokens) and w.text.lower() not in tokens[i].lower():
            i += 1
        out.append(Word(tokens[i] if i < len(tokens) else w.text, w.start, w.end))
        i += 1
    return out


def _speak_with_retry(text: str, voice: str, out_path: Path, attempts: int = 6) -> list[Word]:
    """the free Edge endpoint randomly answers with no audio; back off and try again"""
    last: Exception | None = None
    for i in range(attempts):
        try:
            return asyncio.run(_speak(text, voice, out_path))
        except (edge_tts.exceptions.NoAudioReceived, edge_tts.exceptions.WebSocketError, OSError) as e:
            last = e
            time.sleep(min(20, 1.5 * 2 ** i))
    raise RuntimeError(f"the voice service failed {attempts} times: {last}")


def synthesize(text: str, voice: str, out_path: Path) -> SceneAudio:
    words = _speak_with_retry(text, voice, out_path)
    duration = MP3(out_path).info.length
    return SceneAudio(out_path.name, duration, _attach_punctuation(text, words))
