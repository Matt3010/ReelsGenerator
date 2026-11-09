import { expect, it } from "vitest";
import { buildTimeline } from "../src/timeline.js";

const w = (text: string, start: number, end: number) => ({ text, start, end });

it("lays scenes back to back with a gap", () => {
  const tl = buildTimeline([{ audio: "a.mp3", duration: 2, words: [w("Hi", 0.1, 0.4)] }, { audio: "b.mp3", duration: 1, words: [] }],
    { fps: 30, lead: 0.5, gap: 0.2, tail: 1, trim: false });
  const [s1, s2] = tl.scenes;
  expect(s1.start).toBe(0);
  expect(s1.audioStart).toBe(15);
  expect(s1.frames).toBe(15 + 60 + 6);
  expect(s2.start).toBe(s1.frames);
  expect(s2.audioStart).toBe(s2.start);
  expect(s2.frames).toBe(30 + 6 + 30);
  expect(tl.total).toBe(s1.frames + s2.frames);
});

it("gives words absolute frames", () => {
  const tl = buildTimeline([{ audio: "a.mp3", duration: 1, words: [w("A", 0, 0.5)] }, { audio: "b.mp3", duration: 1, words: [w("B", 0.2, 0.6)] }],
    { fps: 30, lead: 0, gap: 0, tail: 0, trim: false });
  expect(tl.scenes[1].words[0]).toEqual({ text: "B", start: 30 + 6, end: 30 + 18 });
});

it("trims the TTS silence around the words", () => {
  const tl = buildTimeline([{ audio: "a.mp3", duration: 2, words: [w("Hi", 0.5, 1.0)] }], { fps: 30, lead: 0, gap: 0, tail: 0 });
  const s = tl.scenes[0];
  expect(s.audioTrim).toBe(Math.round(0.42 * 30));
  expect(s.words[0].start).toBe(Math.round(0.08 * 30));
  expect(s.frames).toBe(Math.ceil((1.15 - 0.42) * 30 - 1e-6));
});

it("rounds frames up so the audio is never cut", () => {
  const tl = buildTimeline([{ audio: "a.mp3", duration: 1.01, words: [] }], { fps: 30, lead: 0, gap: 0, tail: 0, trim: false });
  expect(tl.scenes[0].frames).toBe(31);
});
