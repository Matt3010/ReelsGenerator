import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { VOICES, attachPunctuation, parseBoundaries, synthesize, type Speaker } from "../src/tts.js";
import { tmp } from "./helpers.js";

it("restores the punctuation Edge drops from word events", () => {
  const out = attachPunctuation("Then it snapped.", [{ text: "Then", start: 0, end: 0.2 }, { text: "it", start: 0.2, end: 0.3 },
    { text: "snapped", start: 0.3, end: 0.6 }]);
  expect(out.map((w) => w.text)).toEqual(["Then", "it", "snapped."]);
});

it("reads Edge word boundaries (100 ns ticks) as seconds", () => {
  const meta = JSON.stringify({ Metadata: [
    { Type: "WordBoundary", Data: { Offset: 1_000_000, Duration: 2_000_000, text: { Text: "Then" } } },
    { Type: "SentenceBoundary", Data: { Offset: 0, Duration: 0, text: { Text: "x" } } },
  ] });
  expect(parseBoundaries([meta])).toEqual([{ text: "Then", start: 0.1, end: 0.30000000000000004 }]);
});

const fakeAudio = (dir: string): Speaker => async () => {
  const audio = join(dir, "raw.mp3");
  writeFileSync(audio, "mp3");
  return { audio, words: [{ text: "hi", start: 0, end: 0.5 }] };
};

it("retries a flaky voice service", async () => {
  const d = tmp();
  let calls = 0;
  const flaky: Speaker = async (...a) => { if (++calls < 3) throw new Error("no audio"); return fakeAudio(d)(...a); };
  const clip = await synthesize("hi", "en-US-GuyNeural", join(d, "s01.mp3"), { speak: flaky, sleep: async () => {}, duration: async () => 1.2 });
  expect(calls).toBe(3);
  expect(clip).toEqual({ audio: "s01.mp3", duration: 1.2, words: [{ text: "hi", start: 0, end: 0.5 }] });
});

it("gives up after the last attempt", async () => {
  const dead: Speaker = async () => { throw new Error("no audio"); };
  await expect(synthesize("hi", "v", join(tmp(), "a.mp3"), { speak: dead, sleep: async () => {}, attempts: 4 })).rejects.toThrow(/voice/);
});

it("offers the narrator voices", () => expect(Object.keys(VOICES)).toContain("en-US-GuyNeural"));
