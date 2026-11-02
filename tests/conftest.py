import copy
import pytest

BASE_STORY = {
    "title": "The Bridge That Fell",
    "cast": [
        {"id": "sam", "name": "Sam", "kind": "adult", "skin": "#f2c9a0",
         "shirt": "#c0392b", "pants": "#2c3e50"},
    ],
    "scenes": [
        {
            "narration": "Seventy-four soldiers knocked down a bridge just by walking.",
            "setting": "town", "time": "day",
            "props": [{"model": "city-kit-suburban/building-type-a", "x": -6, "z": -8}],
            "actors": [{"id": "sam", "x": 0, "z": 0, "action": "walk", "expression": "happy"}],
            "camera": {"shot": "wide", "move": "push"},
            "effect": "none",
        },
        {
            "narration": "Then the deck snapped.",
            "setting": "town", "time": "golden",
            "actors": [{"id": "sam", "action": "fall", "expression": "scared"}],
            "camera": {"shot": "close", "move": "static", "target": "sam"},
            "effect": "shake",
        },
    ],
}


@pytest.fixture
def story_dict():
    return copy.deepcopy(BASE_STORY)
