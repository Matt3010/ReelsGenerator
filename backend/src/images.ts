// Still pictures with stable-diffusion.cpp.
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { CONFIG } from "./config.js";
import { FORMATS, modelById, type Size } from "./models.js";
import { run as runProcess, type Run } from "./proc.js";
import { DEFAULT_LIMITS, imagePrompt, negativeExtra, type Limits, type Story } from "./spec.js";

// what every picture must avoid, whatever the style
const CLEAN = "text, letters, words, caption, watermark, signature, blurry, deformed, extra limbs";
const style = (label: string, positive: string, negative = "") => ({ label, positive, negative: negative ? `${negative}, ${CLEAN}` : CLEAN });

/** the palette: the style is part of the library key, so a picture is reused only in its own style */
export const STYLES = {
  toon: style("Cartoon", "storybook cartoon illustration, flat colors, bold clean ink outlines, warm vintage palette, expressive faces, consistent style", "photo, realistic, 3d render, painting"),
  realistic: style("Realistico", "photorealistic photo, cinematic, natural light, sharp focus, detailed", "cartoon, illustration, drawing, anime, 3d render"),
  free: style("Libero", ""),
  cinematic: style("Cinematografico", "cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field, color graded", "cartoon, illustration, drawing"),
  vintagePhoto: style("Foto d'epoca", "vintage photograph, film grain, faded colors, sepia tones, old camera", "cartoon, illustration, modern, digital art"),
  noir: style("Noir", "film noir, black and white, high contrast, hard shadows, moody, 1940s cinema", "color, cartoon, bright"),
  watercolor: style("Acquerello", "watercolor painting, soft washes, paper texture, delicate brush strokes, gentle colors", "photo, 3d render, sharp lines"),
  oilPainting: style("Pittura a olio", "oil painting, visible brush strokes, rich colors, canvas texture, classical fine art", "photo, 3d render, cartoon"),
  pencil: style("Matita", "pencil sketch, graphite drawing, cross-hatching, paper texture, monochrome", "color, photo, 3d render"),
  ink: style("China", "ink drawing, black ink lines, pen and ink illustration, crisp linework, white paper", "color, photo, 3d render"),
  comic: style("Fumetto", "comic book art, bold inks, halftone dots, dynamic panel composition, vivid colors", "photo, realistic, 3d render"),
  anime: style("Anime", "anime style, cel shading, vibrant colors, detailed background, studio quality", "photo, realistic, 3d render, western cartoon"),
  pixel: style("Pixel art", "pixel art, 16-bit retro game style, limited palette, crisp pixels", "photo, realistic, smooth gradients, blurry pixels"),
  lowPoly: style("Low poly", "low poly 3d render, faceted geometry, flat shading, pastel colors, isometric", "photo, realistic, painting"),
  clay: style("Plastilina", "claymation, plasticine figures, stop motion, handmade clay texture, soft studio light", "photo, realistic, painting, flat"),
  render3d: style("3D", "3d render, octane render, soft global illumination, smooth materials, toy-like", "photo, painting, flat illustration"),
  paper: style("Carta ritagliata", "paper cut-out art, layered paper, craft collage, soft shadows between layers", "photo, realistic, 3d render, glossy"),
  ukiyoe: style("Ukiyo-e", "ukiyo-e woodblock print, japanese traditional art, flat colors, bold outlines, washi paper", "photo, 3d render, modern"),
  popArt: style("Pop art", "pop art, bold primary colors, ben-day dots, thick outlines, 1960s poster", "photo, realistic, muted colors"),
  flat: style("Vettoriale", "flat vector illustration, minimal shapes, clean geometric forms, limited color palette", "photo, realistic, texture, 3d render"),
  cyberpunk: style("Cyberpunk", "cyberpunk, neon lights, rain-soaked streets, futuristic city, magenta and cyan glow", "daylight, pastoral, cartoon"),
  fantasy: style("Fantasy", "epic fantasy concept art, painterly, magical atmosphere, volumetric light, highly detailed", "photo, modern, cartoon"),
  stainedGlass: style("Vetrata", "stained glass window, lead lines, jewel-toned glass, backlit, gothic", "photo, 3d render"),
  mosaic: style("Mosaico", "ancient roman mosaic, small stone tiles, tesserae, earthy colors", "photo, 3d render, smooth"),
} satisfies Record<string, { label: string; positive: string; negative: string }>;

export type StyleId = keyof typeof STYLES;

/**
 * where sd.cpp is: the step it is on and its speed, as it prints them ("2.51 s/it", or "1.31 it/s" when fast); the
 * phase: the steps of the drawing, the hires fix's second pass (SDXL), or the decoding to pixels (tile by tile)
 */
export type SdPhase = "encode" | "steps" | "hires" | "decode";
export interface SdProgress { step: number; steps: number; rate: string; phase: SdPhase }

// "  |=====>   | 1/4 -  27.93s/it - ETA 01:23": the number is padded; loading the weights prints MB/s, no step
const BAR = /(\d+)\/(\d+) -\s+([\d.]+)(s\/it|it\/s)/g;
// where sd.cpp's log says a phase begins
const PHASES: [RegExp, SdPhase][] = [[/generating image:/, "steps"], [/hires fix: upscaling/, "hires"], [/decoding \d+ latents/, "decode"]];

/** the last progress bar in a piece of sd.cpp's output, or null */
export function sdProgress(chunk: string, phase: SdPhase = "steps"): SdProgress | null {
  const last = [...chunk.matchAll(BAR)].at(-1);
  return last ? { step: Number(last[1]), steps: Number(last[2]), rate: `${last[3]} ${last[4]}`, phase } : null;
}

/** follows sd.cpp's output piece by piece: each bar with the phase the log last announced */
function phaseReader(report: (p: SdProgress) => void): (chunk: string) => void {
  // before "generating image": the starting picture (img2img) encoded to the model's space
  let phase: SdPhase = "encode";
  return (chunk) => {
    for (const piece of chunk.split(/\r|\n/)) {
      const marked = PHASES.find(([re]) => re.test(piece));
      if (marked) phase = marked[1];
      const p = sdProgress(piece, phase);
      if (p) report(p);
    }
  };
}

/** one picture to draw: what, in which style, with which model, how big (and, for SDXL, a hires fix to a larger size) */
export interface DrawRequest {
  prompt: string; seed: number; out: string; style: string;
  /** added to the style's negative words (only models that use guidance listen to it) */
  negative: string;
  model: string;
  /** without one, the shorts' 9:16 */
  size?: Size;
  /** a hires fix: drawn at `size`, then a second, light pass at about this larger size (real detail) */
  hires?: Size;
  /** img2img: the picture to start from (already at `size`), and how much to change it (0.1 a touch, 0.95 almost new) */
  init?: string;
  strength?: number;
  /** each step as sd.cpp takes it */
  progress?: (p: SdProgress) => void;
}

export type Generator = (req: DrawRequest) => Promise<string>;

/** the hires fix's second pass: Lanczos up, then SDXL again with a light hand, at a size SDXL takes (multiples of 64) */
const HIRES_DENOISE = "0.35";
const HIRES_STEPS = "8";
const up64 = (n: number) => Math.ceil(n / 64) * 64;

/** sd-cli's arguments: the model's weights and settings from MODELS_DIR (`dir`), then the picture itself */
export function sdCommand(exe: string, dir: string, r: DrawRequest): string[] {
  const model = modelById(r.model);
  const [width, height] = r.size ?? FORMATS.portrait;
  const { positive, negative } = STYLES[r.style as StyleId];
  return [exe, ...model.args(dir), "-p", positive ? `${positive}, ${r.prompt}` : r.prompt,
    ...(model.negative ? ["-n", r.negative ? `${negative}, ${r.negative}` : negative] : []),
    "-W", String(width), "-H", String(height), "--seed", String(r.seed), "-o", r.out,
    ...(r.init ? ["-i", r.init, "--strength", String(r.strength ?? 0.6)] : []),
    ...(r.hires ? ["--hires", "--hires-width", String(up64(r.hires[0])), "--hires-height", String(up64(r.hires[1])), "--hires-upscaler", "Lanczos",
      "--hires-denoising-strength", HIRES_DENOISE, "--hires-steps", HIRES_STEPS] : [])];
}

export function sdGenerator(exe = CONFIG.sdCli, dir = CONFIG.models, run: Run = runProcess): Generator {
  return async (r) => {
    mkdirSync(dirname(r.out), { recursive: true });
    const onOutput = r.progress && phaseReader(r.progress);
    const res = await run(sdCommand(exe, dir, r), { onOutput });
    if (res.code !== 0 || !existsSync(r.out)) throw new Error(`sd.cpp exited ${res.code}: ${res.output.slice(-1500)}`);
    return r.out;
  };
}

/** a picture cut in place to an exact size (cover: the few pixels the multiple of 64 added go) */
export async function fitTo(file: string, [width, height]: Size): Promise<void> {
  const exact = file + ".tmp.png";
  await sharp(file).resize(width, height, { fit: "cover", kernel: "lanczos3" }).png().toFile(exact);
  renameSync(exact, file);
}

/** enlarges a picture in place to an exact size: ESRGAN x4 with sd.cpp, then a cut (cover) to the size */
export type Upscaler = (file: string, size: Size) => Promise<void>;

export function sdUpscaler(exe = CONFIG.sdCli, esrgan = join(CONFIG.models, "RealESRGAN_x4plus.pth"), run: Run = runProcess): Upscaler {
  return async (file, [width, height]) => {
    const big = file.replace(/\.png$/i, "") + ".x4.png";
    const r = await run([exe, "-M", "upscale", "-i", file, "--upscale-model", esrgan, "-o", big]);
    if (r.code !== 0 || !existsSync(big)) throw new Error(`ESRGAN exited ${r.code}: ${r.output.slice(-1500)}`);
    renameSync(big, file);
    await fitTo(file, [width, height]);
  };
}

export interface DrawOptions {
  style: string; seed: number; model: string; work: string; limits?: Limits; progress?: (i: number, n: number) => void;
  /** the model's step on the picture being drawn */
  step?: (p: SdProgress) => void;
}

/**
 * A video's pictures: each distinct one drawn once, into the work folder, a file per scene (the same file where two
 * scenes show the same thing). They serve the render only: nothing is kept.
 */
export async function drawScenes(story: Story, generate: Generator, o: DrawOptions): Promise<string[]> {
  mkdirSync(o.work, { recursive: true });
  const prompts = story.scenes.map((scene) => imagePrompt(story, scene));
  const distinct = [...new Set(prompts)];
  const files = new Map<string, string>();
  for (const [i, prompt] of distinct.entries()) {
    o.progress?.(i + 1, distinct.length);
    files.set(prompt, await generate({ prompt, seed: o.seed, out: join(o.work, `img${String(i + 1).padStart(2, "0")}.png`), style: o.style,
      negative: negativeExtra(story, o.limits ?? DEFAULT_LIMITS), model: o.model, progress: o.step }));
  }
  return prompts.map((p) => files.get(p)!);
}
