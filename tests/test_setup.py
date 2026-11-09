from shorts.setup import ITEMS, Item, missing

FAKE = [Item("tool", "tools/x/x.exe", ("u",), "tools/x"), Item("model", "models/m.bin", ("u",), size=100)]


def test_everything_missing_in_an_empty_folder(tmp_path):
    assert [i.name for i in missing(tmp_path)] == [i.name for i in ITEMS]


def test_present_files_are_not_downloaded_again(tmp_path):
    (tmp_path / "tools/x").mkdir(parents=True)
    (tmp_path / "tools/x/x.exe").write_bytes(b"exe")
    (tmp_path / "models").mkdir()
    (tmp_path / "models/m.bin").write_bytes(b"x" * 100)
    assert missing(tmp_path, FAKE) == []


def test_a_truncated_model_counts_as_missing(tmp_path):
    (tmp_path / "models").mkdir()
    (tmp_path / "models/m.bin").write_bytes(b"x" * 10)
    assert [i.name for i in missing(tmp_path, FAKE)] == ["tool", "model"]
