import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { STYLES, planImages, produceImages, sdCommand, sdGenerator, sdUpscaler, fitTo, type DrawRequest } from "../src/images.js";
import { FORMATS, targetSize as targetSizeOf } from "../src/models.js";
import { Library } from "../src/library.js";
import { imagePrompt, parseStory } from "../src/spec.js";
import { storyDict } from "./fixtures.js";
import { png, tmp } from "./helpers.js";

const req = (prompt: string, seed: number, out: string, style: string, negative: string, more: Partial<DrawRequest> = {}): DrawRequest =>
  ({ prompt, seed, out, style, negative, model: "dreamshaper", ...more });
const cmdOf = (r: DrawRequest) => sdCommand("sd-cli.exe", "/m", r);
const at = (cmd: string[], flag: string) => cmd[cmd.indexOf(flag) + 1];

it("builds the sd.cpp command with style, size, seed, negatives and output", () => {
  const cmd = cmdOf(req("a red barn", 42, "o.png", "toon", "tractors"));
  expect(cmd[0]).toBe("sd-cli.exe");
  expect(at(cmd, "-p").startsWith(STYLES.toon.positive)).toBe(true);
  expect(at(cmd, "-p").endsWith("a red barn")).toBe(true);
  expect(at(cmd, "-n")).toBe(`${STYLES.toon.negative}, tractors`);
  expect([at(cmd, "-W"), at(cmd, "-H"), at(cmd, "--steps"), at(cmd, "--seed"), at(cmd, "-o")]).toEqual(["768", "1344", "8", "42", "o.png"]);
  expect(cmd).toContain("--vae-tiling");
});

it("the generator runs sd.cpp and returns the image", async () => {
  const d = tmp();
  const calls: string[][] = [];
  const gen = sdGenerator("sd-cli.exe", "/m", async (cmd) => { calls.push(cmd); await png(at(cmd, "-o")); return { code: 0, output: "" }; });
  const out = await gen(req("a barn", 3, join(d, "a.png"), "toon", ""));
  expect(out).toBe(join(d, "a.png"));
  expect(existsSync(out)).toBe(true);
  expect(calls).toHaveLength(1);
});

it("the generator fails with sd.cpp's message", async () => {
  const gen = sdGenerator("sd-cli.exe", "/m", async () => ({ code: 1, output: "CUDA out of memory" }));
  await expect(gen(req("a barn", 3, join(tmp(), "a.png"), "toon", ""))).rejects.toThrow(/out of memory/);
});

class FakeGen {
  prompts: string[] = [];
  negatives: string[] = [];
  models: string[] = [];
  fn = async ({ prompt, out, negative, model }: DrawRequest) => {
    this.models.push(model);
    this.prompts.push(prompt);
    this.negatives.push(negative);
    await png(out, [this.prompts.length * 40, 0, 0], [4, 4]);
    return out;
  };
}

it("plans: reuses exact prompts and pictures the model picks", async () => {
  const d = storyDict();
  d.scenes.push({ ...d.scenes[0], narration: "And again." });
  const story = parseStory(d);
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  const old = await lib.add(await png(join(dir, "old.png"), [9, 9, 9], [4, 4]),
    { prompt: "an old bridge falling down", tags: ["bridge", "collapse", "river", "splash"], style: "toon", seed: 1, model: "m" });
  const asked: number[][] = [];
  const plan = await planImages(story, lib, "toon", "m", async (_p, c) => { asked.push(c.map((a) => a.id)); return c[0].id; });
  expect(plan).toEqual([null, old.id, null]);
  expect(asked).toEqual([[old.id]]);
});

it("plans: generates when the model rejects the candidates", async () => {
  const story = parseStory(storyDict());
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  await lib.add(await png(join(dir, "old.png")), { prompt: "x", tags: ["bridge", "collapse", "river", "splash"], style: "toon", seed: 1, model: "m" });
  expect(await planImages(story, lib, "toon", "m", async () => null)).toEqual([null, null]);
});

it("plans: reuses only pictures drawn by the chosen model", async () => {
  const story = parseStory(storyDict());
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  await lib.add(await png(join(dir, "a.png")), { prompt: imagePrompt(story, story.scenes[0]), tags: ["bridge", "collapse", "river", "splash"],
    style: "toon", seed: 1, model: "dreamshaper" });
  expect(await planImages(story, lib, "toon", "zimage", async (_p, c) => c[0]?.id ?? null)).toEqual([null, null]);
});

it("plans: reuses an identical prompt without asking", async () => {
  const story = parseStory(storyDict());
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  const a = await lib.add(await png(join(dir, "old.png")), { prompt: imagePrompt(story, story.scenes[0]), tags: ["x"], style: "toon", seed: 1, model: "m" });
  const plan = await planImages(story, lib, "toon", "m", async () => { throw new Error("should not ask"); });
  expect(plan[0]).toBe(a.id);
});

it("produces each distinct picture once, stores it and counts every use", async () => {
  const d = storyDict();
  d.scenes.push({ ...d.scenes[0], narration: "And again." });
  const story = parseStory(d);
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  const gen = new FakeGen();
  const assets = await produceImages(story, lib, [null, null, null], gen.fn, { style: "toon", seed: 5, model: "zimage", work: join(dir, "w") });
  expect(gen.prompts).toHaveLength(2);
  expect(assets[0].id).toBe(assets[2].id);
  expect(assets[1].tags).toEqual(["bridge", "collapse", "river", "splash"]);
  expect(lib.get(assets[0].id)!.uses).toBe(2);
  expect(gen.negatives).toEqual(["cars, electric lights", "cars, electric lights"]);
  expect(gen.models).toEqual(["zimage", "zimage"]);
  expect(assets[0].model).toBe("zimage");
});

it("offers a wide palette of styles, each named and with its own words", () => {
  const ids = Object.keys(STYLES);
  expect(ids.length).toBeGreaterThanOrEqual(18);
  expect(ids.slice(0, 3)).toEqual(["toon", "realistic", "free"]);
  for (const s of Object.values(STYLES)) {
    expect(s.label.length).toBeGreaterThan(0);
    expect(s.negative.length).toBeGreaterThan(0);
  }
  expect(new Set(Object.values(STYLES).map((s) => s.label)).size).toBe(ids.length);
  expect(STYLES.realistic.positive).toMatch(/photo/i);
  expect(STYLES.realistic.negative).toMatch(/cartoon/i);
  expect(STYLES.free.positive).toBe("");
  const free = cmdOf(req("a red barn", 1, "o.png", "free", ""));
  expect(at(free, "-p")).toBe("a red barn");                 // no style words at all
});

it("runs the chosen model with its own weights, and no negative prompt where the model ignores it", () => {
  const z = cmdOf(req("a barn", 1, "o.png", "toon", "tractors", { model: "zimage" }));
  expect(at(z, "--diffusion-model")).toBe("/m/z_image_turbo-Q4_K.gguf");
  expect(z).not.toContain("-m");
  expect(z).not.toContain("-n");
  expect([at(z, "-W"), at(z, "-H"), at(z, "--seed")]).toEqual(["768", "1344", "1"]);
  const d = cmdOf(req("a barn", 1, "o.png", "toon", "tractors"));
  expect(at(d, "-m")).toBe("/m/DreamShaperXL_Turbo_v2_1.safetensors");
});

it("draws the size it is asked for", () => {
  expect(FORMATS).toEqual({ portrait: [768, 1344], square: [1024, 1024], landscape: [1344, 768] });
  const cmd = cmdOf(req("a barn", 1, "o.png", "free", "", { size: FORMATS.landscape }));
  expect([at(cmd, "-W"), at(cmd, "-H")]).toEqual(["1344", "768"]);
});

describe("resolution", () => {
  it("knows the exact size of each format at each resolution", () => {
    expect(targetSizeOf("portrait", "standard")).toEqual([768, 1344]);
    expect(targetSizeOf("landscape", "fullhd")).toEqual([1920, 1080]);
    expect(targetSizeOf("portrait", "fullhd")).toEqual([1080, 1920]);
    expect(targetSizeOf("square", "fullhd")).toEqual([1920, 1920]);
    expect(targetSizeOf("landscape", "4k")).toEqual([3840, 2160]);
  });

  it("enlarges with ESRGAN, then cuts to the exact size", async () => {
    const d = tmp();
    const input = await png(join(d, "in.png"), [9, 9, 9], [1344, 768]);
    const calls: string[][] = [];
    const up = sdUpscaler("sd-cli.exe", "esrgan.pth", async (cmd) => {
      calls.push(cmd);
      await png(at(cmd, "-o"), [9, 9, 9], [5376, 3072]);
      return { code: 0, output: "" };
    });
    await up(input, [1920, 1080]);
    expect(calls[0]).toEqual(expect.arrayContaining(["-M", "upscale", "-i", input, "--upscale-model", "esrgan.pth"]));
    const { width, height } = await sharp(input).metadata();
    expect([width, height]).toEqual([1920, 1080]);
  });
});

it("asks sd.cpp for a hires fix: drawn at its own size, then a second pass at the larger one (multiples of 64)", () => {
  const cmd = cmdOf(req("a barn", 1, "o.png", "free", "", { size: FORMATS.landscape, hires: [1920, 1080] }));
  expect([at(cmd, "-W"), at(cmd, "-H")]).toEqual(["1344", "768"]);
  expect(cmd).toContain("--hires");
  expect([at(cmd, "--hires-width"), at(cmd, "--hires-height")]).toEqual(["1920", "1088"]);
  expect(at(cmd, "--hires-upscaler")).toBe("Lanczos");
  expect(at(cmd, "--hires-denoising-strength")).toBe("0.35");
  expect(cmdOf(req("a barn", 1, "o.png", "free", ""))).not.toContain("--hires");
});

it("cuts a picture to an exact size", async () => {
  const file = await png(join(tmp(), "a.png"), [5, 5, 5], [1920, 1088]);
  await fitTo(file, [1920, 1080]);
  const { width, height } = await sharp(file).metadata();
  expect([width, height]).toEqual([1920, 1080]);
});
