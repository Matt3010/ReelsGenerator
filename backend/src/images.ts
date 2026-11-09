// Still pictures with stable-diffusion.cpp, reused from the library whenever a fitting one is already there.
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
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

/** (prompt, seed, out, style, negative, size) -> the image; without a size, the config's (the shorts' 9:16) */
export type Generator = (prompt: string, seed: number, out: string, style: string, negativeExtra: string, size?: Size) => Promise<string>;
export type Chooser = (prompt: string, candidates: Asset[]) => Promise<number | null>;

export interface SdConfig {
  exe: string; model: string; vae: string; width: number; height: number; steps: number; cfg: number;
  sampler: string; scheduler: string;
}

export const DEFAULT_SD: SdConfig = {
  exe: CONFIG.sdCli,
  model: join(CONFIG.models, "DreamShaperXL_Turbo_v2_1.safetensors"),
  vae: join(CONFIG.models, "sdxl.vae.safetensors"),
  width: 768, height: 1344, steps: 8, cfg: 2, sampler: "dpm++2m", scheduler: "karras",
};

export const modelName = (cfg: SdConfig) => basename(cfg.model, extname(cfg.model));

export function sdCommand(cfg: SdConfig, prompt: string, seed: number, out: string, style: string, negExtra = "", size?: Size): string[] {
  const [width, height] = size ?? [cfg.width, cfg.height];
  const { positive, negative } = STYLES[style as StyleId];
  return [cfg.exe, "-m", cfg.model, "--vae", cfg.vae, "-p", positive ? `${positive}, ${prompt}` : prompt, "-n", negExtra ? `${negative}, ${negExtra}` : negative,
    "-W", String(width), "-H", String(height), "--steps", String(cfg.steps), "--cfg-scale", String(cfg.cfg),
    "--sampling-method", cfg.sampler, "--scheduler", cfg.scheduler, "--seed", String(seed), "--vae-tiling", "-o", out];
}

export function sdGenerator(cfg: SdConfig = DEFAULT_SD, run: Run = runProcess): Generator {
  return async (prompt, seed, out, style, negExtra, size) => {
    mkdirSync(dirname(out), { recursive: true });
    const r = await run(sdCommand(cfg, prompt, seed, out, style, negExtra, size));
    if (r.code !== 0 || !existsSync(out)) throw new Error(`sd.cpp exited ${r.code}: ${r.output.slice(-1500)}`);
    return out;
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
