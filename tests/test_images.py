import subprocess

import pytest
from PIL import Image

from shorts.images import STYLES, ImageGenerationError, SdConfig, plan_images, sd_command, sd_generator
from shorts.library import Library
from shorts.spec import Story


CFG = SdConfig(exe="sd-cli.exe", model="m.safetensors", vae="v.safetensors")


def test_sd_command_has_style_size_seed_and_output(tmp_path):
    cmd = sd_command(CFG, "a red barn", seed=42, out=tmp_path / "o.png", style="toon", negative_extra="tractors")
    assert cmd[0] == "sd-cli.exe"
    p = cmd[cmd.index("-p") + 1]
    assert p.startswith(STYLES["toon"][0]) and p.endswith("a red barn")
    assert cmd[cmd.index("-n") + 1] == STYLES["toon"][1] + ", tractors"
    assert cmd[cmd.index("--steps") + 1] == "8"
    assert cmd[cmd.index("-W") + 1] == "768" and cmd[cmd.index("-H") + 1] == "1344"
    assert cmd[cmd.index("--seed") + 1] == "42"
    assert cmd[cmd.index("-o") + 1] == str(tmp_path / "o.png")
    assert "--vae" in cmd and "--vae-tiling" in cmd


def test_generator_runs_sd_and_returns_the_image(tmp_path):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        Image.new("RGB", (4, 4)).save(cmd[cmd.index("-o") + 1])
        return subprocess.CompletedProcess(cmd, 0, "", "")

    gen = sd_generator(CFG, run=fake_run)
    out = gen("a barn", 3, tmp_path / "a.png", "toon", "")
    assert out == tmp_path / "a.png" and out.exists()
    assert len(calls) == 1


def test_generator_raises_when_sd_fails(tmp_path):
    gen = sd_generator(CFG, run=lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, "", "CUDA out of memory"))
    with pytest.raises(ImageGenerationError, match="out of memory"):
        gen("a barn", 3, tmp_path / "a.png", "toon", "")


class FakeGen:
    def __init__(self):
        self.prompts = []

    def __call__(self, prompt, seed, out, style, negative_extra):
        self.prompts.append(prompt)
        self.negatives = getattr(self, "negatives", []) + [negative_extra]
        Image.new("RGB", (4, 4), (len(self.prompts) * 40, 0, 0)).save(out)
        return out


def test_plan_reuses_exact_prompts_and_chosen_candidates(tmp_path, story_dict):
    story_dict["scenes"].append(dict(story_dict["scenes"][0], narration="And again."))  # same picture as scene 1
    story = Story.model_validate(story_dict)
    lib = Library(tmp_path / "lib")
    Image.new("RGB", (4, 4), (9, 9, 9)).save(tmp_path / "old.png")
    old = lib.add(tmp_path / "old.png", prompt="an old bridge falling down", tags=["bridge", "collapse", "river", "splash"],
                  style="toon", seed=1, model="m")
    asked = []

    def choose(prompt, candidates):
        asked.append((prompt, [c.id for c in candidates]))
        return candidates[0].id

    plan = plan_images(story, lib, style="toon", choose=choose)
    assert plan[0] is None                         # nothing similar: must be generated
    assert plan[1] == old.id                       # the model picked the library image
    assert plan[2] is None and asked[0][1] == [old.id]
    assert len(asked) == 1                         # scenes 1 and 3 had no candidates


def test_plan_generates_when_the_model_rejects_candidates(tmp_path, story_dict):
    story = Story.model_validate(story_dict)
    lib = Library(tmp_path / "lib")
    Image.new("RGB", (4, 4)).save(tmp_path / "old.png")
    lib.add(tmp_path / "old.png", prompt="x", tags=["bridge", "collapse", "river", "splash"], style="toon", seed=1, model="m")
    assert plan_images(story, lib, style="toon", choose=lambda p, c: None) == [None, None]


def test_plan_reuses_an_identical_prompt_without_asking(tmp_path, story_dict):
    from shorts.spec import image_prompt
    story = Story.model_validate(story_dict)
    lib = Library(tmp_path / "lib")
    Image.new("RGB", (4, 4)).save(tmp_path / "old.png")
    a = lib.add(tmp_path / "old.png", prompt=image_prompt(story, story.scenes[0]), tags=["x"], style="toon", seed=1, model="m")
    plan = plan_images(story, lib, style="toon", choose=lambda p, c: pytest.fail("should not ask"))
    assert plan[0] == a.id


def test_produce_images_generates_once_per_distinct_prompt_and_stores_them(tmp_path, story_dict):
    from shorts.images import produce_images
    story_dict["scenes"].append(dict(story_dict["scenes"][0], narration="And again."))
    story = Story.model_validate(story_dict)
    lib = Library(tmp_path / "lib")
    gen = FakeGen()
    assets = produce_images(story, lib, [None, None, None], generate=gen, style="toon", seed=5, model="dsxl",
                            work=tmp_path / "w")
    assert len(gen.prompts) == 2
    assert assets[0].id == assets[2].id
    assert assets[1].tags == ["bridge", "collapse", "river", "splash"]
    assert lib.get(assets[0].id).uses == 2


def test_produce_images_passes_the_anachronisms_as_negative(tmp_path, story_dict):
    from shorts.images import produce_images
    story = Story.model_validate(story_dict)
    gen = FakeGen()
    produce_images(story, Library(tmp_path / "lib"), [None, None], generate=gen, style="toon", seed=5, model="m",
                   work=tmp_path / "w")
    assert gen.negatives == ["cars, electric lights"] * 2
