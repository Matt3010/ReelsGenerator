import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Library } from "../src/library.js";
import type { Runner } from "../src/llm.js";
import { Job, markInterrupted, runJob, type Engines } from "../src/pipeline.js";
import { parseStory } from "../src/spec.js";
import type { SceneAudio } from "../src/timeline.js";
import { storyDict } from "./fixtures.js";
import { png, tmp } from "./helpers.js";

function engines(root: string, story = storyDict(), opts: { llmCalls?: string[]; render?: Engines["render"] } = {}) {
  const llmCalls = opts.llmCalls ?? [];
  const prompts: string[] = [];
  const voices: string[] = [];
  const rendered: Record<string, unknown> = {};
  const run: Runner = async (prompt, _schema, think) => { llmCalls.push(prompt); return think ? "Facts: the bridge fell in 1831." : JSON.stringify(story); };
  const eng: Engines = {
    llm: (fn) => fn(run),
    generate: async ({ prompt, out }) => { prompts.push(prompt); await png(out, [prompts.length * 50, 0, 0]); return out; },
    tts: async (text, _voice, out): Promise<SceneAudio> => {
      voices.push(out.split(/[\\/]/).at(-1)!);
      writeFileSync(out, "mp3");
      return { audio: out.split(/[\\/]/).at(-1)!, duration: 1, words: text.split(" ").map((w, i) => ({ text: w, start: i * 0.2, end: i * 0.2 + 0.15 })) };
    },
    library: new Library(join(root, "lib")),
    render: opts.render ?? (async (_dir, tl, images, motions, captions, out) => {
      Object.assign(rendered, { images, motions, captions, total: tl.total });
      writeFileSync(out, "mp4");
    }),
    normalize: async (src, dst) => writeFileSync(dst, readFileSync(src)),
    upscale: async () => {},
    maxSeconds: 10,
    article: async () => "The old bridge in Turin reopened on Monday after repairs.",
  };
  return { eng, prompts, voices, rendered };
}

it("writes story, pictures and video", async () => {
  const root = tmp();
  const { eng, prompts, voices, rendered } = engines(root);
  const job = Job.create(join(root, "jobs"), { topic: "bridges", voice: "en-US-GuyNeural", captions: true });
  await runJob(job, eng);
  const st = job.status();
  expect(st.state, st.error ?? "").toBe("done");
  expect(st.title).toBe("The Bridge That Fell");
  expect(existsSync(join(job.dir, "video.mp4"))).toBe(true);
  expect(voices).toEqual(["s01.mp3", "s02.mp3"]);
  expect(prompts).toHaveLength(2);
  expect((rendered.images as string[]).map((p) => dirname(p))).toEqual([eng.library.imagesDir, eng.library.imagesDir]);
  expect(rendered.motions).toEqual(["zoom_in", "pan_left"]);
  expect(rendered.captions).toBe(true);
  expect(JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"))).toEqual([1, 2]);
  expect(readFileSync(join(job.dir, "notes.txt"), "utf8")).toBe("Facts: the bridge fell in 1831.");
});

it("a second job reuses the library pictures", async () => {
  const root = tmp();
  const { eng, prompts } = engines(root);
  await runJob(Job.create(join(root, "jobs"), { topic: "a", voice: "v", captions: false }), eng);
  await runJob(Job.create(join(root, "jobs"), { topic: "b", voice: "v", captions: false }), eng);
  expect(prompts).toHaveLength(2);
  expect(eng.library.get(1)!.uses).toBe(2);
});

it("reuses an existing story without starting the model", async () => {
  const root = tmp();
  const calls: string[] = [];
  const { eng } = engines(root, storyDict(), { llmCalls: calls });
  const job = Job.create(join(root, "jobs"), { topic: "x", voice: "v", captions: false });
  writeFileSync(join(job.dir, "story.json"), JSON.stringify(storyDict()));
  await runJob(job, eng);
  expect(calls).toEqual([]);
  expect(job.status().state).toBe("done");
});

it("records a failure and clears it on a successful retry", async () => {
  const root = tmp();
  const failing = engines(root, storyDict(), { render: async () => { throw new Error("ffmpeg exploded"); } });
  const job = Job.create(join(root, "jobs"), { topic: "x", voice: "v", captions: false });
  await runJob(job, failing.eng);
  expect(job.status().state).toBe("error");
  expect(job.status().error).toContain("ffmpeg exploded");
  await runJob(job, engines(root).eng);
  expect(job.status().error).toBeNull();
});

const NEWS = { title: "Bridge reopens after storm", url: "https://bbc.co.uk/a1", published: "2026-11-09T07:26:09.000Z", outlet: "BBC News",
  summary: "The old bridge reopened." };

it("a news job uses the article and records the source", async () => {
  const root = tmp();
  const calls: string[] = [];
  const { eng } = engines(root, storyDict(), { llmCalls: calls });
  const job = Job.create(join(root, "jobs"), { topic: NEWS.title, voice: "v", captions: true, news: NEWS });
  await runJob(job, eng);
  expect(job.status().state).toBe("done");
  expect(readFileSync(join(job.dir, "article.txt"), "utf8")).toBe("The old bridge in Turin reopened on Monday after repairs.");
  expect(calls[0]).toContain("The old bridge in Turin reopened");
  const story = parseStory(JSON.parse(readFileSync(join(job.dir, "story.json"), "utf8")));
  expect(story.source).toEqual({ outlet: "BBC News", title: NEWS.title, url: NEWS.url, published: NEWS.published });
});

it("notes when a job started and ended, and starts again on a retry", () => {
  const job = Job.create(join(tmp(), "jobs"), { topic: "x", voice: "v", captions: false });
  expect(job.status().started).toBeUndefined();
  const before = Date.now() / 1000;
  job.update({ state: "running", step: "a" });
  const started = job.status().started!;
  expect(started).toBeGreaterThanOrEqual(before);
  job.update({ step: "b" });                                   // a later step keeps the start
  expect(job.status().started).toBe(started);
  job.update({ state: "done", step: "Fatto" });
  expect(job.status().finished).toBeGreaterThanOrEqual(started);
  job.update({ state: "queued", step: "In coda" });             // a retry: the clock starts over
  expect([job.status().started, job.status().finished]).toEqual([undefined, undefined]);
});

it("lists jobs newest first", () => {
  const root = tmp();
  const a = Job.create(root, { topic: "first", voice: "v", captions: false });
  const b = Job.create(root, { topic: "second", voice: "v", captions: false });
  const ids = Job.list(root).map((j) => j.id);
  expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
});


it("after a restart, jobs left half-way are marked interrupted (and can be retried)", () => {
  const root = tmp();
  const running = Job.create(root, { topic: "a", voice: "v", captions: false });
  running.update({ state: "running", step: "Montaggio (26 s di video)" });
  const queued = Job.create(root, { topic: "b", voice: "v", captions: false });
  const done = Job.create(root, { topic: "c", voice: "v", captions: false });
  done.update({ state: "done", step: "Fatto" });
  expect(markInterrupted(root)).toBe(2);
  for (const j of [running, queued]) {
    expect(j.status().state).toBe("error");
    expect(j.status().error).toMatch(/interrott/i);
  }
  expect(done.status().state).toBe("done");
});

it("draws in the style the job asks for, and drops the anachronism list when told to", async () => {
  const root = tmp();
  const negatives: string[] = [];
  const styles: string[] = [];
  const { eng } = engines(root);
  const draw = eng.generate;
  const models: string[] = [];
  eng.generate = async (r) => { styles.push(r.style); negatives.push(r.negative); models.push(r.model); return draw(r); };
  const job = Job.create(join(root, "jobs"), { topic: "x", voice: "v", captions: false,
    options: { style: "realistic", realPeople: false, avoid: false, model: "krea2" } });
  await runJob(job, eng);
  expect(job.status().state).toBe("done");
  expect(styles).toEqual(["realistic", "realistic"]);
  expect(negatives).toEqual(["", ""]);
  expect(models).toEqual(["krea2", "krea2"]);
  expect(eng.library.get(1)!.style).toBe("realistic");
  expect(eng.library.get(1)!.model).toBe("krea2");
});


it("a photo job draws the prompt as written, with its negative prompt, and keeps the pictures in the library", async () => {
  const root = tmp();
  const calls: string[][] = [];
  const { eng } = engines(root);
  const draw = eng.generate;
  eng.generate = async (r) => { calls.push([r.prompt, r.style, r.negative, r.model]); return draw(r); };
  const prompt = "An old fisherman mending nets at golden hour, 1920s harbour, cinematic";
  const job = Job.create(join(root, "jobs"), { topic: prompt, voice: "", captions: false, kind: "photo",
    photo: { prompt, negative: "blurry, extra fingers", count: 2 } });
  await runJob(job, eng);
  expect(job.status().state, job.status().error ?? "").toBe("done");
  expect(calls).toEqual([[prompt, "free", "blurry, extra fingers", "dreamshaper"], [prompt, "free", "blurry, extra fingers", "dreamshaper"]]);
  const ids: number[] = JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"));
  expect(ids).toHaveLength(2);
  expect(eng.library.get(ids[0])!.tags).toEqual(["old", "fisherman", "mending", "nets", "golden", "hour", "1920s", "harbour"]);
});

it("a photo job draws its format, and from a given seed the next ones (the same request, the same pictures)", async () => {
  const root = tmp();
  const calls: [number, readonly number[] | undefined][] = [];
  const { eng } = engines(root);
  const draw = eng.generate;
  eng.generate = async (r) => { calls.push([r.seed, r.size]); return draw(r); };
  const job = Job.create(join(root, "jobs"), { topic: "a cat", voice: "", captions: false, kind: "photo",
    photo: { prompt: "a cat", negative: "", count: 3, format: "square", seed: 42 } });
  await runJob(job, eng);
  expect(calls).toEqual([[42, [1024, 1024]], [43, [1024, 1024]], [44, [1024, 1024]]]);
  const ids: number[] = JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"));
  expect(eng.library.get(ids[1])!.seed).toBe(43);
});

it("a photo job at Full HD draws with a hires fix and cuts to the exact size, with no ESRGAN", async () => {
  const root = tmp();
  const { eng } = engines(root);
  const hires: unknown[] = [];
  eng.generate = async ({ out, hires: h }) => {
    hires.push(h);
    await png(out, [1, 2, 3], [1920, 1088]);
    return out;
  };
  let upscaled = 0;
  eng.upscale = async () => { upscaled++; };
  const job = Job.create(join(root, "jobs"), { topic: "a cat", voice: "", captions: false, kind: "photo",
    photo: { prompt: "a cat", negative: "", count: 1, format: "landscape", seed: 1, resolution: "fullhd" } });
  await runJob(job, eng);
  expect(hires).toEqual([[1920, 1080]]);
  expect(upscaled).toBe(0);
  const [id] = JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"));
  expect([eng.library.get(id)!.width, eng.library.get(id)!.height]).toEqual([1920, 1080]);
});

it("a photo job with a newer model draws Full HD directly, with no hires fix, and says which model drew it", async () => {
  const root = tmp();
  const { eng } = engines(root);
  const calls: unknown[] = [];
  eng.generate = async ({ out, size, hires, model }) => { calls.push([model, size, hires]); await png(out, [1, 2, 3], [1920, 1088]); return out; };
  const job = Job.create(join(root, "jobs"), { topic: "a cat", voice: "", captions: false, kind: "photo",
    photo: { prompt: "a cat", negative: "", count: 1, format: "landscape", seed: 1, resolution: "fullhd", model: "zimage" } });
  await runJob(job, eng);
  expect(calls).toEqual([["zimage", [1920, 1088], undefined]]);
  const [id] = JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"));
  expect(eng.library.get(id)!.model).toBe("zimage");
  expect([eng.library.get(id)!.width, eng.library.get(id)!.height]).toEqual([1920, 1080]);
});

it("shows the model's step and speed while it draws, for pictures and for videos", async () => {
  const root = tmp();
  const { eng } = engines(root);
  const steps: string[] = [];
  const draw = eng.generate;
  let job: Job;
  eng.generate = async (r) => {
    r.progress?.({ step: 3, steps: 8, rate: "2.51 s/it", phase: "steps" });
    steps.push(`${job.status().step} | ${job.status().detail}`);
    r.progress?.({ step: 10, steps: 45, rate: "2.20 it/s", phase: "decode" });
    steps.push(`${job.status().step} | ${job.status().detail}`);
    return draw(r);
  };
  job = Job.create(join(root, "jobs"), { topic: "a cat", voice: "", captions: false, kind: "photo",
    photo: { prompt: "a cat", negative: "", count: 1 } });
  await runJob(job, eng);
  job = Job.create(join(root, "jobs"), { topic: "x", voice: "v", captions: false });
  await runJob(job, eng);
  expect(steps.slice(0, 2)).toEqual(["Disegno l'immagine 1/1 | passo 3/8 · 2.51 s/it", "Disegno l'immagine 1/1 | decodifica 10/45 · 2.20 it/s"]);
  expect(steps[2]).toBe("Disegno l'immagine 1/2 | passo 3/8 · 2.51 s/it");
  expect(job.status().detail).toBeUndefined();               // a new step: the model's detail goes with the old one
});

it("a photo job at 4K draws at Full HD with the hires fix, then ESRGAN takes it to 4K", async () => {
  const root = tmp();
  const { eng } = engines(root);
  const hires: unknown[] = [];
  const sizes: unknown[] = [];
  eng.generate = async ({ out, hires: h }) => { hires.push(h); await png(out, [1, 2, 3], [64, 36]); return out; };
  eng.upscale = async (file, size) => { sizes.push(size); };
  await runJob(Job.create(join(root, "jobs"), { topic: "a cat", voice: "", captions: false, kind: "photo",
    photo: { prompt: "a cat", negative: "", count: 1, format: "landscape", seed: 1, resolution: "4k" } }), eng);
  expect(hires).toEqual([[1920, 1080]]);
  expect(sizes).toEqual([[3840, 2160]]);
});
