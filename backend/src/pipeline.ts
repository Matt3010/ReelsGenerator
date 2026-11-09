// Topic -> story (local LLM) -> pictures (library or stable-diffusion.cpp) -> voice -> timeline -> ffmpeg,
// one folder per job.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { drawScenes, fitTo, sdGenerator, sdUpscaler, type Generator, type SdProgress, type StyleId, type Upscaler } from "./images.js";
import { DEFAULT_MODEL, drawPlan, modelById, type Format, type Resolution } from "./models.js";
import { Library } from "./library.js";
import { stores, videoKey, type Store } from "./storage.js";
import { generateStory, researchNotes, withLlama, type Runner } from "./llm.js";
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
  /** past the native size (Full HD, 4K): see drawPlan */
  resolution?: Resolution;
  /** the image model (MODELS); none, the default */
  model?: string;
}
/** the job's choices: the picture style, the image model and which limits apply (both kinds of job) */
export interface JobOptions { style: StyleId; realPeople: boolean; avoid: boolean; model?: string }
export const DEFAULT_OPTIONS: JobOptions = { style: "toon", realPeople: false, avoid: true, model: DEFAULT_MODEL };
export interface NewJob {
  topic: string; voice: string; captions: boolean; news?: NewsItem | null;
  kind?: "video" | "photo"; photo?: PhotoRequest; // a photo job: only pictures
  options?: JobOptions;
}
export interface JobStatus extends NewJob {
  state: "queued" | "running" | "done" | "error"; step: string; title: string | null; error: string | null; created: number;
  duration?: number;
  /** when the work began and ended (seconds, like created): the pages show how long it takes */
  started?: number; finished?: number;
  /** under the step, what the model is at (its step and speed); goes when the step changes */
  detail?: string;
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

  update(patch: Partial<JobStatus>) {
    const st = { ...this.status(), ...patch };
    const now = Date.now() / 1000;
    if (patch.step !== undefined && patch.detail === undefined) delete st.detail;
    if (patch.state === "queued") { delete st.started; delete st.finished; }
    if (patch.state === "running" && st.started === undefined) st.started = now;
    if (patch.state === "done" || patch.state === "error") st.finished = now;
    this.write(st);
  }

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
  /** where the finished videos go (silo) */
  videos: Store;
  render: typeof renderVideo;
  normalize: (src: string, dst: string) => Promise<void>;
  upscale: Upscaler;
  maxSeconds: number;
  article: (item: NewsItem) => Promise<string>;
}

/** "Disegno l'immagine 1/2" followed by the model's step and speed */
const PHASE_NAMES = { steps: "passo", hires: "rifinitura", decode: "decodifica" } as const;
/** the model's step and speed, under the job's step: "passo 3/8 · 2.51 s/it" */
const modelDetail = (p: SdProgress) => `${PHASE_NAMES[p.phase]} ${p.step}/${p.steps} · ${p.rate}`;

/** every failure reaches the UI (and the full trace the job log) */
function fail(job: Job, e: unknown): void {
  job.log(e instanceof Error ? e.stack ?? e.message : String(e));
  job.update({ state: "error", step: "Errore", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
}


/** only pictures: the prompt drawn count times as written (no style added, each with its own seed), kept in the library */
async function runPhotoJob(job: Job, eng: Engines): Promise<void> {
  const st = job.status();
  const req = st.photo!;
  const style = "free";
  const model = req.model ?? DEFAULT_MODEL;
  // past the native size: SDXL a hires fix to Full HD, the newer models Full HD directly; 4K then ESRGAN
  const plan = drawPlan(modelById(model), req.format ?? "portrait", req.resolution ?? "standard");
  // a given seed makes the same pictures again; none, a random start
  const first = req.seed ?? randomInt(2 ** 31 - 4);
  const ids: number[] = [];
  mkdirSync(join(job.dir, "work"), { recursive: true });
  for (let i = 1; i <= req.count; i++) {
    job.update({ state: "running", step: `Disegno l'immagine ${i}/${req.count}` });
    const seed = first + i - 1;
    const file = await eng.generate({ prompt: req.prompt, seed, out: join(job.dir, "work", `img${i}.png`), style, negative: req.negative,
      model, size: plan.size, hires: plan.hires, progress: (p) => job.update({ detail: modelDetail(p) }) });
    if (plan.upscale) {
      job.update({ step: `Ingrandisco l'immagine ${i}/${req.count}` });
      await eng.upscale(file, plan.exact);
    } else if (plan.exact !== plan.size) await fitTo(file, plan.exact);
    ids.push((await eng.library.add(file, { prompt: req.prompt, style, seed, model })).id);
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
  const model = opts.model ?? DEFAULT_MODEL;
  try {
    let story: Story;
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
      story = await eng.llm(async (run) => {
        job.update({ step: "Il modello ragiona sui fatti" });
        const notes = await researchNotes(st.topic, run, article);
        writeFileSync(at("notes.txt"), notes, "utf8");
        job.update({ step: "Il modello scrive la storia" });
        const s = await generateStory(st.topic, run, { notes, maxSeconds: eng.maxSeconds, newsText: article, realPeople: opts.realPeople });
        if (st.news) s.source = { outlet: st.news.outlet, title: st.news.title, url: st.news.url, published: st.news.published };
        writeFileSync(at("story.json"), JSON.stringify(s, null, 1), "utf8");
        return s;
      });
    }
    job.update({ state: "running", title: story.title, step: "Immagini" });

    // the pictures serve the render only: drawn into the work folder, gone with it
    const pictures = await drawScenes(story, eng.generate, {
      style: opts.style, limits, seed: topicSeed(st.topic), model, work: at("work"),
      progress: (i, n) => job.update({ step: `Disegno l'immagine ${i}/${n}` }),
      step: (p) => job.update({ detail: modelDetail(p) }),
    });

    const clips: SceneAudio[] = [];
    for (const [i, scene] of story.scenes.entries()) {
      job.update({ step: `Voce narrante ${i + 1}/${story.scenes.length}` });
      clips.push(await eng.tts(scene.narration, st.voice, at(`s${String(i + 1).padStart(2, "0")}.mp3`)));
    }
    const tl = buildTimeline(clips);


    job.update({ step: `Montaggio (${Math.round(tl.total / tl.fps)} s di video)` });
    const raw = at("video_raw.mp4");
    await eng.render(job.dir, tl, pictures, story.scenes.map((s) => s.motion), st.captions, raw, (l) => job.log(l));
    rmSync(at("work"), { recursive: true, force: true });
    job.update({ step: "Volume a -14 LUFS" });
    await eng.normalize(raw, at("video.mp4"));
    if (existsSync(raw)) unlinkSync(raw);
    // the finished video lives in silo; the pages get a signed link to it
    await eng.videos.put(videoKey(job.id), at("video.mp4"), "video/mp4");
    unlinkSync(at("video.mp4"));
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
    generate: sdGenerator(),
    tts: (text, voice, out) => synthesize(text, voice, out),
    library: new Library(LIBRARY, stores().images),
    videos: stores().videos,
    render: renderVideo,
    normalize: normalizeAudio,
    upscale: sdUpscaler(),
    maxSeconds: 30,
    article: (item) => articleText(item),
  };
}
