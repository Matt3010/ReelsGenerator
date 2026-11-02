import pytest
from pydantic import ValidationError

from shorts.spec import Story


def test_valid_story_parses_with_defaults(story_dict):
    story = Story.model_validate(story_dict)
    assert story.scenes[1].actors[0].x == 0
    assert story.scenes[0].props[0].scale == 1
    assert story.scenes[1].props == []


def test_actor_must_be_in_cast(story_dict):
    story_dict["scenes"][0]["actors"][0]["id"] = "ghost"
    with pytest.raises(ValidationError, match="ghost"):
        Story.model_validate(story_dict)


def test_camera_target_must_be_in_cast(story_dict):
    story_dict["scenes"][1]["camera"]["target"] = "nobody"
    with pytest.raises(ValidationError, match="nobody"):
        Story.model_validate(story_dict)


def test_unknown_setting_rejected(story_dict):
    story_dict["scenes"][0]["setting"] = "mars-base-9"
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_bad_color_rejected(story_dict):
    story_dict["cast"][0]["shirt"] = "red"
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_duplicate_cast_ids_rejected(story_dict):
    story_dict["cast"].append(dict(story_dict["cast"][0]))
    with pytest.raises(ValidationError, match="duplicate"):
        Story.model_validate(story_dict)


def test_empty_narration_rejected(story_dict):
    story_dict["scenes"][0]["narration"] = "  "
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_json_schema_lists_settings():
    schema = Story.model_json_schema()
    text = str(schema)
    assert "countryside" in text and "walk" in text


def test_effect_word_must_be_in_narration(story_dict):
    story_dict["scenes"][1]["effect_word"] = "exploded"
    with pytest.raises(ValidationError, match="exploded"):
        Story.model_validate(story_dict)


def test_effect_word_matches_ignoring_case_and_punctuation(story_dict):
    story_dict["scenes"][1]["effect_word"] = "SNAPPED"
    assert Story.model_validate(story_dict).scenes[1].effect_word == "SNAPPED"


LAMP = [
    {"shape": "cylinder", "size": [0.15, 3.5, 0.15], "pos": [0, 1.75, 0], "color": "#333333"},
    {"shape": "sphere", "size": [0.5, 0.5, 0.5], "pos": [0, 3.7, 0], "color": "#ffd27a", "glow": True},
]


def test_custom_object_is_a_light_source(story_dict):
    story_dict["scenes"][0]["props"].append({"x": 3, "z": -8, "parts": LAMP})
    story = Story.model_validate(story_dict)
    assert [p.shape for p in story.scenes[0].props[-1].parts] == ["cylinder", "sphere"]


def test_custom_object_without_light_rejected(story_dict):
    story_dict["scenes"][0]["props"].append({
        "x": 3, "z": -8,
        "parts": [{"shape": "cylinder", "size": [6, 10, 6], "pos": [0, 5, 0], "color": "#6b3d1f"}],
    })
    with pytest.raises(ValidationError, match="light"):
        Story.model_validate(story_dict)


def test_custom_light_must_be_small(story_dict):
    story_dict["scenes"][0]["props"].append({
        "x": 3, "z": -8,
        "parts": LAMP + [{"shape": "box", "size": [8, 2, 1], "pos": [0, 1, 0], "color": "#6b3d1f"}],
    })
    with pytest.raises(ValidationError, match="small"):
        Story.model_validate(story_dict)


def test_custom_object_needs_parts(story_dict):
    story_dict["scenes"][0]["props"].append({"x": 3, "z": -8, "parts": []})
    with pytest.raises(ValidationError, match="parts"):
        Story.model_validate(story_dict)


def test_animal_cast_needs_only_species(story_dict):
    story_dict["cast"].append({"id": "zebra", "name": "Zebra", "species": "zebra"})
    story_dict["scenes"][0]["actors"].append({"id": "zebra", "x": 2})
    story = Story.model_validate(story_dict)
    assert story.cast[1].species == "zebra" and story.cast[1].skin is None
    assert story.cast[0].species == "human"


def test_unknown_species_rejected(story_dict):
    story_dict["cast"].append({"id": "dragon", "name": "D", "species": "dragon"})
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_herd_count(story_dict):
    story_dict["scenes"][0]["actors"][0]["count"] = 9
    assert Story.model_validate(story_dict).scenes[0].actors[0].count == 9
    story_dict["scenes"][0]["actors"][0]["count"] = 40
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_large_cast_allowed(story_dict):
    for i in range(25):
        story_dict["cast"].append({"id": f"p{i}", "name": f"P{i}"})
    story_dict["scenes"][0]["actors"] = [{"id": f"p{i}", "x": i % 10 - 5} for i in range(12)]
    story_dict["scenes"][0]["actors"][0]["count"] = 30
    story = Story.model_validate(story_dict)
    assert len(story.cast) == 26 and len(story.scenes[0].actors) == 12


def test_custom_parts_can_glow(story_dict):
    story_dict["scenes"][0]["props"].append({
        "x": 3, "z": -8,
        "parts": [{"shape": "sphere", "size": [0.4, 0.4, 0.4], "pos": [0, 3, 0], "color": "#ffd27a", "glow": True}],
    })
    assert Story.model_validate(story_dict).scenes[0].props[-1].parts[0].glow is True


@pytest.mark.parametrize("setting", ["home", "office", "classroom", "tavern"])
def test_interior_settings(story_dict, setting):
    story_dict["scenes"][0]["setting"] = setting
    assert Story.model_validate(story_dict).scenes[0].setting == setting


def test_custom_parts_have_organic_shapes_and_tilt(story_dict):
    story_dict["scenes"][0]["props"].append({
        "x": 6, "z": -16,
        "parts": [
            {"shape": "capsule", "size": [0.4, 1, 0.4], "pos": [0, 0.3, 0], "rot_z": 90, "color": "#6b3d1f"},
            {"shape": "torus", "size": [1, 1, 0.2], "pos": [0, 1, 0], "rot_x": 90, "color": "#ff9a3c", "glow": True},
        ],
    })
    parts = Story.model_validate(story_dict).scenes[0].props[-1].parts
    assert [p.shape for p in parts] == ["capsule", "torus"]
    assert (parts[0].rot_z, parts[1].rot_x) == (90, 90)


@pytest.mark.parametrize("species", ["whale", "shark", "dolphin", "manta"])
def test_sea_animals(story_dict, species):
    story_dict["cast"].append({"id": "sea", "name": "Sea", "species": species})
    assert Story.model_validate(story_dict).cast[-1].species == species


def test_story_mood(story_dict):
    assert Story.model_validate(story_dict).mood == "funny"
    story_dict["mood"] = "mysterious"
    assert Story.model_validate(story_dict).mood == "mysterious"
    story_dict["mood"] = "angry"
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)
