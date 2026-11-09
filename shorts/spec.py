"""The story.json contract between the local LLM and the pipeline: narration plus one still image per scene."""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Motion = Literal["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]
# small local models write "same as previous" instead of repeating the picture text
SAME_AS_PREVIOUS = re.compile(r"^\s*(same|identical)\b.*\b(previous|above|before|last)\b", re.I)
Mood = Literal["funny", "upbeat", "mysterious", "sad", "epic"]


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


class Strict(BaseModel):
    model_config = {"extra": "forbid"}


class CastMember(Strict):
    """a recurring character; its look is repeated in every image it appears in, so it stays recognisable"""
    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=1, max_length=60)
    look: str = Field(min_length=3, max_length=200)


class Scene(Strict):
    narration: str = Field(min_length=1, max_length=400)
    image: str = Field(min_length=10, max_length=400, description="what the still picture shows, in English")
    cast: list[str] = Field(default_factory=list, max_length=4, description="ids of the characters visible")
    tags: list[str] = Field(min_length=1, max_length=8, description="lowercase keywords to find the picture again")
    motion: Motion = "zoom_in"

    @field_validator("narration", "image")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("blank text")
        return v.strip()

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for t in v:
            t = t.strip().lower()
            if t and t not in out:
                out.append(t)
        if not out:
            raise ValueError("no tags")
        return out


class Source(Strict):
    """the news article a short is based on (set by the pipeline)"""
    outlet: str
    title: str
    url: str
    published: str = ""


class Story(Strict):
    title: str = Field(min_length=1, max_length=100)
    mood: Mood = "funny"  # picks the background music
    era: str = Field(min_length=3, max_length=120, description="place and year every picture is set in")
    avoid: list[str] = Field(default_factory=list, max_length=10,
                             description="things that must NOT appear: anachronisms, wrong materials")
    source: Optional[Source] = None
    cast: list[CastMember] = Field(default_factory=list, max_length=8)
    scenes: list[Scene] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def check_references(self) -> "Story":
        ids = [c.id for c in self.cast]
        dupes = {i for i in ids if ids.count(i) > 1}
        if dupes:
            raise ValueError(f"duplicate cast ids: {sorted(dupes)}")
        for n, scene in enumerate(self.scenes, 1):
            if SAME_AS_PREVIOUS.match(scene.image):
                if n == 1:
                    raise ValueError("the first scene's image must describe a picture, not refer to a previous one")
                prev = self.scenes[n - 2]
                scene.image, scene.cast = prev.image, list(prev.cast)
            # small models list props ("horse-drawn cart") as characters: fold them into the picture instead
            for cid in [c for c in scene.cast if c not in ids]:
                scene.cast.remove(cid)
                if cid.lower() not in scene.image.lower():
                    scene.image = f"{scene.image}, {cid}"
        return self



def image_prompt(story: Story, scene: Scene) -> str:
    looks = {c.id: c.look for c in story.cast}
    return ", ".join([scene.image, *(looks[c] for c in scene.cast), story.era])


NO_REAL_PEOPLE = ["real person", "celebrity", "politician", "famous face", "likeness", "portrait photo"]


def negative_extra(story: Story) -> str:
    parts = [a.strip() for a in story.avoid if a.strip()]
    if story.source is not None:
        parts += NO_REAL_PEOPLE
    return ", ".join(parts)
