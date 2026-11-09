import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NewsItem } from "../src/news.js";
import { Library } from "../src/library.js";
import { Job, onJobsChanged } from "../src/pipeline.js";
import { videoKey } from "../src/storage.js";
import { createApp } from "../src/server.js";
import { storyDict } from "./fixtures.js";
import { png, tmp, DirStore } from "./helpers.js";

async function waitFor(cond: () => boolean | Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

function make(news: () => Promise<NewsItem[]> = async () => []) {
  const root = tmp();
  const ran: string[] = [];
  const videos = new DirStore(join(root, "videos"), "reels-videos");
  const uploads = new DirStore(join(root, "uploads"), "reels-uploads");
  const runner = async (job: Job) => {
    ran.push(job.id);
    writeFileSync(join(root, "v.mp4"), "mp4-bytes");
    await videos.put(videoKey(job.id), join(root, "v.mp4"));
    job.update({ state: "done", title: "The Bridge: That Fell?" });
  };
  const app = createApp({ root, runner, news, videos, uploads });
  const post = (body: object) => app.request("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { app, root, ran, post, videos, uploads };
}


it("creates a job, runs it and lists it", async () => {
  const { app, ran, post } = make();
  const r = await post({ topic: "bridges", voice: "en-US-GuyNeural", captions: true });
  expect(r.status).toBe(200);
  const { id } = await r.json();
  expect(await waitFor(() => ran[0] === id)).toBe(true);
  const jobs = await (await app.request("/api/jobs")).json();
  expect(jobs[0].id).toBe(id);
  expect(jobs[0].topic).toBe("bridges");
  expect(await waitFor(async () => (await (await app.request("/api/jobs")).json())[0].state === "done")).toBe(true);
  // the finished video: links signed for silo and for the host the page came from, one to play, one to download by name
  const [done] = await (await app.request("/api/jobs", { headers: { host: "gen.example.work" } })).json();
  expect(done.video).toEqual({
    url: `/reels-videos/${id}.mp4?host=gen.example.work`,
    download: `/reels-videos/${id}.mp4?host=gen.example.work&name=The Bridge That Fell.mp4`,
  });
});

it("hands out a signed upload for one picture, straight to silo", async () => {
  const { app } = make();
  const r = await app.request("/api/uploads", { method: "POST" });
  expect(r.status).toBe(200);
  const up = await r.json();
  expect(up.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(up).toEqual({ key: up.key, url: "/reels-uploads", fields: { key: up.key, max: String(20 * 1024 * 1024), type: "image/" } });
});

it("rejects a blank topic, an unknown voice and a non-web news link", async () => {
  const { post } = make();
  expect((await post({ topic: "  ", voice: "en-US-GuyNeural", captions: true })).status).toBe(422);
  expect((await post({ topic: "x", voice: "robot", captions: true })).status).toBe(422);
  const bad = { title: "t", url: "file:///etc/passwd", published: "", outlet: "BBC", summary: "" };
  expect((await post({ topic: "x", voice: "en-US-GuyNeural", captions: true, news: bad })).status).toBe(422);
});

it("answers 404 for unknown jobs and path tricks", async () => {
  const { app } = make();
  expect((await app.request("/api/jobs/nope/story")).status).toBe(404);
  expect((await app.request("/api/jobs/20261109-120000-abcdef/story")).status).toBe(404);
  expect((await app.request("/api/jobs/..%2F..%2Fsecret/story")).status).toBe(404);
});

it("requeues on retry", async () => {
  const { app, ran, post } = make();
  const { id } = await (await post({ topic: "x", voice: "en-US-GuyNeural", captions: false })).json();
  await waitFor(() => ran.length === 1);
  expect((await app.request(`/api/jobs/${id}/retry`, { method: "POST" })).status).toBe(200);
  expect(await waitFor(() => ran.length === 2)).toBe(true);
});

it("serves the story once written", async () => {
  const { app, root, post } = make();
  const { id } = await (await post({ topic: "x", voice: "en-US-GuyNeural", captions: false })).json();
  expect((await app.request(`/api/jobs/${id}/story`)).status).toBe(404);
  writeFileSync(join(root, id, "story.json"), JSON.stringify(storyDict()));
  expect((await (await app.request(`/api/jobs/${id}/story`)).json()).title).toBe("The Bridge That Fell");
});

const ITEM: NewsItem = { title: "Bridge reopens", url: "https://bbc.co.uk/a1", published: "2026-11-09T07:26:09.000Z", outlet: "BBC News",
  summary: "The old bridge reopened." };

it("lists today's news", async () => {
  expect(await (await make(async () => [ITEM]).app.request("/api/news")).json()).toEqual([ITEM]);
});

it("starts a job from a news item", async () => {
  const { app, ran, post } = make();
  const { id } = await (await post({ topic: "Bridge reopens", voice: "en-US-GuyNeural", captions: true, news: ITEM })).json();
  await waitFor(() => ran[0] === id);
  expect((await (await app.request("/api/jobs")).json())[0].news.outlet).toBe("BBC News");
});

it("offers the voices", async () => {
  expect(Object.keys(await (await make().app.request("/api/voices")).json())).toContain("en-US-GuyNeural");
});

describe("photos", () => {
  const withLibrary = () => {
    const root = tmp();
    const ran: string[] = [];
    const library = new Library(join(root, "lib"), new DirStore(join(root, "store")));
    const uploads = new DirStore(join(root, "uploads"), "reels-uploads");
    const app = createApp({ root, runner: async (job) => { ran.push(job.id); job.update({ state: "done" }); }, news: async () => [], library: () => library,
      uploads });
    return { app, ran, library, root, uploads };
  };
  const postPhotos = (app: ReturnType<typeof createApp>, body: object) =>
    app.request("/api/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("queues a photo job with the prompt as written", async () => {
    const { app, ran } = withLibrary();
    const r = await postPhotos(app, { prompt: " a cat, 1920s, smiling ", negative: "dogs" });
    expect(r.status).toBe(200);
    const { id } = await r.json();
    expect(await waitFor(() => ran[0] === id)).toBe(true);
    const job = (await (await app.request("/api/jobs")).json())[0];
    expect(job).toMatchObject({ kind: "photo", topic: "a cat, 1920s, smiling",
      photo: { prompt: "a cat, 1920s, smiling", negative: "dogs", count: 1, format: "portrait", seed: null, resolution: "standard", model: "dreamshaper" } });
  });

  it("refuses an empty prompt and too many pictures, and takes a long prompt", async () => {
    const { app, root, uploads } = withLibrary();
    expect((await postPhotos(app, { prompt: " " })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", count: 9 })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat, ".repeat(250) })).status).toBe(200);
    expect((await postPhotos(app, { prompt: "x".repeat(2001) })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", format: "panorama" })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", seed: -1 })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", resolution: "8k" })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", resolution: "4k" })).status).toBe(200);
    expect((await postPhotos(app, { prompt: "a cat", model: "midjourney" })).status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", model: "krea2" })).status).toBe(200);
    expect((await postPhotos(app, { prompt: "a cat", format: "square", seed: 42, count: 4 })).status).toBe(200);
    // a starting picture: one uploaded, changed by 0.1-0.95
    await uploads.put("2b1e7c1a-0000-4000-8000-000000000001", await png(join(root, "u.png")), "image/png");
    const init = (key: string, strength: number) => postPhotos(app, { prompt: "a cat", init: { key, strength } });
    expect((await init("2b1e7c1a-0000-4000-8000-000000000001", 0.6)).status).toBe(200);
    expect((await init("2b1e7c1a-0000-4000-8000-000000000002", 0.6)).status).toBe(422);
    expect((await init("2b1e7c1a-0000-4000-8000-000000000001", 1.5)).status).toBe(422);
    expect((await init("../secret", 0.6)).status).toBe(422);
    // an NSFW model draws only from text
    const nsfw = await postPhotos(app, { prompt: "a cat", model: "lustify", init: { key: "2b1e7c1a-0000-4000-8000-000000000001", strength: 0.6 } });
    expect(nsfw.status).toBe(422);
    expect((await postPhotos(app, { prompt: "a cat", model: "lustify" })).status).toBe(200);
  });

  it("lists the pictures of a job and serves them", async () => {
    const { app, library, root } = withLibrary();
    const a = await library.add(await png(join(root, "x.png")), { prompt: "a cat", style: "toon", seed: 1, model: "m" });
    const { id } = await (await postPhotos(app, { prompt: "a cat" })).json();
    writeFileSync(join(root, id, "images.json"), JSON.stringify([a.id]));
    // each picture with its link, signed for silo and for the page's host
    const [job] = await (await app.request("/api/jobs", { headers: { host: "gen.example.work" } })).json();
    expect(job.images).toEqual([{ id: a.id, url: `/reels-test/${a.key}?host=gen.example.work` }]);
    expect(await (await app.request(`/api/library/${a.id}`)).json()).toEqual({ id: a.id, prompt: "a cat", seed: 1, width: 8, height: 14, model: "m" });
    expect((await app.request("/api/library/999")).status).toBe(404);
  });

  it("gives the starting picture of a job its signed link too, for the before and after", async () => {
    const { app, root, uploads } = withLibrary();
    const key = "2b1e7c1a-0000-4000-8000-000000000001";
    await uploads.put(key, await png(join(root, "u.png")), "image/png");
    await postPhotos(app, { prompt: "the same street at night", init: { key, strength: 0.6 } });
    const [job] = await (await app.request("/api/jobs", { headers: { host: "h" } })).json();
    expect(job.photo.init).toEqual({ key, strength: 0.6, url: `/reels-uploads/${key}?host=h` });
  });
});

describe("options", () => {
  it("lists the styles and the default choices, for the app to show", async () => {
    const body = await (await make().app.request("/api/styles")).json();
    expect(body.styles[0]).toEqual({ id: "toon", label: "Cartoon" });
    expect(body.styles.length).toBeGreaterThanOrEqual(18);
    expect(body.defaults).toEqual({ style: "toon", realPeople: false, avoid: true, model: "dreamshaper" });
    expect(body.models.map((m: { id: string }) => m.id)).toEqual(["dreamshaper", "zimage", "krea2", "juggernaut", "lustify", "lustify-krea"]);
    expect(body.models[1]).toEqual({ id: "zimage", label: "Z-Image Turbo", note: expect.any(String), negative: false, img2img: true,
      minutes: { standard: expect.any(Number), fullhd: expect.any(Number), "4k": expect.any(Number) } });
  });

  it("keeps the job's style and limits, with today's behaviour by default", async () => {
    const { app, post } = make();
    await post({ topic: "x", voice: "en-US-GuyNeural", captions: true });
    await post({ topic: "y", voice: "en-US-GuyNeural", captions: true, options: { style: "realistic", realPeople: true, avoid: false } });
    const [second, first] = await (await app.request("/api/jobs")).json();
    expect(first.options).toEqual({ style: "toon", realPeople: false, avoid: true, model: "dreamshaper" });
    expect(second.options).toEqual({ style: "realistic", realPeople: true, avoid: false, model: "dreamshaper" });
  });

  it("refuses an unknown style", async () => {
    const { post } = make();
    expect((await post({ topic: "x", voice: "en-US-GuyNeural", captions: true, options: { style: "oil", realPeople: false, avoid: true } })).status).toBe(422);
  });
});

describe("events", () => {
  it("streams a change whenever a job is created or moves on", async () => {
    const { app, post } = make();
    const r = await app.request("/api/events");
    expect(r.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = r.body!.getReader();
    const next = async () => new TextDecoder().decode((await reader.read()).value);
    await post({ topic: "x", voice: "en-US-GuyNeural", captions: true });
    expect(await next()).toContain("data: changed");
    await reader.cancel();
  });
});

describe("stats", () => {
  it("streams the machine's numbers, a sample right away and then every few seconds", async () => {
    let n = 0;
    const app = createApp({ root: tmp(), stats: () => ({ sample: async () => ({ gpu: null, cpu: ++n, cores: 2, mem: { used: 1, total: 2 }, procs: [] }) }),
      statsEvery: 10 });
    const r = await app.request("/api/stats");
    expect(r.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = r.body!.getReader();
    const next = async () => JSON.parse(new TextDecoder().decode((await reader.read()).value).replace(/^data: /, ""));
    expect((await next()).cpu).toBe(1);
    expect((await next()).cpu).toBe(2);
    await reader.cancel();
  });
});

it("a job tells whoever listens each time its state changes", () => {
  const root = tmp();
  let heard = 0;
  const stop = onJobsChanged(() => heard++);
  const job = Job.create(root, { topic: "x", voice: "v", captions: false });
  job.update({ step: "Voce narrante 1/3" });
  stop();
  job.update({ step: "Voce narrante 2/3" });
  expect(heard).toBe(2);
});

describe("deleting", () => {
  const withLibrary = () => {
    const root = tmp();
    const library = new Library(join(root, "lib"), new DirStore(join(root, "store")));
    const videos = new DirStore(join(root, "videos"), "reels-videos");
    const app = createApp({ root, runner: async (job) => job.update({ state: "done" }), news: async () => [], library: () => library, videos });
    return { app, library, root, videos };
  };
  const del = (app: ReturnType<typeof createApp>, path: string) => app.request(path, { method: "DELETE" });

  it("deletes a finished video, from silo too, and tells the pages", async () => {
    const { app, root, videos } = withLibrary();
    const job = Job.create(root, { topic: "x", voice: "v", captions: false });
    job.update({ state: "done" });
    writeFileSync(join(root, "v.mp4"), "mp4");
    await videos.put(videoKey(job.id), join(root, "v.mp4"));
    let heard = 0;
    const stop = onJobsChanged(() => heard++);
    expect((await del(app, `/api/jobs/${job.id}`)).status).toBe(200);
    stop();
    expect(existsSync(job.dir)).toBe(false);
    expect(videos.keys()).toEqual([]);
    expect(heard).toBe(1);
    expect((await del(app, `/api/jobs/${job.id}`)).status).toBe(404);
  });

  it("refuses to delete a job still at work", async () => {
    const { app, root } = withLibrary();
    const job = Job.create(root, { topic: "x", voice: "v", captions: false });
    job.update({ state: "running" });
    expect((await del(app, `/api/jobs/${job.id}`)).status).toBe(409);
    expect(existsSync(job.dir)).toBe(true);
  });

  it("deletes a picture from the library and from its job; the job goes with its last picture", async () => {
    const { app, library, root } = withLibrary();
    const a = await library.add(await png(join(root, "a.png"), [1, 1, 1]), { prompt: "a", style: "toon", seed: 1, model: "m" });
    const b = await library.add(await png(join(root, "b.png"), [2, 2, 2]), { prompt: "b", style: "toon", seed: 1, model: "m" });
    const job = Job.create(root, { topic: "a cat", voice: "", captions: false, kind: "photo", photo: { prompt: "a cat", negative: "", count: 2 } });
    job.update({ state: "done" });
    writeFileSync(join(job.dir, "images.json"), JSON.stringify([a.id, b.id]));
    expect((await del(app, `/api/library/${a.id}`)).status).toBe(200);
    expect(library.get(a.id)).toBeNull();
    expect(JSON.parse(readFileSync(join(job.dir, "images.json"), "utf8"))).toEqual([b.id]);
    expect((await del(app, `/api/library/${b.id}`)).status).toBe(200);
    expect(existsSync(job.dir)).toBe(false);
    expect((await del(app, "/api/library/999")).status).toBe(404);
  });
});
