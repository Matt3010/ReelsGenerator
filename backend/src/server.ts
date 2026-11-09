// The API behind the web app (nginx serves the app and passes /api here): news, jobs, their videos.
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { Library } from "./library.js";
import { fetchNews, type NewsItem } from "./news.js";
import { STYLES, type StyleId } from "./images.js";
import { DEFAULT_MODEL, FORMATS, MODELS, RESOLUTIONS, type Format, type Resolution } from "./models.js";
import { DEFAULT_OPTIONS, JOBS, Job, defaultEngines, markInterrupted, onJobsChanged, runJob } from "./pipeline.js";
import { CONFIG } from "./config.js";
import { moveToStores } from "./move.js";
import { Sampler } from "./stats.js";
import { stores, videoKey, type Store } from "./storage.js";
import { VOICES } from "./tts.js";

const NewsRef = z.object({
  title: z.string(),
  url: z.url({ protocol: /^https?$/ }),
  published: z.string().default(""),
  outlet: z.string(),
  summary: z.string().default(""),
});

const Model = z.enum(MODELS.map((m) => m.id) as [string, ...string[]]).default(DEFAULT_MODEL);

const Options = z.object({
  style: z.enum(Object.keys(STYLES) as [StyleId, ...StyleId[]]).default(DEFAULT_OPTIONS.style),
  realPeople: z.boolean().default(DEFAULT_OPTIONS.realPeople),
  avoid: z.boolean().default(DEFAULT_OPTIONS.avoid),
  model: Model,
}).prefault({});

const NewJob = z.object({
  topic: z.string().trim().min(1, "topic is empty").transform((t) => t.slice(0, 300)),
  voice: z.string().refine((v) => v in VOICES, "unknown voice").default("en-US-GuyNeural"),
  captions: z.boolean().default(true),
  news: NewsRef.nullish(),
  options: Options,
});

// a picture: the prompt and the negative prompt as written (sd.cpp splits a long prompt into CLIP's chunks)
const PhotoJob = z.object({
  prompt: z.string().trim().min(1, "write a prompt").max(2000),
  negative: z.string().trim().max(2000).default(""),
  count: z.number().int().min(1).max(4).default(1),
  format: z.enum(Object.keys(FORMATS) as [Format, ...Format[]]).default("portrait"),
  seed: z.number().int().min(0).max(2 ** 31 - 5).nullable().default(null),
  resolution: z.enum(Object.keys(RESOLUTIONS) as [Resolution, ...Resolution[]]).default("standard"),
  model: Model,
  // img2img: a picture uploaded to silo (the key /api/uploads gave), and how much to change it
  init: z.object({ key: z.uuid(), strength: z.number().min(0.1).max(0.95) }).optional(),
});

export interface AppOptions {
  root?: string; runner?: (job: Job) => Promise<void>; news?: () => Promise<NewsItem[]>; library?: () => Library;
  /** a sampler of the machine for each page watching it, and how often (ms) */
  stats?: () => Pick<Sampler, "sample">; statsEvery?: number;
  /** where the finished videos are, and where the pages upload pictures (silo) */
  videos?: Store; uploads?: Store;
}

const JOB_ID = /^\d{8}-\d{6}-[0-9a-f]{6}$/;
/** the largest picture a page may upload */
const MAX_UPLOAD = 20 * 1024 * 1024;
/** a title as a file name: letters, digits, spaces and dashes */
const fileName = (title: string) => `${title.replace(/[^\p{L}\p{N} -]+/gu, "").replace(/\s+/g, " ").trim() || "video"}.mp4`;

export function createApp(o: AppOptions = {}) {
  const root = o.root ?? JOBS;
  const runner = o.runner ?? ((job: Job) => runJob(job, defaultEngines()));
  const news = o.news ?? (() => fetchNews());
  let lib: Library | undefined;
  const library = o.library ?? (() => (lib ??= new Library(CONFIG.library, stores().images)));
  const videos = () => o.videos ?? stores().videos;
  const uploads = () => o.uploads ?? stores().uploads;
  /** the host the page asked, port included: silo checks the signature against it (nginx passes it on) */
  const hostOf = (c: Context) => c.req.header("host") ?? "localhost";

  // one job at a time: the GPU holds one model at a time
  const queue: Job[] = [];
  let busy = false;
  const pump = async () => {
    if (busy) return;
    busy = true;
    for (let job = queue.shift(); job; job = queue.shift()) {
      try { await runner(job); } catch (e) { job.update({ state: "error", error: String(e) }); }
    }
    busy = false;
  };
  const enqueue = (job: Job) => { queue.push(job); void pump(); };

  const jobDir = (id: string) => (JOB_ID.test(id) && existsSync(join(root, id, "status.json")) ? join(root, id) : null);

  const app = new Hono();
  app.get("/api/voices", (c) => c.json(VOICES));
  // the app shows what the server knows: the palette and what a new job starts with
  app.get("/api/styles", (c) => c.json({
    styles: Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label })), defaults: DEFAULT_OPTIONS,
    models: MODELS.map(({ id, label, note, negative, minutes }) => ({ id, label, note, negative, minutes })) }));
  app.get("/api/news", async (c) => c.json(await news()));
  // the pages follow this: "changed" whenever a job does (they read /api/jobs again), a ping every 25 s
  // so a quiet stream is not taken for a dead one
  app.get("/api/events", (c) => streamSSE(c, async (stream) => {
    const stop = onJobsChanged(() => void stream.writeSSE({ data: "changed" }));
    const ping = setInterval(() => void stream.write(": ping\n\n"), 25_000);
    await new Promise<void>((done) => stream.onAbort(done));
    clearInterval(ping);
    stop();
  }));

  // the machine, like htop: a sample now and then every couple of seconds, only while a page watches
  app.get("/api/stats", (c) => streamSSE(c, async (stream) => {
    const sampler = (o.stats ?? (() => new Sampler()))();
    let open = true;
    stream.onAbort(() => { open = false; });
    while (open) {
      await stream.writeSSE({ data: JSON.stringify(await sampler.sample()) });
      await stream.sleep(o.statsEvery ?? 2000);
    }
  }));

  // the jobs, each with the links the page needs, signed for silo and for the host the page came from
  app.get("/api/jobs", async (c) => {
    const host = hostOf(c);
    return c.json(await Promise.all(Job.list(root).map(async (j) => {
      const st = j.status();
      const images = await Promise.all(j.images().map((id) => library().get(id)).filter((a) => a !== null)
        .map(async (a) => ({ id: a.id, url: await library().store.signedGet(a.key, host) })));
      const video = st.state === "done" && st.kind !== "photo" ? {
        url: await videos().signedGet(videoKey(j.id), host),
        download: await videos().signedGet(videoKey(j.id), host, { filename: fileName(st.title ?? j.id) }),
      } : undefined;
      // the picture it started from (img2img), for the before and after
      const photo = st.photo?.init ? { ...st.photo, init: { ...st.photo.init, url: await uploads().signedGet(st.photo.init.key, host) } } : st.photo;
      return { id: j.id, ...st, photo, images, video };
    })));
  });

  // a job (a video, or a photo job with its pictures still listed) gone; not while it is at work
  app.delete("/api/jobs/:id", async (c) => {
    const dir = jobDir(c.req.param("id"));
    if (!dir) return c.json({ detail: "job not found" }, 404);
    const job = new Job(dir);
    const { state } = job.status();
    if (state === "running" || state === "queued") return c.json({ detail: "è in lavorazione: si può eliminare quando ha finito" }, 409);
    await videos().remove(videoKey(job.id)).catch(() => {});
    job.remove();
    return c.json({ ok: true });
  });

  app.post("/api/photos", async (c) => {
    const parsed = PhotoJob.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ detail: z.prettifyError(parsed.error) }, 422);
    const photo = parsed.data;
    if (photo.init && !(await uploads().has(photo.init.key))) return c.json({ detail: "the starting picture is not there: upload it again" }, 422);
    const job = Job.create(root, { topic: photo.prompt, voice: "", captions: false, kind: "photo", photo });
    enqueue(job);
    return c.json({ id: job.id });
  });

  // a picture gone: from the library, and from the job that made it
  app.delete("/api/library/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || !(await library().remove(id))) return c.json({ detail: "no such picture" }, 404);
    for (const job of Job.list(root)) if (job.images().includes(id)) job.dropImage(id);
    return c.json({ ok: true });
  });

  // what a picture is: its prompt and seed (to make it again) and its size
  app.get("/api/library/:id", (c) => {
    const id = Number(c.req.param("id"));
    const asset = Number.isInteger(id) ? library().get(id) : null;
    if (!asset) return c.json({ detail: "no such picture" }, 404);
    return c.json({ id: asset.id, prompt: asset.prompt, seed: asset.seed, width: asset.width, height: asset.height, model: asset.model });
  });


  // a signed form post for one picture: the page sends it straight to silo, never through here
  app.post("/api/uploads", async (c) => {
    const key = randomUUID();
    return c.json({ key, ...(await uploads().signedUpload(key, { maxBytes: MAX_UPLOAD, contentType: "image/" })) });
  });

  app.post("/api/jobs", async (c) => {
    const parsed = NewJob.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ detail: z.prettifyError(parsed.error) }, 422);
    const job = Job.create(root, parsed.data);
    enqueue(job);
    return c.json({ id: job.id });
  });

  app.post("/api/jobs/:id/retry", (c) => {
    const dir = jobDir(c.req.param("id"));
    if (!dir) return c.json({ detail: "job not found" }, 404);
    const job = new Job(dir);
    job.update({ state: "queued", step: "In coda", error: null });
    enqueue(job);
    return c.json({ id: job.id });
  });

  app.get("/api/jobs/:id/story", (c) => {
    const dir = jobDir(c.req.param("id"));
    const file = dir && join(dir, "story.json");
    if (!file || !existsSync(file)) return c.json({ detail: "no story yet" }, 404);
    return c.json(JSON.parse(readFileSync(file, "utf8")));
  });


  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  mkdirSync(JOBS, { recursive: true });
  markInterrupted(JOBS);
  // silo: the buckets, then whatever pictures and videos are still on disk from before
  const all = stores();
  for (const store of Object.values(all)) await store.ensure();
  const moved = await moveToStores({ library: CONFIG.library, jobs: JOBS }, all);
  if (moved.images || moved.videos) console.log(`Moved to silo: ${moved.images} pictures, ${moved.videos} videos`);
  serve({ fetch: createApp().fetch, hostname: CONFIG.host, port: CONFIG.port });
  console.log(`Reels Generator API on http://${CONFIG.host}:${CONFIG.port}`);
}
