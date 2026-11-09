import { spawnSync } from "node:child_process";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assCaptions, audioGraph, cropBox, frameImage, normalizeAudio, sceneIndex } from "../src/render.js";
import { MOTIONS } from "../src/spec.js";
import { buildTimeline } from "../src/timeline.js";
import { tmp } from "./helpers.js";

const W = 768, H = 1344;
const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);

describe("cropBox", () => {
  it.each(MOTIONS)("%s stays inside the picture with a 9:16 aspect", (motion) => {
    for (const t of [0, 0.3, 1]) {
      const [x0, y0, x1, y1] = cropBox(motion, t, W, H);
      expect(0 <= x0 && x0 < x1 && x1 <= W && 0 <= y0 && y0 < y1 && y1 <= H).toBe(true);
      expect((x1 - x0) / (y1 - y0)).toBeCloseTo(9 / 16, 3);
    }
  });

  it("zooms in on the centre and out to the full picture", () => {
    const a = cropBox("zoom_in", 0, W, H), b = cropBox("zoom_in", 1, W, H);
    expect(area(b)).toBeLessThan(area(a));
    expect((b[0] + b[2]) / 2).toBeCloseTo(W / 2);
    expect((b[1] + b[3]) / 2).toBeCloseTo(H / 2);
    expect(area(cropBox("zoom_out", 1, W, H))).toBeGreaterThan(area(cropBox("zoom_out", 0, W, H)));
  });

  it("pans the named way", () => {
    expect(cropBox("pan_left", 1, W, H)[0]).toBeLessThan(cropBox("pan_left", 0, W, H)[0]);
    expect(cropBox("pan_right", 1, W, H)[0]).toBeGreaterThan(cropBox("pan_right", 0, W, H)[0]);
    expect(cropBox("pan_up", 1, W, H)[1]).toBeLessThan(cropBox("pan_up", 0, W, H)[1]);
    expect(cropBox("pan_down", 1, W, H)[1]).toBeGreaterThan(cropBox("pan_down", 0, W, H)[1]);
  });

  it("eases in and out", () => {
    const xs = Array.from({ length: 11 }, (_, t) => cropBox("pan_right", t / 10, W, H)[0]);
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(steps[0]).toBeLessThan(steps[5]);
    expect(steps[9]).toBeLessThan(steps[5]);
  });
});

it("renders a full HD vertical RGB frame", async () => {
  const pic = sharp({ create: { width: W, height: H, channels: 3, background: { r: 10, g: 200, b: 30 } } });
  const raw = await pic.png().toBuffer();
  const frame = await frameImage(raw, [0, 0, W, H], [1080, 1920]);
  expect(frame.length).toBe(1080 * 1920 * 3);
  const centre = (960 * 1080 + 540) * 3;
  expect([...frame.subarray(centre, centre + 3)]).toEqual([10, 200, 30]);
});

it("moves by fractions of a pixel (no jitter on slow pans)", async () => {
  // a sharp black/white edge: shifting the box by half a source pixel must give in-between greys
  const edge = await sharp({ create: { width: 64, height: 114, channels: 3, background: "#000" } })
    .composite([{ input: { create: { width: 32, height: 114, channels: 3, background: "#fff" } }, left: 32, top: 0 }]).png().toBuffer();
  const a = await frameImage(edge, [0, 0, 64, 113.78], [64, 114]);
  const b = await frameImage(edge, [0.5, 0, 64.5, 113.78], [64, 114]);
  const row = 57 * 64 * 3;
  const grey = (f: Buffer, x: number) => f[row + x * 3];
  expect(grey(b, 31)).not.toBe(grey(a, 31));
  expect(grey(b, 31)).toBeGreaterThan(0);
  expect(grey(b, 31)).toBeLessThan(255);
});

const w = (text: string, start: number, end: number) => ({ text, start, end });
const tl2 = () => buildTimeline([{ audio: "a.mp3", duration: 1, words: [w("Hello", 0, 0.3), w("world.", 0.3, 0.6)] },
  { audio: "b.mp3", duration: 1, words: [w("Bye", 0, 0.4)] }], { fps: 30, lead: 0, gap: 0, tail: 0, trim: false });

it("finds the scene of a frame", () => {
  const tl = tl2();
  expect([0, 29, 30, 59].map((f) => sceneIndex(tl, f))).toEqual([0, 0, 1, 1]);
});

it("highlights the spoken word in large captions", () => {
  const ass = assCaptions(tl2(), 1080, 1920);
  expect(ass).toContain("PlayResX: 1080");
  expect(ass).toContain("PlayResY: 1920");
  const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  expect(lines).toHaveLength(3);
  expect(lines[0].split(",").slice(1, 3)).toEqual(["0:00:00.00", "0:00:00.30"]);
  expect(lines[0]).toContain("{\\c&H4DE1FF&}HELLO{\\c&HFFFFFF&}");
  expect(lines[0]).toContain("WORLD");
  expect(lines[1]).not.toContain("BYE");
  expect(lines[2]).toContain("{\\c&H4DE1FF&}BYE");
  const style = ass.split("\n").find((l) => l.startsWith("Style: Cap,"))!.split(",");
  expect(Number(style[2])).toBeGreaterThanOrEqual(100);
  expect(Number(style[16])).toBeGreaterThanOrEqual(10);
});

it("places the voices", () => {
  const tl = buildTimeline([{ audio: "s01.mp3", duration: 1, words: [w("Hi", 0.2, 0.5)] }, { audio: "s02.mp3", duration: 1, words: [] }],
    { fps: 30, lead: 0.5, gap: 0, tail: 0 });
  const [inputs, graph] = audioGraph(tl);
  expect(inputs).toEqual(["s01.mp3", "s02.mp3"]);
  expect(graph).toContain("adelay=500:all=1");
  expect(graph).toContain("atrim=start=0.133");
  expect(graph.trimEnd().endsWith("[aout]")).toBe(true);
});

const loudness = (path: string) => {
  const err = spawnSync("ffmpeg", ["-hide_banner", "-i", path, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return Number([...err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)![1]);
};

it("normalises the loudness to what short platforms play at", async () => {
  const d = tmp();
  const src = join(d, "raw.mp4"), dst = join(d, "out.mp4");
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-af", "volume=0.05", "-shortest", "-c:v", "libx264", "-c:a", "aac", src]);
  expect(loudness(src)).toBeLessThan(-25);
  await normalizeAudio(src, dst);
  expect(Math.abs(loudness(dst) + 14)).toBeLessThan(1.5);
});
