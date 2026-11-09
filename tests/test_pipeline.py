import json
from contextlib import contextmanager

import pytest
from PIL import Image

from shorts.library import Library
from shorts.pipeline import Engines, Job, run_job
from shorts.spec import Story
from shorts.timeline import SceneAudio, Word, build_timeline


class FakeTTS:
    def __init__(self):
        self.calls = []

    def __call__(self, text, voice, out_path):
        self.calls.append((text, voice, out_path.name))
        out_path.write_bytes(b"mp3")
        return SceneAudio(out_path.name, 1.0, [Word(w, i * 0.2, i * 0.2 + 0.15) for i, w in enumerate(text.split())])


class FakeGen:
    def __init__(self):
        self.prompts = []

    def __call__(self, prompt, seed, out, style, negative_extra=""):
        self.prompts.append(prompt)
        Image.new("RGB", (8, 14), (len(self.prompts) * 50, 0, 0)).save(out)
        return out


def engines(tmp_path, story_dict, *, llm_calls=None, render=None):
    llm_calls = [] if llm_calls is None else llm_calls

    @contextmanager
    def llm():
        def run(prompt, schema=None, think=False):
            llm_calls.append(prompt)
            if schema is None and not think:
                return "{}"
            return "Facts: the bridge fell in 1831." if think else json.dumps(story_dict)
        yield run

    rendered = {}

    def fake_render(job_dir, tl, images, motions, music, captions, out, log, **kw):
        rendered.update(images=images, motions=motions, music=music, captions=captions, total=tl.total)
        out.write_bytes(b"mp4")

    eng = Engines(llm=llm, generate=FakeGen(), tts=FakeTTS(), library=Library(tmp_path / "lib"),
                  render=render or fake_render, normalize=lambda src, dst: dst.write_bytes(src.read_bytes()),
                  model_name="fake", max_seconds=10,
                  article=lambda item: "The old bridge in Turin reopened on Monday after repairs.")
    return eng, rendered


def test_run_job_writes_story_images_and_video(tmp_path, story_dict):
    eng, rendered = engines(tmp_path, story_dict)
    job = Job.create(tmp_path / "jobs", topic="bridges", voice="en-US-GuyNeural", captions=True)
    run_job(job, eng)

    st = job.status()
    assert st["state"] == "done" and st["title"] == story_dict["title"], st
    assert (job.dir / "video.mp4").exists() and (job.dir / "story.json").exists()
    assert [c[2] for c in eng.tts.calls] == ["s01.mp3", "s02.mp3"]
    assert len(eng.generate.prompts) == 2
    assert [p.parent for p in rendered["images"]] == [eng.library.images_dir] * 2
    assert rendered["motions"] == ["zoom_in", "pan_left"] and rendered["captions"] is True
    assert json.loads((job.dir / "images.json").read_text()) == [1, 2]
    assert (job.dir / "notes.txt").read_text() == "Facts: the bridge fell in 1831."


def test_second_job_reuses_the_library_pictures(tmp_path, story_dict):
    eng, _ = engines(tmp_path, story_dict)
    run_job(Job.create(tmp_path / "jobs", topic="a", voice="v", captions=False), eng)
    run_job(Job.create(tmp_path / "jobs", topic="b", voice="v", captions=False), eng)
    assert len(eng.generate.prompts) == 2                  # nothing new to draw the second time
    assert eng.library.get(1).uses == 2


def test_run_job_reuses_existing_story_without_starting_the_llm(tmp_path, story_dict):
    calls = []
    eng, _ = engines(tmp_path, story_dict, llm_calls=calls)
    job = Job.create(tmp_path / "jobs", topic="x", voice="v", captions=False)
    (job.dir / "story.json").write_text(json.dumps(story_dict))
    run_job(job, eng)
    assert calls == [] and job.status()["state"] == "done"


def test_run_job_records_failure(tmp_path, story_dict):
    def render(*a, **kw):
        raise RuntimeError("ffmpeg exploded")

    eng, _ = engines(tmp_path, story_dict, render=render)
    job = Job.create(tmp_path / "jobs", topic="x", voice="v", captions=False)
    run_job(job, eng)
    st = job.status()
    assert st["state"] == "error" and "ffmpeg exploded" in st["error"]


def test_successful_retry_clears_old_error(tmp_path, story_dict):
    eng, _ = engines(tmp_path, story_dict)
    job = Job.create(tmp_path / "jobs", topic="x", voice="v", captions=False)
    job.update(state="error", error="old failure")
    run_job(job, eng)
    assert job.status()["error"] is None


def test_list_jobs_newest_first(tmp_path):
    a = Job.create(tmp_path, topic="first", voice="v", captions=False)
    b = Job.create(tmp_path, topic="second", voice="v", captions=False)
    ids = [j.id for j in Job.list(tmp_path)]
    assert ids.index(b.id) < ids.index(a.id)


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


NEWS = {"title": "Bridge reopens after storm", "url": "https://bbc.co.uk/a1", "published": "2026-11-09T07:26:09+00:00",
        "outlet": "BBC News", "summary": "The old bridge reopened."}


def test_a_news_job_uses_the_article_and_records_the_source(tmp_path, story_dict):
    calls = []
    eng, rendered = engines(tmp_path, story_dict, llm_calls=calls)
    job = Job.create(tmp_path / "jobs", topic=NEWS["title"], voice="v", captions=True, news=NEWS)
    run_job(job, eng)
    assert job.status()["state"] == "done", job.status()
    assert (job.dir / "article.txt").read_text() == "The old bridge in Turin reopened on Monday after repairs."
    assert "The old bridge in Turin reopened" in calls[0]          # research uses the article
    story = Story.model_validate_json((job.dir / "story.json").read_text())
    assert story.source.outlet == "BBC News" and story.source.url == NEWS["url"]


