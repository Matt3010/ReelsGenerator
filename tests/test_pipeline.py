import json

from shorts.pipeline import Job, hit_frames, run_job
from shorts.spec import Story
from shorts.timeline import SceneAudio, Word, build_timeline


def test_hit_frame_lands_on_effect_word(story_dict):
    story_dict["scenes"][1]["effect_word"] = "snapped"
    story = Story.model_validate(story_dict)
    tl = build_timeline([
        SceneAudio("a.mp3", 1.0, [Word("Seventy", 0.0, 0.5)]),
        SceneAudio("b.mp3", 1.0, [Word("Then", 0.0, 0.2), Word("the", 0.2, 0.3), Word("deck", 0.3, 0.5), Word("snapped.", 0.5, 0.9)]),
    ], fps=30, lead=0, gap=0, tail=0, trim=False)
    hits = hit_frames(story, tl)
    assert hits[1] == 30 + 15


def test_hit_frame_defaults_to_forty_percent_of_speech(story_dict):
    story = Story.model_validate(story_dict)
    tl = build_timeline([
        SceneAudio("a.mp3", 2.0, [Word("a", 0.0, 0.5), Word("b", 1.5, 2.0)]),
        SceneAudio("b.mp3", 1.0, []),
    ], fps=30, lead=0, gap=0, tail=0, trim=False)
    hits = hit_frames(story, tl)
    assert hits[0] == 24          # words span frames 0..60 -> 40 %
    assert hits[1] == 60 + 12     # no words: 40 % of the scene


class FakeTTS:
    def __init__(self):
        self.calls = []

    def __call__(self, text, voice, out_path):
        self.calls.append((text, voice, out_path.name))
        out_path.write_bytes(b"mp3")
        return SceneAudio(out_path.name, 1.0, [Word(w, i * 0.2, i * 0.2 + 0.15) for i, w in enumerate(text.split())])


def test_run_job_writes_story_voice_props_and_video(tmp_path, story_dict):
    tts = FakeTTS()
    rendered = {}

    def render(job_dir, props_path, out_path, log):
        rendered["props"] = json.loads(props_path.read_text())
        out_path.write_bytes(b"mp4")

    job = Job.create(tmp_path, topic="bridges", voice="en-US-GuyNeural", captions=True)
    run_job(job, generate=lambda topic: Story.model_validate(story_dict), tts=tts, render=render)

    st = job.status()
    assert st["state"] == "done" and st["title"] == story_dict["title"]
    assert (job.dir / "video.mp4").exists()
    assert [c[2] for c in tts.calls] == ["s01.mp3", "s02.mp3"]
    p = rendered["props"]
    assert p["captions"] is True and p["story"]["title"] == story_dict["title"]
    assert p["timeline"]["scenes"][0]["audio"] == "s01.mp3"
    assert "effect_frame" in p["timeline"]["scenes"][1]


def test_run_job_records_failure(tmp_path):
    job = Job.create(tmp_path, topic="x", voice="v", captions=False)

    def boom(topic):
        raise RuntimeError("model unavailable")

    run_job(job, generate=boom, tts=FakeTTS(), render=lambda *a: None)
    st = job.status()
    assert st["state"] == "error" and "model unavailable" in st["error"]


def test_run_job_reuses_existing_story(tmp_path, story_dict):
    job = Job.create(tmp_path, topic="x", voice="v", captions=False)
    (job.dir / "story.json").write_text(json.dumps(story_dict))
    called = []
    run_job(job, generate=lambda t: called.append(t), tts=FakeTTS(), render=lambda j, p, o, log: o.write_bytes(b"x"))
    assert called == [] and job.status()["state"] == "done"


def test_list_jobs_newest_first(tmp_path):
    a = Job.create(tmp_path, topic="first", voice="v", captions=False)
    b = Job.create(tmp_path, topic="second", voice="v", captions=False)
    ids = [j.id for j in Job.list(tmp_path)]
    assert ids.index(b.id) < ids.index(a.id)


def test_successful_retry_clears_old_error(tmp_path, story_dict):
    job = Job.create(tmp_path, topic="x", voice="v", captions=False)
    job.update(state="error", error="old failure")
    (job.dir / "story.json").write_text(json.dumps(story_dict))
    run_job(job, generate=lambda t: None, tts=FakeTTS(), render=lambda j, p, o, log: o.write_bytes(b"x"))
    assert job.status()["error"] is None


def test_job_folder_sees_the_models(tmp_path, story_dict):
    from shorts.pipeline import MODELS_DIR
    job = Job.create(tmp_path, topic="x", voice="v", captions=False)
    (job.dir / "story.json").write_text(json.dumps(story_dict))
    run_job(job, generate=lambda t: None, tts=FakeTTS(), render=lambda j, p, o, log: o.write_bytes(b"x"))
    copy = job.dir / "models" / "animals" / "cow.glb"
    assert copy.exists() and not (job.dir / "models").is_symlink()
    assert copy.stat().st_size == (MODELS_DIR / "animals" / "cow.glb").stat().st_size


def test_cleanup_removes_remotion_bundles(tmp_path):
    from shorts.pipeline import cleanup_remotion_tmp
    (tmp_path / "remotion-webpack-bundle-abc" / "public").mkdir(parents=True)
    (tmp_path / "puppeteer_dev_chrome_profile-x").mkdir()
    (tmp_path / "keep-me").mkdir()
    cleanup_remotion_tmp(tmp_path)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["keep-me"]


def test_render_props_carry_beats_and_sounds(tmp_path, story_dict):
    story_dict["scenes"][1]["beats"] = [{"word": "deck", "actor": "sam", "symbol": "exclaim"}]
    rendered = {}

    def render(job_dir, props_path, out_path, log):
        rendered.update(json.loads(props_path.read_text()))
        out_path.write_bytes(b"x")

    job = Job.create(tmp_path, topic="x", voice="v", captions=False)
    (job.dir / "story.json").write_text(json.dumps(story_dict))
    run_job(job, generate=lambda t: None, tts=FakeTTS(), render=render)
    beat = rendered["timeline"]["scenes"][1]["beats"][0]
    assert beat["symbol"] == "exclaim" and isinstance(beat["frame"], int)
    assert {"sound": "pop", "frame": beat["frame"], "volume": 0.6} in rendered["sfx"]
    assert (job.dir / "sfx" / "pop.wav").exists()


def test_sfx_library_covers_every_sound():
    from typing import get_args
    from shorts.spec import Sfx
    from shorts.sfx import SFX_DIR
    missing = [s for s in get_args(Sfx) if not (SFX_DIR / f"{s}.wav").exists()]
    assert missing == []


def _loudness(path):
    import re
    import subprocess
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])


def test_normalize_audio_reaches_short_loudness(tmp_path):
    import subprocess
    from shorts.pipeline import normalize_audio
    src, dst = tmp_path / "raw.mp4", tmp_path / "out.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=4", "-f", "lavfi",
                    "-i", "sine=frequency=440:duration=4", "-af", "volume=0.05", "-shortest", "-c:v", "libx264",
                    "-c:a", "aac", str(src)], check=True)
    assert _loudness(src) < -25
    normalize_audio(src, dst)
    assert abs(_loudness(dst) + 14) < 1.5


def test_pick_music_follows_the_mood(tmp_path):
    from shorts.pipeline import pick_music
    for mood, names in {"funny": ["a.mp3", "b.mp3"], "sad": ["c.mp3"]}.items():
        (tmp_path / mood).mkdir()
        for n in names:
            (tmp_path / mood / n).write_bytes(b"x")
    assert pick_music("sad", "topic", tmp_path).name == "c.mp3"
    assert pick_music("funny", "t1", tmp_path) == pick_music("funny", "t1", tmp_path)   # same topic, same track
    assert {pick_music("funny", f"t{i}", tmp_path).name for i in range(20)} == {"a.mp3", "b.mp3"}
    assert pick_music("epic", "topic", tmp_path).parent.name in {"funny", "sad"}        # no epic tracks: any track
    assert pick_music("funny", "topic", tmp_path / "missing") is None
