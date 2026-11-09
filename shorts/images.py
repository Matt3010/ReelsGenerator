"""Still images with stable-diffusion.cpp, reused from the library whenever a fitting one is already there."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from .library import Asset, Library
from .spec import Story, image_prompt, negative_extra

ROOT = Path(__file__).resolve().parent.parent

# style name -> (positive prefix, negative prompt); the style is part of the library key
STYLES = {
    "toon": (
        "storybook cartoon illustration, flat colors, bold clean ink outlines, warm vintage palette, "
        "expressive faces, consistent style",
        "photo, realistic, 3d render, painting, text, letters, words, caption, watermark, signature, blurry, "
        "deformed, extra limbs",
    ),
}

Generator = Callable[[str, int, Path, str, str], Path]     # (prompt, seed, out, style, negative_extra) -> image
Chooser = Callable[[str, list[Asset]], Optional[int]]       # (prompt, candidates) -> chosen asset id or None


class ImageGenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SdConfig:
    exe: str = str(ROOT / "tools" / "sd" / "sd-cli.exe")
    model: str = str(ROOT / "models" / "DreamShaperXL_Turbo_v2_1.safetensors")
    vae: str = str(ROOT / "models" / "sdxl.vae.safetensors")
    width: int = 768
    height: int = 1344
    steps: int = 8
    cfg: float = 2.0
    sampler: str = "dpm++2m"
    scheduler: str = "karras"

    @property
    def name(self) -> str:
        return Path(self.model).stem


def sd_command(cfg: SdConfig, prompt: str, seed: int, out: Path, style: str, negative_extra: str = "") -> list[str]:
    positive, negative = STYLES[style]
    if negative_extra:
        negative = f"{negative}, {negative_extra}"
    return [cfg.exe, "-m", cfg.model, "--vae", cfg.vae, "-p", f"{positive}, {prompt}", "-n", negative,
            "-W", str(cfg.width), "-H", str(cfg.height), "--steps", str(cfg.steps), "--cfg-scale", str(cfg.cfg),
            "--sampling-method", cfg.sampler, "--scheduler", cfg.scheduler, "--seed", str(seed), "--vae-tiling",
            "-o", str(out)]


def sd_generator(cfg: SdConfig = SdConfig(), run: Callable = subprocess.run, timeout: int = 900) -> Generator:
    def generate(prompt: str, seed: int, out: Path, style: str, negative_extra: str = "") -> Path:
        out.parent.mkdir(parents=True, exist_ok=True)
        proc = run(sd_command(cfg, prompt, seed, out, style, negative_extra), capture_output=True, text=True, encoding="utf-8",
                   errors="replace", timeout=timeout)
        if proc.returncode != 0 or not out.exists():
            raise ImageGenerationError(f"sd.cpp exited {proc.returncode}: {(proc.stderr or proc.stdout)[-1500:]}")
        return out

    return generate


def plan_images(story: Story, lib: Library, style: str, choose: Chooser | None, min_overlap: float = 0.5
                ) -> list[Optional[int]]:
    """for every scene, the id of a library image to reuse, or None when a new one must be generated"""
    plan: list[Optional[int]] = []
    for scene in story.scenes:
        prompt = image_prompt(story, scene)
        exact = lib.find_exact(prompt, style)
        if exact is not None:
            plan.append(exact.id)
            continue
        found = lib.candidates(scene.tags, style, min_overlap=min_overlap)
        pick = choose(prompt, found) if found and choose else None
        plan.append(pick if pick in {a.id for a in found} else None)
    return plan


def produce_images(story: Story, lib: Library, plan: list[Optional[int]], generate: Generator, style: str, seed: int,
                   model: str, work: Path, progress: Callable[[int, int], None] = lambda i, n: None) -> list[Asset]:
    """generate what the plan leaves open (once per distinct prompt), store it in the library, count every use"""
    work.mkdir(parents=True, exist_ok=True)
    todo = sum(1 for p in plan if p is None)
    assets: list[Asset] = []
    done = 0
    for i, (scene, pick) in enumerate(zip(story.scenes, plan), 1):
        prompt = image_prompt(story, scene)
        asset = lib.get(pick) if pick is not None else lib.find_exact(prompt, style)
        if asset is None:
            done += 1
            progress(done, todo)
            out = generate(prompt, seed, work / f"img{i:02d}.png", style, negative_extra(story))
            asset = lib.add(out, prompt=prompt, tags=scene.tags, style=style, seed=seed, model=model)
        lib.mark_used(asset.id)
        assets.append(lib.get(asset.id))
    return assets
