import json

import httpx
import pytest

from shorts.library import Asset
from shorts.llm import (LlamaServer, StoryGenerationError, choose_image, extract_json, generate_story, llama_runner,
                        news_problems, research_notes, suggest_topics)


def test_extract_json_from_fenced_block():
    assert extract_json('Sure!\n```json\n{"a": 1}\n```\nbye') == {"a": 1}


def test_extract_json_from_bare_text_after_thinking():
    assert extract_json('<think>{no}</think> here: {"a": {"b": 2}} done') == {"a": {"b": 2}}


def test_extract_json_raises_when_missing():
    with pytest.raises(ValueError):
        extract_json("no json here")


def test_generate_story_sends_topic_and_schema(story_dict):
    calls = []

    def run(prompt, schema=None):
        calls.append((prompt, schema))
        return json.dumps(story_dict)

    story = generate_story("a bridge that fell", run=run, max_seconds=10)
    assert story.title == story_dict["title"]
    prompt, schema = calls[0]
    assert "a bridge that fell" in prompt
    assert "image" in schema["$defs"]["Scene"]["properties"]


def test_generate_story_retries_with_error_feedback(story_dict):
    bad = dict(story_dict, scenes=[dict(story_dict["scenes"][0], motion="spin")])
    replies = iter([json.dumps(bad), json.dumps(story_dict)])
    prompts = []

    def run(prompt, schema=None):
        prompts.append(prompt)
        return next(replies)

    generate_story("x", run=run, max_seconds=10)
    assert len(prompts) == 2 and "spin" in prompts[1]


def test_generate_story_uses_the_research_notes(story_dict):
    prompts = []

    def run(prompt, schema=None):
        prompts.append(prompt)
        return json.dumps(story_dict)

    generate_story("x", run=run, notes="- The tank was 50 feet tall.", max_seconds=10)
    assert "- The tank was 50 feet tall." in prompts[0]


def test_generate_story_rejects_too_short_narration(story_dict):
    with pytest.raises(StoryGenerationError, match="too short"):
        generate_story("x", run=lambda p, schema=None: json.dumps(story_dict), attempts=1, max_seconds=30)


def test_research_notes_think_freely_without_a_schema():
    calls = []

    def run(prompt, schema=None, think=False):
        calls.append((prompt, schema, think))
        return "<think>hmm</think>\n- fact one\n- fact two\n"

    notes = research_notes("The molasses flood", run)
    assert notes == "- fact one\n- fact two"
    prompt, schema, think = calls[0]
    assert "The molasses flood" in prompt and schema is None and think is True


def test_llama_runner_can_think():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "<think>x</think>answer"}}]})

    run = llama_runner("http://h", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert run("q", think=True) == "answer"
    assert seen["body"]["chat_template_kwargs"] == {"enable_thinking": True}
    assert "response_format" not in seen["body"]


def test_generate_story_rejects_too_long_narration(story_dict):
    for s in story_dict["scenes"]:
        s["narration"] = " ".join(["go"] * 90)
    with pytest.raises(StoryGenerationError, match="too long"):
        generate_story("x", run=lambda p, schema=None: json.dumps(story_dict), attempts=2)


def test_llama_runner_posts_a_schema_constrained_chat_without_thinking():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"a": 1}'}}]})

    run = llama_runner("http://127.0.0.1:9", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert run("hello", {"type": "object"}) == '{"a": 1}'
    assert seen["url"] == "http://127.0.0.1:9/v1/chat/completions"
    body = seen["body"]
    assert body["messages"][-1] == {"role": "user", "content": "hello"}
    assert body["response_format"] == {"type": "json_schema", "json_schema": {"name": "reply", "schema": {"type": "object"}}}
    assert body["chat_template_kwargs"] == {"enable_thinking": False}


def test_llama_runner_raises_on_http_error():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(StoryGenerationError, match="boom"):
        llama_runner("http://x", client=client)("hi")


def asset(i):
    return Asset(i, None, f"prompt {i}", ["a"], "toon", 1, "m", 4, 4, 0)


def test_choose_image_returns_the_picked_id():
    def run(prompt, schema=None):
        assert "prompt 7" in prompt and schema["properties"]["id"]["enum"] == [0, 7, 9]
        return '{"id": 9}'

    assert choose_image("a bridge", [asset(7), asset(9)], run) == 9


def test_choose_image_none_when_nothing_fits():
    assert choose_image("a bridge", [asset(7)], lambda p, schema=None: '{"id": 0}') is None


def test_suggest_topics():
    assert suggest_topics(lambda p, schema=None: '{"topics": [" A ", "B", ""]}') == ["A", "B"]


class FakeProc:
    def __init__(self):
        self.terminated = False

    def poll(self):
        return None

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        return 0


def test_llama_server_starts_waits_for_health_and_stops():
    launched = []
    health = iter([httpx.ConnectError("no"), httpx.Response(503), httpx.Response(200)])
    proc = FakeProc()

    def popen(cmd, **kw):
        launched.append(cmd)
        return proc

    def get(url, timeout):
        r = next(health)
        if isinstance(r, Exception):
            raise r
        return r

    srv = LlamaServer(exe="llama-server.exe", model="q.gguf", port=8091, popen=popen, get=get, sleep=lambda s: None)
    with srv as url:
        assert url == "http://127.0.0.1:8091"
        cmd = launched[0]
        assert cmd[0] == "llama-server.exe" and cmd[cmd.index("-m") + 1] == "q.gguf"
        assert cmd[cmd.index("--port") + 1] == "8091" and "--jinja" in cmd
        assert "-ngl" not in cmd                  # llama.cpp fits the layers to free VRAM itself (2x faster)
        assert cmd[cmd.index("-np") + 1] == "1"   # one slot: the whole context for the one request
    assert proc.terminated


ARTICLE = ("Prime Minister Rosa Valli opened the Old Bridge in Turin on Monday. "
           "The bridge had been closed since a flood killed three people. Valli said it was a new start.")


def test_research_notes_from_an_article_use_only_the_article():
    calls = []

    def run(prompt, schema=None, think=False):
        calls.append(prompt)
        return "- fact"

    research_notes("Bridge reopens", run, source_text=ARTICLE)
    assert ARTICLE in calls[0] and "ONLY" in calls[0]


def test_news_problems_flag_real_names_in_pictures(story_dict):
    from shorts.spec import Story
    story_dict["era"] = "Turin, Italy, November 2026"
    story_dict["scenes"][0]["image"] = "Rosa Valli cutting a ribbon on the Old Bridge in Turin"
    story_dict["cast"][0]["look"] = "a woman like Valli in a grey suit"
    problems = news_problems(Story.model_validate(story_dict), ARTICLE)
    assert any("Rosa Valli" in p for p in problems) and any("Valli" in p for p in problems)
    assert not any("Turin" in p for p in problems)          # the place is the era, not a person


def test_generate_story_for_news_retries_until_the_rules_hold(story_dict):
    good = dict(story_dict, era="Turin, Italy, November 2026")
    bad = json.loads(json.dumps(good))
    bad["scenes"][0]["image"] = "Rosa Valli cutting a ribbon on a bridge"
    replies = iter([json.dumps(bad), json.dumps(good)])
    prompts = []

    def run(prompt, schema=None):
        prompts.append(prompt)
        return next(replies)

    story = generate_story("Bridge reopens", run=run, max_seconds=10, notes="- fact", news_text=ARTICLE)
    assert len(prompts) == 2 and "Rosa Valli" in prompts[1]
    assert "real people" in prompts[0]                       # the news rules are in the prompt
