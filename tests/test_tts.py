import pytest

from shorts import tts
from shorts.timeline import Word


def test_attach_punctuation_restores_sentence_marks():
    words = [Word("Then", 0, 0.2), Word("it", 0.2, 0.3), Word("snapped", 0.3, 0.6)]
    out = tts._attach_punctuation("Then it snapped.", words)
    assert [w.text for w in out] == ["Then", "it", "snapped."]


def test_speak_retries_flaky_service(tmp_path, monkeypatch):
    calls = []

    async def flaky(text, voice, out_path):
        calls.append(1)
        if len(calls) < 3:
            raise tts.edge_tts.exceptions.NoAudioReceived("no audio")
        return [Word("hi", 0, 0.5)]

    monkeypatch.setattr(tts, "_speak", flaky)
    monkeypatch.setattr(tts.time, "sleep", lambda s: None)
    assert tts._speak_with_retry("hi", "v", tmp_path / "a.mp3")[0].text == "hi"
    assert len(calls) == 3


def test_speak_gives_up(tmp_path, monkeypatch):
    async def dead(text, voice, out_path):
        raise tts.edge_tts.exceptions.NoAudioReceived("no audio")

    monkeypatch.setattr(tts, "_speak", dead)
    monkeypatch.setattr(tts.time, "sleep", lambda s: None)
    with pytest.raises(RuntimeError, match="voice"):
        tts._speak_with_retry("hi", "v", tmp_path / "a.mp3", attempts=4)
