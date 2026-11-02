"""Sound-effect library in engine/public/sfx: CC0 Kenney sounds (impact, interface, rpg, sci-fi packs) plus a few
synthesised ones (whoosh, pop, boing, splash). Rebuild: python -m shorts.sfx <folder with the unzipped Kenney packs>"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SFX_DIR = ROOT / "engine" / "public" / "sfx"
SR = 48000

# name -> Kenney file name prefixes (mixed together when more than one)
KENNEY = {
    "ding": ["confirmation_001"], "thud": ["impactSoft_heavy_000"], "punch": ["impactPunch_heavy_000"],
    "crash": ["impactGlass_heavy_000", "impactMetal_heavy_000"], "explosion": ["explosionCrunch_000", "lowFrequency_explosion_000"],
    "bell": ["impactBell_heavy_000"], "click": ["click_001"], "buzz": ["error_004"], "question": ["question_001"],
    "creak": ["creak1"], "door": ["doorOpen_1", "doorOpen_000"], "coins": ["handleCoins"], "laser": ["laserRetro_000"],
}


def _env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def _noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n)


def _lowpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    """one-pole low-pass with a (possibly time-varying) cutoff in Hz"""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def whoosh() -> np.ndarray:
    n = int(0.45 * SR)
    t = np.linspace(0, 1, n)
    sweep = 300 + 3500 * np.sin(np.pi * t) ** 2
    x = _lowpass(_noise(n, 1), sweep) - _lowpass(_noise(n, 1), sweep * 0.25)
    return x * np.sin(np.pi * t) ** 1.5


def pop() -> np.ndarray:
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t * 30) + 250
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.002, 0.03)


def boing() -> np.ndarray:
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = 180 + 120 * np.exp(-t * 4) * (1 + 0.35 * np.sin(2 * np.pi * 14 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.005, 0.25)


def splash() -> np.ndarray:
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    body = _lowpass(_noise(n, 3), 2500 * np.exp(-t * 3) + 400) * _env(n, 0.01, 0.25)
    bubbles = sum(np.sin(2 * np.pi * (500 + 400 * k) * t) * _env(n, 0.001, 0.04) * (t > 0.15 + 0.1 * k) for k in range(4))
    return body + 0.15 * bubbles


def footsteps(src: Path | None) -> np.ndarray:
    steps = sorted(src.rglob("footstep_concrete_00*.ogg"))[:4] if src else []
    out = np.zeros(int(1.3 * SR))
    for i, f in enumerate(steps):
        x = _mono(f)
        at = int(i * 0.3 * SR)
        out[at:at + len(x)] += x[: len(out) - at]
    return out


SYNTH = {"whoosh": whoosh, "pop": pop, "boing": boing, "splash": splash}


def _mono(path: Path) -> np.ndarray:
    x, sr = sf.read(path, always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)
    return x


def _save(name: str, x: np.ndarray) -> None:
    peak = np.max(np.abs(x)) or 1
    sf.write(SFX_DIR / f"{name}.wav", (x / peak * 0.7).astype(np.float32), SR, subtype="PCM_16")


def build(kenney: Path | None) -> list[str]:
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    made = []
    for name, fn in SYNTH.items():
        _save(name, fn())
        made.append(name)
    if kenney:
        _save("footsteps", footsteps(kenney))
        made.append("footsteps")
        for name, prefixes in KENNEY.items():
            parts = []
            for pre in prefixes:
                hit = sorted(kenney.rglob(f"{pre}*.ogg"))
                if hit:
                    parts.append(_mono(hit[0]))
            if parts:
                n = max(len(p) for p in parts)
                _save(name, sum(np.pad(p, (0, n - len(p))) for p in parts))
                made.append(name)
    return made


if __name__ == "__main__":
    print(sorted(build(Path(sys.argv[1]) if len(sys.argv) > 1 else None)))
