from shorts.timeline import SceneAudio, Word, build_timeline


def test_scenes_are_laid_out_back_to_back_with_gap():
    tl = build_timeline(
        [SceneAudio("a.mp3", 2.0, [Word("Hi", 0.1, 0.4)]), SceneAudio("b.mp3", 1.0, [])],
        fps=30, lead=0.5, gap=0.2, tail=1.0, trim=False,
    )
    s1, s2 = tl.scenes
    assert s1.start == 0
    assert s1.audio_start == 15            # lead 0.5 s
    assert s1.frames == 15 + 60 + 6        # lead + audio + gap
    assert s2.start == s1.frames
    assert s2.audio_start == s2.start      # no lead after the first scene
    assert s2.frames == 30 + 6 + 30        # audio + gap + tail
    assert tl.total == s1.frames + s2.frames


def test_words_are_absolute_frames():
    tl = build_timeline(
        [SceneAudio("a.mp3", 1.0, []), SceneAudio("b.mp3", 1.0, [Word("Boom", 0.5, 0.9)])],
        fps=30, lead=0.0, gap=0.0, tail=0.0, trim=False,
    )
    w = tl.scenes[1].words[0]
    assert (w.text, w.start, w.end) == ("Boom", 30 + 15, 30 + 27)


def test_frames_round_up_so_audio_is_never_cut():
    tl = build_timeline([SceneAudio("a.mp3", 1.01, [])], fps=30, lead=0, gap=0, tail=0, trim=False)
    assert tl.scenes[0].frames == 31


def test_to_dict_is_json_ready():
    tl = build_timeline([SceneAudio("a.mp3", 1.0, [Word("x", 0, 0.5)])], fps=30, trim=False)
    d = tl.to_dict()
    assert d["fps"] == 30 and d["scenes"][0]["audio"] == "a.mp3"
    assert d["scenes"][0]["words"][0] == {"text": "x", "start": d["scenes"][0]["audio_start"], "end": d["scenes"][0]["audio_start"] + 15}


def test_trim_cuts_tts_silence_around_the_words():
    # Edge pads every clip with silence: speech runs 0.6..1.6 s inside a 2.4 s clip
    tl = build_timeline([SceneAudio("a.mp3", 2.4, [Word("Hello", 0.6, 1.0), Word("there.", 1.1, 1.6)])],
                        fps=30, lead=0, gap=0, tail=0, pre=0.1, post=0.2)
    s = tl.scenes[0]
    assert s.audio_trim == 15                  # skip 0.5 s of leading silence
    assert s.frames == 39                      # 0.1 pre + 1.0 speech + 0.2 post = 1.3 s
    assert s.words[0].start == 3               # first word 0.1 s into the scene
    assert tl.to_dict()["scenes"][0]["audio_trim"] == 15
