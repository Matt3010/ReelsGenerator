import copy
import pytest

BASE_STORY = {
    "title": "The Bridge That Fell",
    "mood": "funny",
    "era": "Manchester, England, 1831",
    "avoid": ["cars", "electric lights"],
    "cast": [
        {"id": "sam", "name": "Sam", "look": "a young soldier in a red 19th-century uniform"},
    ],
    "scenes": [
        {
            "narration": "Seventy-four soldiers knocked down a bridge just by walking.",
            "image": "soldiers marching in step across an old iron suspension bridge over a river",
            "cast": ["sam"],
            "tags": ["soldiers", "bridge", "march", "river", "1831"],
            "motion": "zoom_in",
        },
        {
            "narration": "Then the deck snapped.",
            "image": "a suspension bridge deck breaking apart, soldiers falling into the river, splash",
            "cast": [],
            "tags": ["bridge", "collapse", "river", "splash"],
            "motion": "pan_left",
        },
    ],
}


@pytest.fixture
def story_dict():
    return copy.deepcopy(BASE_STORY)
