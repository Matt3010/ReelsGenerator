import json
import struct

import pytest
from pydantic import ValidationError

from shorts.catalog import build_catalog, load_catalog
from shorts.spec import Story


def write_glb(path, height):
    gltf = {"asset": {"version": "2.0"}, "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"type": "VEC3", "min": [0, 0, 0], "max": [1, height, 2]}]}
    js = json.dumps(gltf).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<I", 0x46546C67) + struct.pack("<I", 2) + struct.pack("<I", 12 + 8 + len(js))
    path.write_bytes(body + struct.pack("<I", len(js)) + b"JSON" + js)


def test_build_catalog_scales_by_pack(tmp_path):
    (tmp_path / "nature-kit").mkdir()
    write_glb(tmp_path / "nature-kit" / "tree_oak.glb", 2.0)
    write_glb(tmp_path / "nature-kit" / "ground_grass.glb", 0.1)   # terrain tiles are skipped
    cat = build_catalog(tmp_path, scales={"nature-kit": 3.5})
    assert list(cat) == ["nature-kit/tree_oak"]
    e = cat["nature-kit/tree_oak"]
    assert e["file"] == "models/nature-kit/tree_oak.glb" and e["scale"] == 3.5 and e["h"] == 7.0


def test_real_catalog_is_large():
    cat = load_catalog()
    assert len(cat) > 300 and "pirate-kit/cannon" in cat


def test_prop_model_must_exist(story_dict):
    story_dict["scenes"][0]["props"] = [{"model": "pirate-kit/cannon", "x": 2, "z": -6}]
    assert Story.model_validate(story_dict).scenes[0].props[0].model == "pirate-kit/cannon"
    story_dict["scenes"][0]["props"] = [{"model": "pirate-kit/spaceship", "x": 2, "z": -6}]
    with pytest.raises(ValidationError, match="spaceship"):
        Story.model_validate(story_dict)


def test_prop_needs_model_or_parts(story_dict):
    story_dict["scenes"][0]["props"] = [{"x": 2, "z": -6}]
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_small_city_items_are_not_building_scale(tmp_path):
    (tmp_path / "city-kit-suburban").mkdir()
    write_glb(tmp_path / "city-kit-suburban" / "building-type-a.glb", 0.8)
    write_glb(tmp_path / "city-kit-suburban" / "fence-1x4.glb", 0.27)
    cat = build_catalog(tmp_path, scales={"city-kit-suburban": 9.0})
    assert cat["city-kit-suburban/building-type-a"]["scale"] == 9.0
    assert cat["city-kit-suburban/fence-1x4"]["h"] < 1.3


def test_catalog_has_furniture_at_room_scale():
    cat = load_catalog()
    assert 0.8 < cat["furniture-kit/chair"]["h"] < 1.2
    assert not any(k.startswith("furniture-kit/floor") for k in cat)
