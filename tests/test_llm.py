import json

import pytest

from shorts.llm import StoryGenerationError, extract_json, generate_story


def test_extract_json_from_fenced_block():
    assert extract_json('Sure!\n```json\n{"a": 1}\n```\nbye') == {"a": 1}


def test_extract_json_from_bare_text():
    assert extract_json('here: {"a": {"b": 2}} done') == {"a": {"b": 2}}


def test_extract_json_raises_when_missing():
    with pytest.raises(ValueError):
        extract_json("no json here")


def test_generate_story_returns_valid_story(story_dict):
    prompts = []

    def run(prompt):
        prompts.append(prompt)
        return json.dumps(story_dict)

    story = generate_story("a bridge that fell", run=run)
    assert story.title == story_dict["title"]
    assert "a bridge that fell" in prompts[0]
    assert '"setting"' in prompts[0]           # the schema is in the prompt


def test_generate_story_retries_with_error_feedback(story_dict):
    bad = dict(story_dict, scenes=[dict(story_dict["scenes"][0], setting="moon")])
    replies = iter([json.dumps(bad), json.dumps(story_dict)])
    prompts = []

    def run(prompt):
        prompts.append(prompt)
        return next(replies)

    story = generate_story("x", run=run)
    assert story.title == story_dict["title"]
    assert len(prompts) == 2 and "moon" in prompts[1]


def test_generate_story_gives_up_after_attempts():
    with pytest.raises(StoryGenerationError):
        generate_story("x", run=lambda p: "nope", attempts=2)


def test_suggest_topics_parses_list():
    from shorts.llm import suggest_topics
    topics = suggest_topics(run=lambda p: 'Here: {"topics": ["The molasses flood", " ", "The dancing plague"]}')
    assert topics == ["The molasses flood", "The dancing plague"]


def test_prompt_states_word_budget_for_duration():
    from shorts.llm import build_prompt, word_budget
    assert word_budget(30) == 75
    assert "75 words" in build_prompt("x", max_seconds=30)


def test_too_long_story_is_retried(story_dict):
    long = json.loads(json.dumps(story_dict))
    long["scenes"][0]["narration"] = " ".join(["go"] * 100)
    replies = iter([json.dumps(long), json.dumps(story_dict)])
    prompts = []

    def run(p):
        prompts.append(p)
        return next(replies)

    story = generate_story("x", run=run, max_seconds=30)
    assert story.title == story_dict["title"]
    assert len(prompts) == 2 and "too long" in prompts[1]
