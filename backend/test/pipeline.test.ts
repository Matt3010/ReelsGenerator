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
    generate: async (prompt, _seed, out) => { prompts.push(prompt); await png(out, [prompts.length * 50, 0, 0]); return out; },
    tts: async (text, _voice, out): Promise<SceneAudio> => {
      voices.push(out.split(/[\\/]/).at(-1)!);
      writeFileSync(out, "mp3");
      return { audio: out.split(/[\\/]/).at(-1)!, duration: 1, words: text.split(" ").map((w, i) => ({ text: w, start: i * 0.2, end: i * 0.2 + 0.15 })) };
    },
    library: new Library(join(root, "lib")),
    modelName: "fake",
    render: opts.render ?? (async (_dir, tl, images, motions, captions, out) => {
      Object.assign(rendered, { images, motions, captions, total: tl.total });
      writeFileSync(out, "mp4");
    }),
    normalize: async (src, dst) => writeFileSync(dst, readFileSync(src)),
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
  eng.generate = async (p, seed, out, style, neg) => { styles.push(style); negatives.push(neg); return draw(p, seed, out, style, neg); };
  const job = Job.create(join(root, "jobs"), { topic: "x", voice: "v", captions: false,
    options: { style: "realistic", realPeople: false, avoid: false } });
  await runJob(job, eng);
  expect(job.status().state).toBe("done");
  expect(styles).toEqual(["realistic", "realistic"]);
  expect(negatives).toEqual(["", ""]);
  expect(eng.library.get(1)!.style).toBe("realistic");
});


it("a photo job draws the prompt as written, with its negative prompt, and keeps the pictures in the library", async () => {
  const root = tmp();
  const calls: string[][] = [];
  const { eng } = engines(root);
  const draw = eng.generate;
  eng.generate = async (prompt, seed, out, style, negative, size) => { calls.push([prompt, style, negative]); return draw(prompt, seed, out, style, negative, size); };
  const prompt = "An old fisherman mending nets at golden hour, 1920s harbour, cinematic";
  const job = Job.create(join(root, "jobs"), { topic: prompt, voice: "", captions: false, kind: "photo",
    photo: { prompt, negative: "blurry, extra fingers", count: 2 } });
  await runJob(job, eng);
  expect(job.status().state, job.status().error ?? "").toBe("done");
  expect(calls).toEqual([[prompt, "free", "blurry, extra fingers"], [prompt, "free", "blurry, extra fingers"]]);
  const ids: number[] = JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"));
  expect(ids).toHaveLength(2);
  expect(eng.library.get(ids[0])!.tags).toEqual(["old", "fisherman", "mending", "nets", "golden", "hour", "1920s", "harbour"]);
});

it("a photo job draws its format, and from a given seed the next ones (the same request, the same pictures)", async () => {
  const root = tmp();
  const calls: [number, readonly number[] | undefined][] = [];
  const { eng } = engines(root);
  const draw = eng.generate;
  eng.generate = async (prompt, seed, out, style, negative, size) => { calls.push([seed, size]); return draw(prompt, seed, out, style, negative, size); };
  const job = Job.create(join(root, "jobs"), { topic: "a cat", voice: "", captions: false, kind: "photo",
    photo: { prompt: "a cat", negative: "", count: 3, format: "square", seed: 42 } });
  await runJob(job, eng);
  expect(calls).toEqual([[42, [1024, 1024]], [43, [1024, 1024]], [44, [1024, 1024]]]);
  const ids: number[] = JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"));
  expect(eng.library.get(ids[1])!.seed).toBe(43);
});
