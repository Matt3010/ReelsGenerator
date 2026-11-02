import time

from fastapi.testclient import TestClient

from shorts.server import create_app


def wait_for(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def make(tmp_path, **kw):
    ran = []

    def runner(job):
        ran.append(job.id)
        (job.dir / "video.mp4").write_bytes(b"mp4")
        job.update(state="done", title="T")

    app = create_app(tmp_path, runner=kw.get("runner", runner), ideas=kw.get("ideas", lambda: ["A", "B"]))
    return TestClient(app), ran


def test_index_served(tmp_path):
    c, _ = make(tmp_path)
    r = c.get("/")
    assert r.status_code == 200 and "<html" in r.text.lower()


def test_create_job_runs_it_and_lists_it(tmp_path):
    c, ran = make(tmp_path)
    r = c.post("/api/jobs", json={"topic": "bridges", "voice": "en-US-GuyNeural", "captions": True})
    assert r.status_code == 200
    jid = r.json()["id"]
    assert wait_for(lambda: ran == [jid])
    jobs = c.get("/api/jobs").json()
    assert jobs[0]["id"] == jid and jobs[0]["topic"] == "bridges"
    assert wait_for(lambda: c.get("/api/jobs").json()[0]["state"] == "done")
    v = c.get(f"/api/jobs/{jid}/video")
    assert v.status_code == 200 and v.content == b"mp4"


def test_blank_topic_rejected(tmp_path):
    c, _ = make(tmp_path)
    assert c.post("/api/jobs", json={"topic": "  ", "voice": "en-US-GuyNeural", "captions": True}).status_code == 422


def test_unknown_voice_rejected(tmp_path):
    c, _ = make(tmp_path)
    assert c.post("/api/jobs", json={"topic": "x", "voice": "robot", "captions": True}).status_code == 422


def test_unknown_job_is_404(tmp_path):
    c, _ = make(tmp_path)
    assert c.get("/api/jobs/nope/video").status_code == 404
    assert c.get("/api/jobs/..%2F..%2Fsecret/video").status_code == 404


def test_ideas(tmp_path):
    c, _ = make(tmp_path, ideas=lambda: ["The molasses flood", "The dancing plague"])
    assert c.get("/api/ideas").json() == ["The molasses flood", "The dancing plague"]


def test_retry_requeues(tmp_path):
    c, ran = make(tmp_path)
    jid = c.post("/api/jobs", json={"topic": "x", "voice": "en-US-GuyNeural", "captions": False}).json()["id"]
    assert wait_for(lambda: len(ran) == 1)
    assert c.post(f"/api/jobs/{jid}/retry").status_code == 200
    assert wait_for(lambda: len(ran) == 2)


def test_story_endpoint(tmp_path, story_dict):
    import json
    c, ran = make(tmp_path)
    jid = c.post("/api/jobs", json={"topic": "x", "voice": "en-US-GuyNeural", "captions": False}).json()["id"]
    assert c.get(f"/api/jobs/{jid}/story").status_code == 404
    (tmp_path / jid / "story.json").write_text(json.dumps(story_dict))
    assert c.get(f"/api/jobs/{jid}/story").json()["title"] == story_dict["title"]
