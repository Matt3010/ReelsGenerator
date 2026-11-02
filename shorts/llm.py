"""Ask an LLM (Claude Code on the user's subscription by default) for a story.json."""
from __future__ import annotations

import json
import re
import subprocess
from typing import Callable

from pydantic import ValidationError

from .catalog import prompt_listing
from .spec import Story

Runner = Callable[[str], str]


class StoryGenerationError(RuntimeError):
    pass


PROMPT = """You are the writer and director of a {seconds}-second-max vertical animated story short (YouTube Shorts / TikTok).
Style: flat 2D cartoon characters (bean heads, stick limbs) standing in a colourful low-poly 3D world, gliding cameras,
a single deadpan English narrator. Funny, surprising, and TRUE.

TOPIC: {topic}

Write the narration first, then stage it:
- One surprising true story with a visual cause and effect. Only real, well-known facts. No invented dates or numbers.
- {min_words}-{words} words total. HARD LIMIT {words} words: the voice reads ~2.9 words/s and the short must stay
  under {seconds} s. {scenes} scenes, each ONE short sentence (4-16 words). Every word must earn its place.
- Beats: HOOK (the absurd fact in one line) -> setting (year, place) -> escalation -> the snap/turning point
  -> twist ending that loops back to the hook. Drop any beat that does not fit the word limit.
- Never describe what the viewer already sees. Plain spoken English, no emojis, no stage directions in narration.

Staging rules (the engine renders exactly this, so keep it physically sensible):
- World units are metres. Camera looks toward -z. The frame is VERTICAL (9:16), so keep actors close together:
  x in [-2.5, 2.5], and use depth (z in [-3, 2]) to stagger groups instead of spreading them sideways.
  Props sit behind them: z between -4 and -40, x between -15 and 15, plus a few framing props at the sides
  (x beyond +-5, z between 0 and -5). Dress every scene richly: 8-16 props that tell where and when we are
  (period vehicles, market stalls, crates, signs, trees, statues...), at several depths, never an empty stage
  (the engine also adds background scenery for the setting). A prop is {{"model": "<pack>/<name>", "x", "z",
  "scale" (default 1 = real size), "rot_y" (degrees)}} using ONLY keys from this catalog (height in metres):
{catalog}
- Every actor id must be in "cast". Humans: distinctive colours (hex like "#c0392b");
  nobody wears a hat. Animals (3D, animated): set "species" to one of cat, cow, dog, eagle, horse, llama, pig,
  fish, pug, sheep, wolf, zebra. Other animals are not available: rewrite the staging around them (e.g. show the
  people reacting) rather than substituting a wrong animal.
  Animals appear as themselves, never as humans. For a herd or crowd use ONE actor with "count" (2-30 copies).
  Use as many cast members as the story needs (up to 30); up to 12 actors per scene.
- For "walk"/"run" set to_x to where they end up. Use "close" shots with a camera target for emotional beats,
  "wide"/"aerial" to establish places. Vary shots; never three of the same shot size in a row.
- Indoor stories use an interior setting (home, office, classroom, tavern, lab): the room, its windows and typical
  furniture are built automatically; add the story's own props (furniture-kit models fit rooms).
- Make the characters ACT. Give most scenes 1-3 "beats": moments pinned to an exact narration word where an actor
  changes expression or action, a cartoon symbol pops over a head (exclaim, question, sweat, anger, stars, hearts,
  idea, zzz), the camera cuts to a new shot (close-up on the reaction; "angle": "dutch" when things go wrong),
  and/or a sound effect plays. Reactions land ON the punch word. Prefer reactions that show feeling: a smug grin
  before the disaster, sweat when it starts, shock on the snap, a dazed fall after. Listeners automatically look at
  whoever is talking, so give the explainer the "talk" action.
- Use effects sparingly: at most 3 per short ("shake" for impacts, "explosion", "splash", "confetti", "smoke", "flash").
  Set "effect_word" to the exact narration word the effect (and any "fall"/"shocked" reaction) must land on.
- When the story needs an object that is not in the catalog (a molasses tank, a printing press, a telescope...),
  omit "model" and build it from 2-12 "parts" (box/cylinder/sphere/cone; size = [width, height, depth] in metres,
  pos = part centre relative to the prop's ground point, so a 10 m tall cylinder standing on the ground has pos y = 5).
  Give it a recognisable silhouette and real-world size. Mark light sources (lamp heads, lanterns, fires, lit
  windows, signs) with "glow": true: at night they shine and light the scene, so night scenes need a few of them.
- Keep big objects (taller than 6 m) at z <= -15 and off-centre (|x| >= 6) so they frame the actors instead of
  filling the screen; give big custom objects visible detail (bands, rivets, pipes, ladders as thin parts).

Reply with ONLY one JSON object that validates against this JSON Schema (no markdown, no commentary):
{schema}
"""

RETRY = """

Your previous reply was rejected:
{error}

Previous reply:
{reply}

Fix every problem and reply again with ONLY the corrected JSON object."""


def extract_json(text: str) -> dict:
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


def build_prompt(topic: str, max_seconds: int = 30) -> str:
    schema = json.dumps(Story.model_json_schema(), separators=(",", ":"))
    words = word_budget(max_seconds)
    scenes = f"{max(3, words // 16)}-{max(4, words // 9)}"
    return PROMPT.format(topic=topic.strip(), schema=schema, seconds=max_seconds, words=words, catalog=prompt_listing(),
                         min_words=round(words * 0.75), scenes=scenes)


def generate_story(topic: str, run: Runner | None = None, attempts: int = 3, max_seconds: int = 30) -> Story:
    run = run or claude_code_runner()
    base = build_prompt(topic, max_seconds)
    limit = word_budget(max_seconds)
    prompt = base
    last_error = "no attempts"
    for _ in range(attempts):
        reply = run(prompt)
        try:
            story = Story.model_validate(extract_json(reply))
            n = sum(len(s.narration.split()) for s in story.scenes)
            if n > limit * 1.08:
                raise ValueError(f"the narration is too long: {n} words, the limit is {limit}. Cut it down.")
            return story
        except (ValueError, ValidationError) as e:
            last_error = str(e)
            prompt = base + RETRY.format(error=last_error[:3000], reply=reply[:12000])
    raise StoryGenerationError(f"story still invalid after {attempts} attempts: {last_error}")


def claude_code_runner(model: str | None = None, timeout: int = 600) -> Runner:
    """Runs `claude -p` so the request uses the Claude subscription logged in on this PC (no API key)."""

    def run(prompt: str) -> str:
        cmd = ["claude", "-p", "--output-format", "json", "--tools", "", "--no-session-persistence"]
        if model:
            cmd += ["--model", model]
        proc = subprocess.run(
            cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=timeout, shell=False,
        )
        if proc.returncode != 0:
            raise StoryGenerationError(f"claude exited {proc.returncode}: {proc.stderr[-2000:] or proc.stdout[-2000:]}")
        envelope = json.loads(proc.stdout)
        if envelope.get("is_error"):
            raise StoryGenerationError(f"claude error: {envelope.get('result')}")
        return envelope["result"]

    return run


IDEAS = """Suggest 8 topics for 60-second animated story shorts in English: surprising, TRUE, visual historical or
science events with a clear cause and effect and a funny twist (like "The Great Molasses Flood of 1919" or
"The 1518 dancing plague"). Mix eras and places; avoid tragedies with large death tolls as the main joke.
Reply with ONLY JSON: {"topics": ["...", "..."]}, each topic a short title of at most 10 words."""


def suggest_topics(run: Runner | None = None) -> list[str]:
    run = run or claude_code_runner()
    data = extract_json(run(IDEAS))
    return [t.strip() for t in data.get("topics", []) if isinstance(t, str) and t.strip()]
