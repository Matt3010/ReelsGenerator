import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { STYLES, planImages, produceImages, sdCommand, sdGenerator, type SdConfig } from "../src/images.js";
import { Library } from "../src/library.js";
import { imagePrompt, parseStory } from "../src/spec.js";
import { storyDict } from "./fixtures.js";
import { png, tmp } from "./helpers.js";

const CFG: SdConfig = { exe: "sd-cli.exe", model: "m.safetensors", vae: "v.safetensors", width: 768, height: 1344, steps: 8,
  cfg: 2, sampler: "dpm++2m", scheduler: "karras" };
const at = (cmd: string[], flag: string) => cmd[cmd.indexOf(flag) + 1];

it("builds the sd.cpp command with style, size, seed, negatives and output", () => {
  const cmd = sdCommand(CFG, "a red barn", 42, "o.png", "toon", "tractors");
  expect(cmd[0]).toBe("sd-cli.exe");
  expect(at(cmd, "-p").startsWith(STYLES.toon[0])).toBe(true);
  expect(at(cmd, "-p").endsWith("a red barn")).toBe(true);
  expect(at(cmd, "-n")).toBe(`${STYLES.toon[1]}, tractors`);
  expect([at(cmd, "-W"), at(cmd, "-H"), at(cmd, "--steps"), at(cmd, "--seed"), at(cmd, "-o")]).toEqual(["768", "1344", "8", "42", "o.png"]);
  expect(cmd).toContain("--vae-tiling");
});

it("the generator runs sd.cpp and returns the image", async () => {
  const d = tmp();
  const calls: string[][] = [];
  const gen = sdGenerator(CFG, async (cmd) => { calls.push(cmd); await png(at(cmd, "-o")); return { code: 0, output: "" }; });
  const out = await gen("a barn", 3, join(d, "a.png"), "toon", "");
  expect(out).toBe(join(d, "a.png"));
  expect(existsSync(out)).toBe(true);
  expect(calls).toHaveLength(1);
});

it("the generator fails with sd.cpp's message", async () => {
  const gen = sdGenerator(CFG, async () => ({ code: 1, output: "CUDA out of memory" }));
  await expect(gen("a barn", 3, join(tmp(), "a.png"), "toon", "")).rejects.toThrow(/out of memory/);
});

class FakeGen {
  prompts: string[] = [];
  negatives: string[] = [];
  fn = async (prompt: string, _seed: number, out: string, _style: string, negative: string) => {
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
  const plan = await planImages(story, lib, "toon", async (_p, c) => { asked.push(c.map((a) => a.id)); return c[0].id; });
  expect(plan).toEqual([null, old.id, null]);
  expect(asked).toEqual([[old.id]]);
});

it("plans: generates when the model rejects the candidates", async () => {
  const story = parseStory(storyDict());
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  await lib.add(await png(join(dir, "old.png")), { prompt: "x", tags: ["bridge", "collapse", "river", "splash"], style: "toon", seed: 1, model: "m" });
  expect(await planImages(story, lib, "toon", async () => null)).toEqual([null, null]);
});

it("plans: reuses an identical prompt without asking", async () => {
  const story = parseStory(storyDict());
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  const a = await lib.add(await png(join(dir, "old.png")), { prompt: imagePrompt(story, story.scenes[0]), tags: ["x"], style: "toon", seed: 1, model: "m" });
  const plan = await planImages(story, lib, "toon", async () => { throw new Error("should not ask"); });
  expect(plan[0]).toBe(a.id);
});

it("produces each distinct picture once, stores it and counts every use", async () => {
  const d = storyDict();
  d.scenes.push({ ...d.scenes[0], narration: "And again." });
  const story = parseStory(d);
  const dir = tmp();
  const lib = new Library(join(dir, "lib"));
  const gen = new FakeGen();
  const assets = await produceImages(story, lib, [null, null, null], gen.fn, { style: "toon", seed: 5, model: "dsxl", work: join(dir, "w") });
  expect(gen.prompts).toHaveLength(2);
  expect(assets[0].id).toBe(assets[2].id);
  expect(assets[1].tags).toEqual(["bridge", "collapse", "river", "splash"]);
  expect(lib.get(assets[0].id)!.uses).toBe(2);
  expect(gen.negatives).toEqual(["cars, electric lights", "cars, electric lights"]);
});
