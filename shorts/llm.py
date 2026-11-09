"""Story writing with a local model served by llama.cpp (llama-server, OpenAI-compatible, JSON-schema constrained)."""
from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path
from typing import Callable, Optional, Protocol

import httpx
from pydantic import ValidationError

from .library import Asset
from .spec import Story

ROOT = Path(__file__).resolve().parent.parent


class Runner(Protocol):
    def __call__(self, prompt: str, schema: dict | None = None, think: bool = False) -> str: ...


class StoryGenerationError(RuntimeError):
    pass


PROMPT = """You write {seconds}-second vertical story shorts (YouTube Shorts / TikTok): a deadpan English narrator over
a sequence of still cartoon illustrations, one picture per scene, with a slow zoom or pan on each.
Funny, surprising, and TRUE.

TOPIC: {topic}

Research notes (true facts to build on; use ONLY facts from here, never invent numbers):
{notes}

Narration:
- One surprising true story with a visual cause and effect. Only real, well-known facts. No invented dates or numbers.
- {min_words}-{words} words in total, HARD LIMIT {words} (the voice reads ~2.9 words/s). {scenes} scenes, each ONE
  short sentence (4-16 words). Beats: HOOK (the absurd fact) -> setting (year, place) -> escalation -> the snap
  -> twist ending that loops back to the hook. Plain spoken English, no emojis, no stage directions.

Pictures (an image model draws them from your text, so describe only what is VISIBLE):
- "image": one concrete picture in English, 12-40 words: subject, action, place, era, time of day, camera framing
  (wide shot / close-up / low angle). Never ask for text, signs with words, logos or speech bubbles.
- "cast": recurring characters. Give each a "look" (age, clothes, colours, one distinctive detail; 6-25 words) that
  never changes; list in a scene's "cast" only the characters visible in its picture (at most 2 is best), and do NOT
  describe their clothes again in "image". Background people are just described in "image".
- "tags": 3-8 lowercase single words naming the subject, place, era and mood, used to find the picture again later.
- When two scenes show the same thing, write exactly the same "image" text and cast: the picture is reused.
- "motion": zoom_in (tension, reveal), zoom_out (show the scale), pan_left / pan_right (travel, crowds),
  pan_up (tall things, hope), pan_down (falling, gloom). Vary it between scenes.
- "era": the place and year every picture is set in (e.g. "Boston North End, January 1919").
- "avoid": 3-8 things the image model must NOT draw because they would be wrong here: anachronisms (cars, phones,
  plastic, modern clothes...) and wrong materials or colours (e.g. "blue water" for a flood of dark molasses).
- Describe materials, colours and period details explicitly in every "image" (e.g. "thick dark brown molasses").
- "mood" picks the music: funny, upbeat, mysterious, sad, epic.

Reply with ONLY the JSON object.
"""

RETRY = """

Your previous reply was rejected:
{error}

Previous reply:
{reply}

Fix every problem and reply again with ONLY the corrected JSON object."""

CHOOSE = """A short video needs this picture:
"{prompt}"

These pictures already exist in the library:
{listing}

Answer with the id of a picture that shows the same subject, place and era and could be used as it is, or 0 if none
of them really fits (when in doubt, answer 0). Reply with ONLY JSON: {{"id": <number>}}"""

RESEARCH = """You are researching a 30-second story short about: {topic}

Think carefully, then write compact research notes in English:
- 8-12 bullet points of well-established TRUE facts (who, where, when, what happened, how big, the consequences),
  with the exact numbers where they are well known. Leave out anything you are not sure of.
- One bullet "Twist:" with the most surprising or ironic true detail, good for the last line.
- One bullet "Visuals:" with what the place, people, clothes, vehicles and materials looked like at the time.
Reply with only the bullet points."""

NEWS_RULES = """
This short is about a NEWS story. The article below is the ONLY source: every fact must come from it.
- Never depict real people: no names of real people anywhere in "image", "look" or "era". Characters are generic
  figures ("a firefighter", "a minister in a grey suit"); prefer symbolic pictures (a gavel, a map, a crowd, empty
  streets) over people.

ARTICLE:
{article}
"""

PROPER = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b")


def news_problems(story: Story, article: str) -> list[str]:
    """rule breaches of a news short: real names in the pictures"""
    problems = []
    era = story.era.lower()
    names = set()
    for sentence in re.split(r"(?<=[.!?])\s+", article):
        for m in PROPER.finditer(sentence):
            if m.start() == 0 and " " not in m.group():   # a capital at the start of a sentence is just grammar
                continue
            words = m.group().split()
            names.update(" ".join(words[i:]) for i in range(len(words)))   # "Rosa Valli" -> also "Valli"
    texts = [("image", s.image) for s in story.scenes] + [("look", c.look) for c in story.cast]
    for name in sorted(names, key=len, reverse=True):
        if name.lower() in era:
            continue
        for field, text in texts:
            if re.search(rf"\b{re.escape(name)}\b", text):
                problems.append(f'"{name}" appears in a {field}: never name real people, use a generic figure')
                break
    return problems


RESEARCH_ARTICLE = """You are preparing a 30-second news short. Use ONLY this article, nothing you remember.

ARTICLE:
{article}

Write compact research notes in English:
- 6-10 bullet points with the facts of the article (who in general terms, where, when, what happened, numbers).
- One bullet "Visuals:" symbolic pictures that could show this without showing any real person.
Reply with only the bullet points."""


def extract_json(text: str) -> dict:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates = [fenced.group(1)] if fenced else []
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for c in candidates:
        try:
            value = json.loads(c)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("no JSON object found in the reply")


def word_budget(max_seconds: int) -> int:
    """words that fit in max_seconds at ~2.9 words/s, minus ~4 s of lead-in, pauses and tail"""
    return round((max_seconds - 4) * 2.9)


def build_prompt(topic: str, max_seconds: int = 30, notes: str | None = None) -> str:
    words = word_budget(max_seconds)
    scenes = f"{max(3, words // 10)}-{max(4, words // 7)}"
    return PROMPT.format(topic=topic.strip(), seconds=max_seconds, words=words, min_words=round(words * 0.75),
                         scenes=scenes, notes=(notes or "(none: use only facts you are sure of)").strip())


def research_notes(topic: str, run: Runner, source_text: str | None = None) -> str:
    """a free-form, thinking pass that collects the facts before the constrained JSON pass"""
    prompt = (RESEARCH_ARTICLE.format(article=source_text) if source_text
              else RESEARCH.format(topic=topic.strip()))
    text = run(prompt, None, think=True)
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def generate_story(topic: str, run: Runner, attempts: int = 3, max_seconds: int = 30, notes: str | None = None,
                   news_text: str | None = None) -> Story:
    schema = Story.model_json_schema()
    base = build_prompt(topic, max_seconds, notes)
    if news_text:
        base += NEWS_RULES.format(article=news_text)
    limit = word_budget(max_seconds)
    minimum = round(limit * 0.75 * 0.85)
    prompt, last_error = base, "no attempts"
    for _ in range(attempts):
        reply = run(prompt, schema)
        try:
            story = Story.model_validate(extract_json(reply))
            n = sum(len(s.narration.split()) for s in story.scenes)
            if n > limit * 1.08:
                raise ValueError(f"the narration is too long: {n} words, the limit is {limit}. Cut it down.")
            if n < minimum:
                raise ValueError(f"the narration is too short: {n} words, write at least {round(limit * 0.75)} "
                                 f"words in more scenes so the short lasts about {max_seconds} seconds.")
            if news_text:
                problems = news_problems(story, news_text)
                if problems:
                    raise ValueError("; ".join(problems))
            return story
        except (ValueError, ValidationError) as e:
            last_error = str(e)
            prompt = base + RETRY.format(error=last_error[:3000], reply=reply[:12000])
    raise StoryGenerationError(f"story still invalid after {attempts} attempts: {last_error}")


def choose_image(prompt: str, candidates: list[Asset], run: Runner) -> Optional[int]:
    listing = "\n".join(f'{a.id}: "{a.prompt}"' for a in candidates)
    ids = [a.id for a in candidates]
    schema = {"type": "object", "properties": {"id": {"type": "integer", "enum": [0, *ids]}}, "required": ["id"]}
    try:
        pick = extract_json(run(CHOOSE.format(prompt=prompt, listing=listing), schema)).get("id")
    except ValueError:
        return None
    return pick if pick in ids else None


def llama_runner(base_url: str, client: httpx.Client | None = None, temperature: float = 0.7,
                 max_tokens: int = 4096, timeout: float = 900) -> Runner:
    client = client or httpx.Client(timeout=timeout)

    def run(prompt: str, schema: dict | None = None, think: bool = False) -> str:
        body: dict = {"messages": [{"role": "user", "content": prompt}], "temperature": temperature,
                      "max_tokens": max_tokens * (3 if think else 1),
                      "chat_template_kwargs": {"enable_thinking": think}}
        if schema is not None:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "reply", "schema": schema}}
        try:
            r = client.post(f"{base_url}/v1/chat/completions", json=body)
        except httpx.HTTPError as e:
            raise StoryGenerationError(f"llama-server unreachable: {e}") from e
        if r.status_code != 200:
            raise StoryGenerationError(f"llama-server answered {r.status_code}: {r.text[-1500:]}")
        content = r.json()["choices"][0]["message"].get("content") or ""
        return re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip() if think else content

    return run


class LlamaServer:
    """runs llama-server for the duration of a `with` block (the GPU is then free again for the image model)"""

    def __init__(self, exe: str = str(ROOT / "tools" / "llama" / "llama-server.exe"),
                 model: str = str(ROOT / "models" / "Qwen3-8B-Q4_K_M.gguf"), port: int = 8091, ctx: int = 8192,
                 startup_timeout: float = 300, log: Path | None = None,
                 popen: Callable = subprocess.Popen, get: Callable = httpx.get, sleep: Callable = time.sleep):
        self.cmd = [exe, "-m", model, "--host", "127.0.0.1", "--port", str(port), "-c", str(ctx),
                    "-np", "1", "--jinja"]  # no -ngl: llama.cpp fits the layers to the free VRAM (2x faster)
        self.url = f"http://127.0.0.1:{port}"
        self.startup_timeout, self.log = startup_timeout, log
        self.popen, self.get, self.sleep = popen, get, sleep
        self.proc = None

    def __enter__(self) -> str:
        out = self.log.open("ab") if self.log else subprocess.DEVNULL
        self.proc = self.popen(self.cmd, stdout=out, stderr=subprocess.STDOUT,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        deadline = time.monotonic() + self.startup_timeout
        while True:
            if self.proc.poll() is not None:
                raise StoryGenerationError("llama-server exited while loading the model (see the job log)")
            try:
                if self.get(f"{self.url}/health", timeout=5).status_code == 200:
                    return self.url
            except httpx.HTTPError:
                pass
            if time.monotonic() > deadline:
                self.__exit__(None, None, None)
                raise StoryGenerationError("llama-server did not become ready in time")
            self.sleep(1)

    def __exit__(self, *exc) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None
