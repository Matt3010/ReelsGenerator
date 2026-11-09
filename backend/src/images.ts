// Still pictures with stable-diffusion.cpp, reused from the library whenever a fitting one is already there.
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import sharp from "sharp";
import type { Asset, Library } from "./library.js";
import { CONFIG } from "./config.js";
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

/** the picture sizes on offer: vertical like the shorts, square, horizontal (SDXL's own shapes) */
export const FORMATS = { portrait: [768, 1344], square: [1024, 1024], landscape: [1344, 768] } as const satisfies Record<string, readonly [number, number]>;
export type Format = keyof typeof FORMATS;
type Size = readonly [number, number];

/** past SDXL's own size: drawn at its size, then enlarged (ESRGAN x4) and cut to the exact one; the long side */
export const RESOLUTIONS = { standard: null, fullhd: 1920, "4k": 3840 } as const;
export type Resolution = keyof typeof RESOLUTIONS;
const RATIOS: Record<Format, number> = { portrait: 9 / 16, square: 1, landscape: 16 / 9 };

/** the size a picture comes out at: SDXL's own for standard, else the exact aspect with the given long side */
export function targetSize(format: Format, resolution: Resolution): Size {
  const long = RESOLUTIONS[resolution];
  if (long === null) return FORMATS[format];
  const r = RATIOS[format];
  return r >= 1 ? [long, Math.round(long / r)] : [Math.round(long * r), long];
}

/**
 * (prompt, seed, out, style, negative, size, hires) -> the image; without a size, the config's (the shorts' 9:16).
 * With `hires`, a hires fix: drawn at `size`, then a second, light pass at about that larger size (real detail).
 */
export type Generator = (prompt: string, seed: number, out: string, style: string, negativeExtra: string, size?: Size,
  hires?: Size) => Promise<string>;

/** the hires fix's second pass: Lanczos up, then SDXL again with a light hand, at a size SDXL takes (multiples of 64) */
const HIRES_DENOISE = "0.35";
const up64 = (n: number) => Math.ceil(n / 64) * 64;
export type Chooser = (prompt: string, candidates: Asset[]) => Promise<number | null>;

export interface SdConfig {
  exe: string; model: string; vae: string; width: number; height: number; steps: number; cfg: number;
  sampler: string; scheduler: string;
  /** the ESRGAN model that enlarges a picture past SDXL's own size */
  esrgan?: string;
}

export const DEFAULT_SD: SdConfig = {
  exe: CONFIG.sdCli,
  model: join(CONFIG.models, "DreamShaperXL_Turbo_v2_1.safetensors"),
  vae: join(CONFIG.models, "sdxl.vae.safetensors"),
  esrgan: join(CONFIG.models, "RealESRGAN_x4plus.pth"),
  width: 768, height: 1344, steps: 8, cfg: 2, sampler: "dpm++2m", scheduler: "karras",
};

export const modelName = (cfg: SdConfig) => basename(cfg.model, extname(cfg.model));

export function sdCommand(cfg: SdConfig, prompt: string, seed: number, out: string, style: string, negExtra = "", size?: Size,
  hires?: Size): string[] {
  const [width, height] = size ?? [cfg.width, cfg.height];
  const { positive, negative } = STYLES[style as StyleId];
  return [cfg.exe, "-m", cfg.model, "--vae", cfg.vae, "-p", positive ? `${positive}, ${prompt}` : prompt, "-n", negExtra ? `${negative}, ${negExtra}` : negative,
    "-W", String(width), "-H", String(height), "--steps", String(cfg.steps), "--cfg-scale", String(cfg.cfg),
    "--sampling-method", cfg.sampler, "--scheduler", cfg.scheduler, "--seed", String(seed), "--vae-tiling", "-o", out,
    ...(hires ? ["--hires", "--hires-width", String(up64(hires[0])), "--hires-height", String(up64(hires[1])), "--hires-upscaler", "Lanczos",
      "--hires-denoising-strength", HIRES_DENOISE, "--hires-steps", String(cfg.steps)] : [])];
}

export function sdGenerator(cfg: SdConfig = DEFAULT_SD, run: Run = runProcess): Generator {
  return async (prompt, seed, out, style, negExtra, size, hires) => {
    mkdirSync(dirname(out), { recursive: true });
    const r = await run(sdCommand(cfg, prompt, seed, out, style, negExtra, size, hires));
    if (r.code !== 0 || !existsSync(out)) throw new Error(`sd.cpp exited ${r.code}: ${r.output.slice(-1500)}`);
    return out;
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

export function sdUpscaler(cfg: SdConfig = DEFAULT_SD, run: Run = runProcess): Upscaler {
  return async (file, [width, height]) => {
    const big = file.replace(/\.png$/i, "") + ".x4.png";
    const r = await run([cfg.exe, "-M", "upscale", "-i", file, "--upscale-model", cfg.esrgan ?? "", "-o", big]);
    if (r.code !== 0 || !existsSync(big)) throw new Error(`ESRGAN exited ${r.code}: ${r.output.slice(-1500)}`);
    renameSync(big, file);
    await fitTo(file, [width, height]);
  };
}

/** for every scene, the id of a library picture to reuse, or null when a new one must be drawn */
export async function planImages(story: Story, lib: Library, style: string, choose: Chooser | null, minOverlap = 0.5) {
  const plan: (number | null)[] = [];
  for (const scene of story.scenes) {
    const prompt = imagePrompt(story, scene);
    const exact = lib.findExact(prompt, style);
    if (exact) { plan.push(exact.id); continue; }
    const found = lib.candidates(scene.tags, style, minOverlap);
    const pick = found.length && choose ? await choose(prompt, found) : null;
    plan.push(pick !== null && found.some((a) => a.id === pick) ? pick : null);
  }
  return plan;
}

export interface ProduceOptions {
  style: string; seed: number; model: string; work: string; limits?: Limits; progress?: (i: number, n: number) => void;
}

/** draw what the plan leaves open (once per distinct prompt), store it in the library, count every use */
export async function produceImages(story: Story, lib: Library, plan: (number | null)[], generate: Generator, o: ProduceOptions) {
  mkdirSync(o.work, { recursive: true });
  const todo = plan.filter((p) => p === null).length;
  const out: Asset[] = [];
  let done = 0;
  for (const [i, scene] of story.scenes.entries()) {
    const prompt = imagePrompt(story, scene);
    let asset = plan[i] !== null ? lib.get(plan[i]!) : lib.findExact(prompt, o.style);
    if (!asset) {
      o.progress?.(++done, todo);
      const file = await generate(prompt, o.seed, join(o.work, `img${String(i + 1).padStart(2, "0")}.png`), o.style, negativeExtra(story, o.limits ?? DEFAULT_LIMITS));
      asset = await lib.add(file, { prompt, tags: scene.tags, style: o.style, seed: o.seed, model: o.model });
    }
    lib.markUsed(asset.id);
    out.push(lib.get(asset.id)!);
  }
  return out;
}
