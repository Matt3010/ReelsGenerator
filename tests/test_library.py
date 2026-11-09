import sqlite3

import pytest
from PIL import Image

from shorts.library import Library


def png(path, color=(200, 30, 30), size=(8, 14)):
    Image.new("RGB", size, color).save(path)
    return path


@pytest.fixture
def lib(tmp_path):
    return Library(tmp_path / "library")


def test_migrations_create_the_schema(lib):
    tables = {r[0] for r in sqlite3.connect(lib.db_path).execute("select name from sqlite_master where type='table'")}
    assert {"assets", "asset_tags", "alembic_version"} <= tables


def test_add_copies_the_image_and_records_it(lib, tmp_path):
    a = lib.add(png(tmp_path / "x.png"), prompt="a red barn", tags=["barn", "farm"], style="toon", seed=7, model="dsxl")
    assert a.path.exists() and a.path.parent == lib.images_dir
    assert (a.width, a.height) == (8, 14)
    assert a.tags == ["barn", "farm"]
    assert a.seed == 7 and a.model == "dsxl" and a.uses == 0


def test_same_pixels_are_stored_once(lib, tmp_path):
    a = lib.add(png(tmp_path / "x.png"), prompt="a red barn", tags=["barn"], style="toon", seed=1, model="m")
    b = lib.add(png(tmp_path / "y.png"), prompt="a red barn", tags=["barn"], style="toon", seed=1, model="m")
    assert a.id == b.id
    assert len(list(lib.images_dir.iterdir())) == 1


def test_find_exact_ignores_case_and_spaces_but_not_style(lib, tmp_path):
    lib.add(png(tmp_path / "x.png"), prompt="A red  barn", tags=["barn"], style="toon", seed=1, model="m")
    assert lib.find_exact("a red barn", style="toon") is not None
    assert lib.find_exact("a red barn", style="photo") is None
    assert lib.find_exact("a blue barn", style="toon") is None


def test_candidates_rank_by_tag_overlap(lib, tmp_path):
    barn = lib.add(png(tmp_path / "1.png", (1, 1, 1)), prompt="barn", tags=["barn", "farm", "day"], style="toon", seed=1, model="m")
    farm = lib.add(png(tmp_path / "2.png", (2, 2, 2)), prompt="farm", tags=["farm", "cows", "field", "day"], style="toon", seed=1, model="m")
    lib.add(png(tmp_path / "3.png", (3, 3, 3)), prompt="ship", tags=["ship", "sea"], style="toon", seed=1, model="m")
    lib.add(png(tmp_path / "4.png", (4, 4, 4)), prompt="barn", tags=["barn", "farm", "day"], style="photo", seed=1, model="m")
    found = lib.candidates(["barn", "farm", "day"], style="toon", min_overlap=0.4)
    assert [a.id for a in found] == [barn.id, farm.id]


def test_mark_used_counts_reuses(lib, tmp_path):
    a = lib.add(png(tmp_path / "x.png"), prompt="barn", tags=["barn"], style="toon", seed=1, model="m")
    lib.mark_used(a.id)
    lib.mark_used(a.id)
    assert lib.get(a.id).uses == 2


def test_reopening_keeps_the_data(tmp_path):
    a = Library(tmp_path / "lib").add(png(tmp_path / "x.png"), prompt="barn", tags=["barn"], style="toon", seed=1, model="m")
    assert Library(tmp_path / "lib").get(a.id).prompt == "barn"
