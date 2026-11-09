// The short from still pictures: slow zoom/pan per scene, crossfades, word-timed captions (ASS) and the voice,
// encoded by ffmpeg; then loudness normalised.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { run } from "./proc.js";
import type { Motion } from "./spec.js";
import type { Timeline } from "./timeline.js";

export const SIZE: [number, number] = [1080, 1920];
const ZOOM = 1.18; // how far a zoom travels / how much room a pan has
const FADE = 8;    // crossfade frames between scenes
const YELLOW = "&H4DE1FF&", WHITE = "&HFFFFFF&"; // ASS colours are BGR

type Box = [number, number, number, number];
export interface Pic { data: Buffer; width: number; height: number } // raw RGB

const ease = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** the part of the w x h picture shown at time t (0..1) of the scene, always with the output aspect */
export function cropBox(motion: Motion, t: number, w: number, h: number, aspect = 9 / 16): Box {
  const [bw, bh] = w / h >= aspect ? [h * aspect, h] : [w, w / aspect]; // largest 9:16 box
  const e = ease(t);
  if (motion === "zoom_in" || motion === "zoom_out") {
    const s = 1 + (1 / ZOOM - 1) * (motion === "zoom_in" ? e : 1 - e);
    const cw = bw * s, ch = bh * s, x0 = (w - cw) / 2, y0 = (h - ch) / 2;
    return [x0, y0, x0 + cw, y0 + ch];
  }
  const cw = bw / ZOOM, ch = bh / ZOOM, sx = w - cw, sy = h - ch;
  let x0 = sx / 2, y0 = sy / 2;
  if (motion === "pan_left") x0 = sx * (1 - e);
  else if (motion === "pan_right") x0 = sx * e;
  else if (motion === "pan_up") y0 = sy * (1 - e);
  else if (motion === "pan_down") y0 = sy * e;
  return [x0, y0, x0 + cw, y0 + ch];
}

const input = (src: Buffer | Pic) =>
  Buffer.isBuffer(src) ? sharp(src) : sharp(src.data, { raw: { width: src.width, height: src.height, channels: 3 } });

/** sub-pixel crop + scale to raw RGB, so slow moves do not jitter */
export async function frameImage(src: Buffer | Pic, box: Box, size: [number, number] = SIZE): Promise<Buffer> {
  const [x0, y0, x1, y1] = box;
  const sx = size[0] / (x1 - x0), sy = size[1] / (y1 - y0);
  // sharp runs extract() before affine() in one pipeline, so the crop is a second pass
  const { data, info } = await input(src).removeAlpha()
    .affine([[sx, 0], [0, sy]], { odx: -x0 * sx, ody: -y0 * sy, interpolator: sharp.interpolators.bicubic })
    .raw().toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .extract({ left: 0, top: 0, width: Math.min(size[0], info.width), height: Math.min(size[1], info.height) })
    .resize(size[0], size[1], { fit: "fill" })
    .raw().toBuffer();
}

export function sceneIndex(tl: Timeline, frame: number): number {
  const i = tl.scenes.findIndex((s) => frame < s.start + s.frames);
  return i === -1 ? tl.scenes.length - 1 : i;
}

function blend(a: Buffer, b: Buffer, alpha: number): Buffer {
  const out = Buffer.allocUnsafe(b.length);
  for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * alpha + 0.5;
  return out;
}

async function* frames(tl: Timeline, pics: Pic[], motions: Motion[], ahead = 4): AsyncGenerator<Buffer> {
  const shot = (i: number, f: number) => {
    const s = tl.scenes[i], p = pics[i];
    return frameImage(p, cropBox(motions[i], (f - s.start) / Math.max(1, s.frames - 1), p.width, p.height));
  };
  const make = async (f: number) => {
    const i = sceneIndex(tl, f), into = f - tl.scenes[i].start;
    const im = await shot(i, f);
    return i > 0 && into < FADE ? blend(await shot(i - 1, f), im, (into + 1) / (FADE + 1)) : im;
  };
  const queue: Promise<Buffer>[] = [];
  for (let f = 0; f < tl.total; f++) {
    queue.push(make(f));
    if (queue.length > ahead) yield await queue.shift()!;
  }
  while (queue.length) yield await queue.shift()!;
}

// ------------------------------------------------------------------ captions

type FW = Timeline["scenes"][number]["words"][number];

function chunks(tl: Timeline): FW[][] {
  const out: FW[][] = [];
  let cur: FW[] = [];
  for (const w of tl.scenes.flatMap((s) => s.words)) {
    if (cur.length && w.start - cur[cur.length - 1].end > 8) { out.push(cur); cur = []; } // never across a pause
    cur.push(w);
    if (cur.length === 3 || cur.map((x) => x.text).join(" ").length > 16 || /[.,!?;:]$/.test(w.text)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

const ts = (frame: number, fps: number) => {
  const cs = Math.round((frame * 100) / fps);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(cs / 360000)}:${p(Math.floor(cs / 6000) % 60)}:${p(Math.floor(cs / 100) % 60)}.${p(cs % 100)}`;
};
const clean = (text: string) => text.replace(/[.,!?;:]+$/, "").toUpperCase().replace(/\{/g, "(").replace(/\}/g, ")");

export function assCaptions(tl: Timeline, width = SIZE[0], height = SIZE[1]): string {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial Black,104,&H00FFFFFF,&H00FFFFFF,&H001A0C12,&H59000000,1,0,0,0,100,100,1,0,1,10,6,8,70,70,${Math.round(height * 0.24)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines: string[] = [];
  const all = chunks(tl);
  all.forEach((chunk, ci) => {
    const next = all[ci + 1]?.[0].start;
    chunk.forEach((w, wi) => {
      const end = wi + 1 < chunk.length ? chunk[wi + 1].start : next === undefined ? w.end + 8 : Math.min(next, w.end + 8);
      const words = chunk.map((x) => (x === w ? `{\\c${YELLOW}}${clean(x.text)}{\\c${WHITE}}` : clean(x.text)));
      const pop = wi === 0 ? "{\\fscx88\\fscy88\\t(0,120,\\fscx100\\fscy100)}" : "";
      lines.push(`Dialogue: 0,${ts(w.start, tl.fps)},${ts(Math.max(end, w.start + 1), tl.fps)},Cap,,0,0,0,,${pop}${words.join(" ")}`);
    });
  });
  return head + lines.join("\n") + "\n";
}

// ------------------------------------------------------------------ audio

/** ffmpeg inputs (paths relative to the job folder) and the filter graph that ends in [aout] */
export function audioGraph(tl: Timeline, firstInput = 1): [string[], string] {
  const { fps } = tl, total = tl.total / fps;
  const inputs: string[] = [], parts: string[] = [], voices: string[] = [];
  const add = (path: string) => { inputs.push(path); return firstInput + inputs.length - 1; };
  tl.scenes.forEach((s, i) => {
    if (!s.audio) return;
    const n = add(s.audio);
    parts.push(`[${n}:a]atrim=start=${(s.audioTrim / fps).toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round((s.audioStart / fps) * 1000)}:all=1[v${i}]`);
    voices.push(`[v${i}]`);
  });
  parts.push(`${voices.join("")}amix=inputs=${voices.length}:normalize=0,apad,atrim=duration=${total.toFixed(3)}[aout]`);
  return [inputs, parts.join(";\n")];
}

// ------------------------------------------------------------------ encode

const loadPic = async (path: string): Promise<Pic> => {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

/** frames are piped to ffmpeg as raw RGB; paths in the graph are relative to jobDir (ffmpeg runs there) */
export async function renderVideo(jobDir: string, tl: Timeline, images: string[], motions: Motion[], captions: boolean,
  out: string, log: (line: string) => void = console.log): Promise<void> {
  const [inputs, agraph] = audioGraph(tl);
  if (captions) writeFileSync(join(jobDir, "captions.ass"), assCaptions(tl), "utf8");
  const vgraph = captions ? "[0:v]ass=captions.ass[vout]" : "[0:v]null[vout]";
  const args = ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${SIZE[0]}x${SIZE[1]}`, "-r", String(tl.fps), "-i", "-",
    ...inputs.flatMap((p) => ["-i", p]), "-filter_complex", `${vgraph};\n${agraph}`, "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", resolve(out)];
  const ff = spawn("ffmpeg", args, { cwd: jobDir, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  ff.stderr.on("data", (b: Buffer) => { err = (err + b.toString()).slice(-4000); });
  const done = new Promise<number>((r) => ff.on("close", (code) => r(code ?? -1)));
  ff.stdin.on("error", () => { /* ffmpeg died: its exit code and stderr tell why */ });
  const pics = await Promise.all(images.map(loadPic));
  let n = 0;
  for await (const frame of frames(tl, pics, motions)) {
    if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once("drain", r));
    if (n++ % (tl.fps * 5) === 0) log(`frame ${n - 1}/${tl.total}`);
    if (ff.exitCode !== null) break;
  }
  ff.stdin.end();
  if ((await done) !== 0) throw new Error(`ffmpeg failed: ${err}`);
}

/** two-pass EBU R128 loudness normalisation to the level short-video platforms play at; video is copied */
export async function normalizeAudio(src: string, dst: string, lufs = -14): Promise<void> {
  const probe = await run(["ffmpeg", "-hide_banner", "-i", src, "-af", `loudnorm=I=${lufs}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]);
  const m = JSON.parse([...probe.output.matchAll(/\{[^{}]*\}/g)].at(-1)![0]);
  const filter = `loudnorm=I=${lufs}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:`
    + `measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const r = await run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", filter, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", dst]);
  if (r.code !== 0) throw new Error(`loudness normalisation failed: ${r.output.slice(-1500)}`);
}
