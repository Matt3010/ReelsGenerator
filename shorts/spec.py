"""The story.json contract shared by the LLM, the pipeline and the Remotion engine."""
from __future__ import annotations

import re
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

from .catalog import load_catalog

Color = Field(pattern=r"^#[0-9a-fA-F]{6}$")

Setting = Literal[
    "town", "countryside", "city", "forest", "desert", "beach", "snow",
    "harbor", "castle", "lab", "space",
]
TimeOfDay = Literal["day", "golden", "night"]
Action = Literal[
    "idle", "walk", "run", "talk", "jump", "fall", "point", "cheer", "shocked", "sit",
]
Expression = Literal[
    "neutral", "happy", "sad", "angry", "surprised", "scared", "smug", "thinking",
]
ShotSize = Literal["wide", "medium", "close", "aerial", "low"]
Move = Literal["push", "pull", "orbit", "pan", "static"]
Effect = Literal["none", "shake", "flash", "explosion", "confetti", "smoke", "splash"]


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


class Strict(BaseModel):
    model_config = {"extra": "forbid"}


Species = Literal[
    "human", "cat", "cow", "dog", "eagle", "horse", "llama", "pig", "fish", "pug", "sheep", "wolf", "zebra",
]
OptColor = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class CastMember(Strict):
    """humans (bald bean heads) use skin/shirt/pants; animals use shirt as body colour (optional, a natural default otherwise)"""
    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    name: str
    species: Species = "human"
    kind: Literal["adult", "kid", "elder"] = "adult"
    skin: Optional[str] = OptColor
    shirt: Optional[str] = OptColor
    pants: Optional[str] = OptColor


class Part(Strict):
    """one primitive of a custom object; size = [width, height, depth] in metres, pos = centre [x, y, z]"""
    shape: Literal["box", "cylinder", "sphere", "cone"]
    size: tuple[float, float, float]
    pos: tuple[float, float, float] = (0, 0, 0)
    rot_y: float = 0
    color: str = Color
    glow: bool = False  # lamp heads, lanterns, fires, signs: lit and casting light at night

    @field_validator("size")
    @classmethod
    def positive(cls, v):
        if any(x <= 0 or x > 60 for x in v):
            raise ValueError("size values must be in (0, 60] metres")
        return v


class Prop(Strict):
    """a CC0 catalog model by key (e.g. "pirate-kit/cannon"), or a custom object built from parts"""
    model: Optional[str] = None
    x: float = Field(default=0, ge=-40, le=40)
    z: float = Field(default=-6, ge=-80, le=20)
    scale: float = Field(default=1, gt=0, le=5)
    rot_y: float = 0
    parts: list[Part] = Field(default_factory=list, max_length=24)

    @model_validator(mode="after")
    def model_or_parts(self) -> "Prop":
        if self.model is not None:
            if self.model not in load_catalog():
                raise ValueError(f"unknown model '{self.model}': use a key from the model catalog")
        elif not self.parts:
            raise ValueError("a prop needs a catalog 'model' or 1-24 custom 'parts'")
        return self


class Actor(Strict):
    id: str
    x: float = Field(default=0, ge=-20, le=20)
    z: float = Field(default=0, ge=-30, le=10)
    action: Action = "idle"
    expression: Expression = "neutral"
    to_x: Optional[float] = Field(default=None, ge=-20, le=20)
    count: int = Field(default=1, ge=1, le=30)  # a herd/crowd of identical copies around (x, z)


class Camera(Strict):
    shot: ShotSize = "medium"
    move: Move = "push"
    target: Optional[str] = None


class Scene(Strict):
    narration: str = Field(min_length=1, max_length=400)
    setting: Setting
    time: TimeOfDay = "day"
    props: list[Prop] = Field(default_factory=list, max_length=20)
    actors: list[Actor] = Field(default_factory=list, max_length=12)
    camera: Camera = Field(default_factory=Camera)
    effect: Effect = "none"
    effect_word: Optional[str] = None

    @model_validator(mode="after")
    def effect_word_in_narration(self) -> "Scene":
        if self.effect_word is not None and norm(self.effect_word) not in [norm(w) for w in self.narration.split()]:
            raise ValueError(f"effect_word '{self.effect_word}' is not a word of the narration")
        return self

    @field_validator("narration")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("narration is blank")
        return v.strip()


class Story(Strict):
    title: str = Field(min_length=1, max_length=100)
    cast: list[CastMember] = Field(min_length=1, max_length=30)
    scenes: list[Scene] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def check_references(self) -> "Story":
        ids = [c.id for c in self.cast]
        dupes = {i for i in ids if ids.count(i) > 1}
        if dupes:
            raise ValueError(f"duplicate cast ids: {sorted(dupes)}")
        known = set(ids)
        for n, scene in enumerate(self.scenes, 1):
            for actor in scene.actors:
                if actor.id not in known:
                    raise ValueError(f"scene {n}: actor '{actor.id}' is not in cast {sorted(known)}")
            t = scene.camera.target
            if t is not None and t not in known:
                raise ValueError(f"scene {n}: camera target '{t}' is not in cast {sorted(known)}")
        return self
