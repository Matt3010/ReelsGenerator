import pytest
from pydantic import ValidationError

from shorts.pipeline import resolve_beats, sound_events
from shorts.spec import Story
from shorts.timeline import SceneAudio, Word, build_timeline


def beat_story(story_dict, beats):
    story_dict["scenes"][1]["beats"] = beats
    return story_dict


def test_beat_word_must_be_in_narration(story_dict):
    with pytest.raises(ValidationError, match="kaboom"):
        Story.model_validate(beat_story(story_dict, [{"word": "kaboom", "symbol": "exclaim"}]))


def test_beat_actor_must_be_on_stage(story_dict):
    story_dict["cast"].append({"id": "bob", "name": "Bob"})
    with pytest.raises(ValidationError, match="bob"):
        Story.model_validate(beat_story(story_dict, [{"word": "deck", "actor": "bob", "expression": "scared"}]))


def test_valid_beats(story_dict):
    s = Story.model_validate(beat_story(story_dict, [
        {"word": "deck", "actor": "sam", "expression": "surprised", "symbol": "exclaim", "sfx": "pop"},
        {"word": "snapped", "camera": {"shot": "close", "move": "push", "target": "sam", "angle": "dutch"}, "sfx": "crash"},
    ]))
    assert s.scenes[1].beats[1].camera.angle == "dutch"


def timeline(trim=False):
    return build_timeline([
        SceneAudio("a.mp3", 1.0, [Word("Seventy", 0.0, 0.5)]),
        SceneAudio("b.mp3", 1.0, [Word("Then", 0.0, 0.2), Word("the", 0.2, 0.3), Word("deck", 0.3, 0.5), Word("snapped.", 0.5, 0.9)]),
    ], fps=30, lead=0, gap=0, tail=0, trim=trim)


def test_resolve_beats_to_frames_in_order(story_dict):
    s = Story.model_validate(beat_story(story_dict, [{"word": "snapped", "symbol": "exclaim"}, {"word": "deck", "sfx": "pop"}]))
    frames = resolve_beats(s, timeline())
    assert frames[0] == []
    assert frames[1] == [30 + 15, 30 + 9]    # each beat lands on its word, whatever the list order


def test_sound_events_from_beats_effects_and_cuts(story_dict):
    story_dict["scenes"][1]["effect"] = "shake"
    story_dict["scenes"][1]["effect_word"] = "snapped"
    s = Story.model_validate(beat_story(story_dict, [
        {"word": "deck", "sfx": "pop"},
        {"word": "snapped", "camera": {"shot": "close", "target": "sam"}},
    ]))
    tl = timeline()
    ev = sound_events(s, tl, resolve_beats(s, tl), hits=[10, 45])
    names = {(e["sound"], e["frame"]) for e in ev}
    assert ("pop", 39) in names            # explicit beat sfx
    assert ("thud", 45) in names           # the shake effect gets an impact
    assert ("whoosh", 45) in names         # camera cut on a beat gets a whoosh
    assert all(0 < e["volume"] <= 1 for e in ev)
