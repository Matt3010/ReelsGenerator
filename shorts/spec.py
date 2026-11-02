"""The story.json contract shared by the LLM, the pipeline and the Remotion engine."""
from __future__ import annotations

import re
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

from .catalog import load_catalog

Color = Field(pattern=r"^#[0-9a-fA-F]{6}$")

Setting = Literal[
    "town", "countryside", "city", "forest", "desert", "beach", "snow",
    "harbor", "castle", "lab", "space", "home", "office", "classroom", "tavern",
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
Symbol = Literal["exclaim", "question", "sweat", "anger", "stars", "hearts", "idea", "zzz"]
Sfx = Literal[
    "whoosh", "pop", "ding", "boing", "thud", "punch", "crash", "explosion", "splash", "footsteps", "bell", "click",
    "buzz", "question", "creak", "door", "coins", "laser",
]


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


class Strict(BaseModel):
    model_config = {"extra": "forbid"}


Species = Literal[
    "human", "cat", "cow", "dog", "eagle", "horse", "llama", "pig", "fish", "pug", "sheep", "wolf", "zebra",
    "whale", "shark", "dolphin", "manta",
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
    """one primitive of a custom object; size = [width, height, depth] in metres, pos = centre [x, y, z].
    capsule = a pill (bodies, tanks, logs); torus = a ring (wheels, tyres, hoops) lying flat until tilted"""
    shape: Literal["box", "cylinder", "sphere", "cone", "capsule", "torus"]
    size: tuple[float, float, float]
    pos: tuple[float, float, float] = (0, 0, 0)
    rot_y: float = 0
    rot_x: float = 0  # tilt forward/back, degrees
    rot_z: float = 0  # tilt sideways, degrees (90 lays a cylinder or capsule on its side)
    color: str = Color
    glow: bool = False  # lamp heads, lanterns, fires, signs: lit and casting light at night

    @field_validator("size")
    @classmethod
    def positive(cls, v):
        if any(x <= 0 or x > 60 for x in v):
            raise ValueError("size values must be in (0, 60] metres")
        return v


LIGHT_MAX = 5.0


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
        else:
            # custom objects are only for light sources (lanterns, fires, lit windows): everything else is a model
            if not any(p.glow for p in self.parts):
                raise ValueError("a custom object must be a light source (at least one 'glow' part); use a catalog model")
            if any(max(p.size) > LIGHT_MAX for p in self.parts):
                raise ValueError(f"custom light sources must be small: every part size <= {LIGHT_MAX} m")
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
    angle: Literal["level", "dutch"] = "level"  # dutch = tilted frame, for unease or chaos


class Beat(Strict):
    """something that happens ON a word of the narration: an actor reacts, a symbol pops, the camera cuts, a sound"""
    word: str
    actor: Optional[str] = None
    expression: Optional[Expression] = None
    action: Optional[Action] = None
    symbol: Optional[Symbol] = None
    camera: Optional[Camera] = None
    sfx: Optional[Sfx] = None


class Scene(Strict):
    narration: str = Field(min_length=1, max_length=400)
    setting: Setting
    time: TimeOfDay = "day"
    props: list[Prop] = Field(default_factory=list, max_length=20)
    actors: list[Actor] = Field(default_factory=list, max_length=12)
    camera: Camera = Field(default_factory=Camera)
    effect: Effect = "none"
    effect_word: Optional[str] = None
    beats: list[Beat] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def words_in_narration(self) -> "Scene":
        words = [norm(w) for w in self.narration.split()]
        if self.effect_word is not None and norm(self.effect_word) not in words:
            raise ValueError(f"effect_word '{self.effect_word}' is not a word of the narration")
        for b in self.beats:
            if norm(b.word) not in words:
                raise ValueError(f"beat word '{b.word}' is not a word of the narration")
        return self

    @field_validator("narration")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("narration is blank")
        return v.strip()


class Story(Strict):
    title: str = Field(min_length=1, max_length=100)
    mood: Literal["funny", "upbeat", "mysterious", "sad", "epic"] = "funny"  # picks the background music
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
            on_stage = {a.id for a in scene.actors}
            for b in scene.beats:
                if b.actor is not None and b.actor not in on_stage:
                    raise ValueError(f"scene {n}: beat actor '{b.actor}' is not on stage {sorted(on_stage)}")
                if b.camera and b.camera.target is not None and b.camera.target not in on_stage:
                    raise ValueError(f"scene {n}: beat camera target '{b.camera.target}' is not on stage")
        return self
