// Topic -> story (local LLM) -> pictures (library or stable-diffusion.cpp) -> voice -> timeline -> ffmpeg,
// one folder per job.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { DEFAULT_SD, FORMATS, fitTo, modelName, planImages, produceImages, sdGenerator, sdUpscaler, targetSize, type Format, type Generator,
  type Resolution, type StyleId, type Upscaler } from "./images.js";
import { Library } from "./library.js";
import { chooseImage, generateStory, researchNotes, withLlama, type Runner } from "./llm.js";
import { articleText, type NewsItem } from "./news.js";
import { CONFIG } from "./config.js";
import { normalizeAudio, renderVideo } from "./render.js";
import { parseStory, type Story } from "./spec.js";
import { buildTimeline, type SceneAudio } from "./timeline.js";
import { synthesize } from "./tts.js";

export const JOBS = CONFIG.jobs;
const LIBRARY = CONFIG.library;

/** a photo job: the prompt and the negative prompt as written, drawn count times in a format; from a seed, the next ones */
export interface PhotoRequest {
  prompt: string; negative: string; count: number; format?: Format; seed?: number | null;
  /** past SDXL's own size (Full HD, 4K): enlarged after drawing */
  resolution?: Resolution;
}
/** the job's choices: the picture style and which limits apply (both kinds of job) */
export interface JobOptions { style: StyleId; realPeople: boolean; avoid: boolean }
export const DEFAULT_OPTIONS: JobOptions = { style: "toon", realPeople: false, avoid: true };
export interface NewJob {
  topic: string; voice: string; captions: boolean; news?: NewsItem | null;
  kind?: "video" | "photo"; photo?: PhotoRequest; // a photo job: only pictures
  options?: JobOptions;
}
export interface JobStatus extends NewJob {
  state: "queued" | "running" | "done" | "error"; step: string; title: string | null; error: string | null; created: number;
  duration?: number;
}

let lastCreated = 0;

/** who wants to know when a job changes (the pages following /api/events) */
const listeners = new Set<() => void>();
/** call back on every change of any job; returns how to stop */
export function onJobsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const changed = () => { for (const listener of listeners) listener(); };

export class Job {
  readonly id: string;
  constructor(readonly dir: string) { this.id = basename(dir); }

  static create(root: string, req: NewJob): Job {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const dir = join(root, `${stamp}-${randomBytes(3).toString("hex")}`);
    mkdirSync(dir, { recursive: true });
    lastCreated = Math.max(Date.now() / 1000, lastCreated + 1e-3); // strictly increasing: same-tick jobs keep their order
    const job = new Job(dir);
    job.write({ ...req, news: req.news ?? null, options: req.options ?? DEFAULT_OPTIONS, state: "queued", step: "In coda", title: null, error: null, created: lastCreated });
    return job;
  }

  static list(root: string): Job[] {
    if (!existsSync(root)) return [];
    return readdirSync(root).map((n) => join(root, n)).filter((d) => existsSync(join(d, "status.json")))
      .map((d) => new Job(d)).sort((a, b) => b.status().created - a.status().created);
  }

  status(): JobStatus { return JSON.parse(readFileSync(join(this.dir, "status.json"), "utf8")); }

  private write(st: JobStatus) {
    const tmp = join(this.dir, "status.json.tmp");
    writeFileSync(tmp, JSON.stringify(st, null, 1), "utf8");
    renameSync(tmp, join(this.dir, "status.json"));
    changed();
  }

  update(patch: Partial<JobStatus>) { this.write({ ...this.status(), ...patch }); }

  /** the job and everything it made, gone (the pages hear of it) */
  remove(): void {
    rmSync(this.dir, { recursive: true, force: true });
    changed();
  }

  /** the library pictures it made (a photo job), or that a video used */
  images(): number[] {
    const file = join(this.dir, "images.json");
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  }

  /** a picture of a photo job deleted: off its list, and the job too when it was the last one */
  dropImage(id: number): void {
    const left = this.images().filter((one) => one !== id);
    if (this.status().kind === "photo" && left.length === 0) return this.remove();
    writeFileSync(join(this.dir, "images.json"), JSON.stringify(left), "utf8");
    changed();
  }

  log(line: string) { appendFileSync(join(this.dir, "log.txt"), line.trimEnd() + "\n", "utf8"); }
}

const topicSeed = (topic: string) => Number(BigInt(`0x${createHash("sha1").update(topic).digest("hex")}`) % 2n ** 31n);

export interface Engines {
  llm: <T>(fn: (run: Runner) => Promise<T>) => Promise<T>; // the local model runs only inside fn
  generate: Generator;
  tts: (text: string, voice: string, out: string) => Promise<SceneAudio>;
  library: Library;
  modelName: string;
  render: typeof renderVideo;
  normalize: (src: string, dst: string) => Promise<void>;
  upscale: Upscaler;
  maxSeconds: number;
  article: (item: NewsItem) => Promise<string>;
}

/** every failure reaches the UI (and the full trace the job log) */
function fail(job: Job, e: unknown): void {
  job.log(e instanceof Error ? e.stack ?? e.message : String(e));
  job.update({ state: "error", step: "Errore", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
}

const STOP = new Set(["the", "and", "with", "for", "from", "into", "onto", "over", "under"]);
/** the words of a prompt, as tags for the library (so a short can reuse the picture) */
export const promptTags = (prompt: string) =>
  [...new Set((prompt.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 8);

/** only pictures: the prompt drawn count times as written (no style added, each with its own seed), kept in the library */
async function runPhotoJob(job: Job, eng: Engines): Promise<void> {
  const st = job.status();
  const req = st.photo!;
  const style = "free";
  const size = FORMATS[req.format ?? "portrait"];
  const resolution = req.resolution ?? "standard";
  const exact = targetSize(req.format ?? "portrait", resolution);
  // past SDXL's size: a hires fix to Full HD (real detail); 4K then goes up the last step with ESRGAN
  const hires = resolution === "standard" ? undefined : targetSize(req.format ?? "portrait", "fullhd");
  // a given seed makes the same pictures again; none, a random start
  const first = req.seed ?? randomInt(2 ** 31 - 4);
  const ids: number[] = [];
  mkdirSync(join(job.dir, "work"), { recursive: true });
  for (let i = 1; i <= req.count; i++) {
    job.update({ state: "running", step: `Disegno l'immagine ${i}/${req.count}` });
    const seed = first + i - 1;
    const file = await eng.generate(req.prompt, seed, join(job.dir, "work", `img${i}.png`), style, req.negative, size, hires);
    if (resolution === "fullhd") await fitTo(file, exact);
    if (resolution === "4k") {
      job.update({ step: `Ingrandisco l'immagine ${i}/${req.count}` });
      await eng.upscale(file, exact);
    }
    ids.push((await eng.library.add(file, { prompt: req.prompt, tags: promptTags(req.prompt), style, seed, model: eng.modelName })).id);
  }
  writeFileSync(join(job.dir, "images.json"), JSON.stringify(ids), "utf8");
  rmSync(join(job.dir, "work"), { recursive: true, force: true });
  job.update({ state: "done", step: "Fatto", error: null });
}

export async function runJob(job: Job, eng: Engines): Promise<void> {
  const st = job.status();
  if (st.kind === "photo") {
    try {
      return await runPhotoJob(job, eng);
    } catch (e) {
      return fail(job, e);
    }
  }
  const at = (name: string) => join(job.dir, name);
  const opts = st.options ?? DEFAULT_OPTIONS;
  const limits = { avoid: opts.avoid, realPeople: opts.realPeople };
  try {
    const lib = eng.library;
    let story: Story;
    let plan: (number | null)[] | null = existsSync(at("plan.json")) ? JSON.parse(readFileSync(at("plan.json"), "utf8")) : null;
    if (existsSync(at("story.json"))) {
      story = parseStory(JSON.parse(readFileSync(at("story.json"), "utf8")));
    } else {
      job.update({ state: "running", step: "Avvio del modello locale" });
      let article: string | undefined;
      if (st.news) {
        job.update({ step: `Leggo l'articolo (${st.news.outlet})` });
        article = await eng.article(st.news);
        writeFileSync(at("article.txt"), article, "utf8");
      }
      [story, plan] = await eng.llm(async (run) => {
        job.update({ step: "Il modello ragiona sui fatti" });
        const notes = await researchNotes(st.topic, run, article);
        writeFileSync(at("notes.txt"), notes, "utf8");
        job.update({ step: "Il modello scrive la storia" });
        const s = await generateStory(st.topic, run, { notes, maxSeconds: eng.maxSeconds, newsText: article, realPeople: opts.realPeople });
        if (st.news) s.source = { outlet: st.news.outlet, title: st.news.title, url: st.news.url, published: st.news.published };
        writeFileSync(at("story.json"), JSON.stringify(s, null, 1), "utf8");
        job.update({ step: "Cerco immagini riusabili" });
        const p = await planImages(s, lib, opts.style, (prompt, c) => chooseImage(prompt, c, run));
        writeFileSync(at("plan.json"), JSON.stringify(p), "utf8");
        return [s, p] as const;
      });
    }
    plan ??= await planImages(story, lib, opts.style, null);
    job.update({ state: "running", title: story.title, step: "Immagini" });

    const assets = await produceImages(story, lib, plan, eng.generate, {
      style: opts.style, limits, seed: topicSeed(st.topic), model: eng.modelName, work: at("work"),
      progress: (i, n) => job.update({ step: `Disegno l'immagine ${i}/${n}` }),
    });
    writeFileSync(at("images.json"), JSON.stringify(assets.map((a) => a.id)), "utf8");
    rmSync(at("work"), { recursive: true, force: true });

    const clips: SceneAudio[] = [];
    for (const [i, scene] of story.scenes.entries()) {
      job.update({ step: `Voce narrante ${i + 1}/${story.scenes.length}` });
      clips.push(await eng.tts(scene.narration, st.voice, at(`s${String(i + 1).padStart(2, "0")}.mp3`)));
    }
    const tl = buildTimeline(clips);


    job.update({ step: `Montaggio (${Math.round(tl.total / tl.fps)} s di video)` });
    const raw = at("video_raw.mp4");
    await eng.render(job.dir, tl, assets.map((a) => a.path), story.scenes.map((s) => s.motion),
      st.captions, raw, (l) => job.log(l));
    job.update({ step: "Volume a -14 LUFS" });
    await eng.normalize(raw, at("video.mp4"));
    if (existsSync(raw)) unlinkSync(raw);
    job.update({ state: "done", step: "Fatto", error: null, duration: Math.round((tl.total / tl.fps) * 10) / 10 });
  } catch (e) {
    fail(job, e);
  }
}

/** at start nothing is running: a job left queued or half-way by a restart is marked interrupted, to retry by hand */
export function markInterrupted(root: string): number {
  let n = 0;
  for (const job of Job.list(root)) {
    const { state } = job.status();
    if (state !== "running" && state !== "queued") continue;
    job.update({ state: "error", step: "Errore", error: "Interrotto: l'app è stata riavviata. Premi Riprova." });
    n++;
  }
  return n;
}

export function defaultEngines(): Engines {
  return {
    llm: (fn) => withLlama(fn, { log: join(JOBS, "llama-server.log") }),
    generate: sdGenerator(DEFAULT_SD),
    tts: (text, voice, out) => synthesize(text, voice, out),
    library: new Library(LIBRARY),
    modelName: modelName(DEFAULT_SD),
    render: renderVideo,
    normalize: normalizeAudio,
    upscale: sdUpscaler(DEFAULT_SD),
    maxSeconds: 30,
    article: (item) => articleText(item),
  };
}
