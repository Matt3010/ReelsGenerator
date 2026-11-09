import pytest
from pydantic import ValidationError

from shorts.spec import Story, image_prompt, norm


def test_valid_story(story_dict):
    story = Story.model_validate(story_dict)
    assert story.scenes[1].motion == "pan_left"


def test_unknown_scene_cast_is_folded_into_the_picture(story_dict):
    # small models list props ("horse-drawn cart") as characters: keep them as part of the picture instead
    story_dict["scenes"][0]["cast"] = ["sam", "horse-drawn cart"]
    story = Story.model_validate(story_dict)
    assert story.scenes[0].cast == ["sam"]
    assert story.scenes[0].image.endswith("over a river, horse-drawn cart")


def test_unknown_cast_already_in_the_picture_is_not_repeated(story_dict):
    story_dict["scenes"][0]["cast"] = ["river"]
    story = Story.model_validate(story_dict)
    assert story.scenes[0].cast == [] and story.scenes[0].image.endswith("over a river")


def test_unknown_motion_is_rejected(story_dict):
    story_dict["scenes"][1]["motion"] = "spin"
    with pytest.raises(ValidationError):
        Story.model_validate(story_dict)


def test_duplicate_cast_ids_are_rejected(story_dict):
    story_dict["cast"].append(dict(story_dict["cast"][0]))
    with pytest.raises(ValidationError, match="duplicate"):
        Story.model_validate(story_dict)


def test_tags_are_normalised_to_lowercase_unique(story_dict):
    story_dict["scenes"][0]["tags"] = ["Bridge", "bridge ", "River"]
    story = Story.model_validate(story_dict)
    assert story.scenes[0].tags == ["bridge", "river"]


def test_image_prompt_adds_the_look_of_every_character_in_the_scene(story_dict):
    story = Story.model_validate(story_dict)
    p = image_prompt(story, story.scenes[0])
    assert p.startswith("soldiers marching in step")
    assert "a young soldier in a red 19th-century uniform" in p
    assert "red 19th-century" not in image_prompt(story, story.scenes[1])


def test_norm():
    assert norm("Snapped!") == "snapped"


@pytest.mark.parametrize("text", ["same as previous", "Same as the previous scene", "identical to above"])
def test_same_as_previous_reuses_the_previous_picture(story_dict, text):
    story_dict["scenes"][1]["image"] = text
    story = Story.model_validate(story_dict)
    assert story.scenes[1].image == story.scenes[0].image
    assert story.scenes[1].cast == story.scenes[0].cast


def test_same_as_previous_on_the_first_scene_is_rejected(story_dict):
    story_dict["scenes"][0]["image"] = "same as previous"
    with pytest.raises(ValidationError, match="first scene"):
        Story.model_validate(story_dict)


def test_image_prompt_pins_the_era(story_dict):
    story = Story.model_validate(story_dict)
    assert image_prompt(story, story.scenes[1]).endswith("Manchester, England, 1831")


def test_negative_extra_lists_the_anachronisms(story_dict):
    from shorts.spec import negative_extra
    assert negative_extra(Story.model_validate(story_dict)) == "cars, electric lights"


def test_news_pictures_never_show_real_people(story_dict):
    from shorts.spec import negative_extra
    story_dict["source"] = {"outlet": "BBC News", "title": "t", "url": "u", "published": ""}
    neg = negative_extra(Story.model_validate(story_dict))
    assert neg.startswith("cars, electric lights") and "celebrity" in neg and "politician" in neg

