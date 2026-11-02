"""Catalog of the CC0 3D models in engine/public/models: key -> file, scale to metres, real height.
Regenerate after adding a pack: python -m shorts.catalog"""
from __future__ import annotations

import json
import re
import struct
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "engine" / "public" / "models"
CATALOG = ROOT / "engine" / "src" / "world" / "catalog.json"

# metres per model unit, per pack (Kenney kits use different unit sizes)
SCALES = {"city-kit-suburban": 9.0, "nature-kit": 3.5, "pirate-kit": 0.9, "castle-kit": 4.5, "car-kit": 1.0}

# per-model scale overrides (pack scale is set by its main item; small yard items in the city kit are much smaller)
OVERRIDES = [
    (re.compile(r"^city-kit-suburban/(fence|planter)"), 4.0),
    (re.compile(r"^pirate-kit/bottle"), 0.35),
    (re.compile(r"^pirate-kit/tool"), 0.55),
    (re.compile(r"^castle-kit/siege"), 3.0),
    (re.compile(r"^castle-kit/rocks"), 2.5),
]

# modular terrain/building pieces that make no sense as a standalone prop
SKIP = re.compile(r"^(ground|path|cliff|crops_dirt|debris|driveway|patch|platform|wheel|tower-(square|hexagon)-(mid|top|base|roof|arch)|"
                  r"wall-(stud|pillar|half|narrow|to|corner)|stairs|hole|grass|bridge_(side|center)|bed)")


def _height(glb: Path) -> float:
    b = glb.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    lo, hi = 1e9, -1e9
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            acc = j["accessors"][p["attributes"]["POSITION"]]
            lo, hi = min(lo, acc["min"][1]), max(hi, acc["max"][1])
    return max(0.0, hi - lo)


def build_catalog(models: Path = MODELS, scales: dict[str, float] = SCALES) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for pack, scale in scales.items():
        for glb in sorted((models / pack).glob("*.glb")):
            if SKIP.match(glb.stem):
                continue
            key = f"{pack}/{glb.stem}"
            k = next((v for rx, v in OVERRIDES if rx.match(key)), scale)
            out[key] = {"file": f"models/{pack}/{glb.name}", "scale": k, "h": round(_height(glb) * k, 2)}
    return out


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, dict]:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def prompt_listing() -> str:
    """compact list for the LLM: one line per pack, name(height m)"""
    by_pack: dict[str, list[str]] = {}
    for key, e in load_catalog().items():
        pack, name = key.split("/", 1)
        by_pack.setdefault(pack, []).append(f"{name}({e['h']:g})")
    return "\n".join(f"{pack}/: " + " ".join(names) for pack, names in by_pack.items())


if __name__ == "__main__":
    cat = build_catalog()
    CATALOG.write_text(json.dumps(cat, indent=0), encoding="utf-8")
    print(len(cat), "models ->", CATALOG)
