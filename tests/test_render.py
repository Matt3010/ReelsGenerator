import pytest
from PIL import Image

from shorts.render import ass_captions, audio_graph, crop_box, frame_image, scene_index
from shorts.timeline import SceneAudio, Word, build_timeline

W, H = 768, 1344


def area(b):
    return (b[2] - b[0]) * (b[3] - b[1])


@pytest.mark.parametrize("motion", ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"])
def test_crop_box_stays_inside_the_image_with_9_16_aspect(motion):
    for t in (0, 0.3, 1):
        x0, y0, x1, y1 = crop_box(motion, t, W, H)
        assert 0 <= x0 < x1 <= W and 0 <= y0 < y1 <= H
        assert (x1 - x0) / (y1 - y0) == pytest.approx(9 / 16, rel=1e-3)


def test_zoom_in_narrows_on_the_centre_and_zoom_out_widens():
    a, b = crop_box("zoom_in", 0, W, H), crop_box("zoom_in", 1, W, H)
    assert area(b) < area(a)
    assert (b[0] + b[2]) / 2 == pytest.approx(W / 2) and (b[1] + b[3]) / 2 == pytest.approx(H / 2)
    assert area(crop_box("zoom_out", 1, W, H)) > area(crop_box("zoom_out", 0, W, H))


def test_pans_move_the_view_the_named_way():
    assert crop_box("pan_left", 1, W, H)[0] < crop_box("pan_left", 0, W, H)[0]
    assert crop_box("pan_right", 1, W, H)[0] > crop_box("pan_right", 0, W, H)[0]
    assert crop_box("pan_up", 1, W, H)[1] < crop_box("pan_up", 0, W, H)[1]
    assert crop_box("pan_down", 1, W, H)[1] > crop_box("pan_down", 0, W, H)[1]


def test_motion_eases_in_and_out():
    xs = [crop_box("pan_right", t / 10, W, H)[0] for t in range(11)]
    steps = [b - a for a, b in zip(xs, xs[1:])]
    assert steps[0] < steps[5] and steps[-1] < steps[5]


def test_frame_image_is_full_hd_vertical():
    im = Image.new("RGB", (W, H), (10, 200, 30))
    out = frame_image(im, (0, 0, W, H), (1080, 1920))
    assert out.size == (1080, 1920) and out.getpixel((540, 960)) == (10, 200, 30)


def tl2():
    return build_timeline([SceneAudio("a.mp3", 1.0, [Word("Hello", 0.0, 0.3), Word("world.", 0.3, 0.6)]),
                           SceneAudio("b.mp3", 1.0, [Word("Bye", 0.0, 0.4)])],
                          fps=30, lead=0, gap=0, tail=0, trim=False)


def test_scene_index_follows_the_timeline():
    tl = tl2()
    assert [scene_index(tl, f) for f in (0, 29, 30, 59)] == [0, 0, 1, 1]


def test_ass_captions_highlight_the_spoken_word():
    ass = ass_captions(tl2(), 1080, 1920)
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    lines = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
    assert len(lines) == 3                                   # one per spoken word
    assert lines[0].split(",")[1:3] == ["0:00:00.00", "0:00:00.30"]
    assert "{\\c&H4DE1FF&}HELLO{\\c&HFFFFFF&}" in lines[0] and "WORLD" in lines[0]
    assert "BYE" not in lines[1]                             # the sentence ended: a new caption starts
    assert "{\\c&H4DE1FF&}BYE" in lines[2]


def test_audio_graph_places_voices_and_music():
    tl = build_timeline([SceneAudio("s01.mp3", 1.0, [Word("Hi", 0.2, 0.5)]), SceneAudio("s02.mp3", 1.0, [])],
                        fps=30, lead=0.5, gap=0, tail=0)
    inputs, graph = audio_graph(tl, music="music/x.mp3")
    assert inputs == ["s01.mp3", "s02.mp3", "music/x.mp3"]
    assert "adelay=500:all=1" in graph                       # the first voice starts after the lead-in
    assert "atrim=start=0.133" in graph                      # TTS silence before the first word is cut
    assert "sidechaincompress" in graph and "aloop=loop=-1" in graph
    assert graph.rstrip().endswith("[aout]")


def test_audio_graph_without_music():
    inputs, graph = audio_graph(tl2(), music=None)
    assert inputs == ["a.mp3", "b.mp3"] and "sidechaincompress" not in graph and "[aout]" in graph




def test_captions_are_large_on_a_phone():
    style = next(l for l in ass_captions(tl2()).splitlines() if l.startswith("Style: Cap,"))
    size, outline = int(style.split(",")[2]), int(style.split(",")[16])
    assert size >= 100 and outline >= 10
