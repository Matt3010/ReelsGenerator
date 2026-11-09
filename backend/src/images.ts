// Still pictures with stable-diffusion.cpp, reused from the library whenever a fitting one is already there.
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { Asset, Library } from "./library.js";
import { CONFIG } from "./config.js";
import { run as runProcess, type Run } from "./proc.js";
import { imagePrompt, negativeExtra, type Story } from "./spec.js";

// style name -> [positive prefix, negative prompt]; the style is part of the library key
export const STYLES: Record<string, [string, string]> = {
  toon: [
    "storybook cartoon illustration, flat colors, bold clean ink outlines, warm vintage palette, expressive faces, consistent style",
    "photo, realistic, 3d render, painting, text, letters, words, caption, watermark, signature, blurry, deformed, extra limbs",
  ],
};

export type Generator = (prompt: string, seed: number, out: string, style: string, negativeExtra: string) => Promise<string>;
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

export function sdCommand(cfg: SdConfig, prompt: string, seed: number, out: string, style: string, negExtra = ""): string[] {
  const [positive, negative] = STYLES[style];
  return [cfg.exe, "-m", cfg.model, "--vae", cfg.vae, "-p", `${positive}, ${prompt}`, "-n", negExtra ? `${negative}, ${negExtra}` : negative,
    "-W", String(cfg.width), "-H", String(cfg.height), "--steps", String(cfg.steps), "--cfg-scale", String(cfg.cfg),
    "--sampling-method", cfg.sampler, "--scheduler", cfg.scheduler, "--seed", String(seed), "--vae-tiling", "-o", out];
}

export function sdGenerator(cfg: SdConfig = DEFAULT_SD, run: Run = runProcess): Generator {
  return async (prompt, seed, out, style, negExtra) => {
    mkdirSync(dirname(out), { recursive: true });
    const r = await run(sdCommand(cfg, prompt, seed, out, style, negExtra));
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

export interface ProduceOptions { style: string; seed: number; model: string; work: string; progress?: (i: number, n: number) => void }

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
      const file = await generate(prompt, o.seed, join(o.work, `img${String(i + 1).padStart(2, "0")}.png`), o.style, negativeExtra(story));
      asset = await lib.add(file, { prompt, tags: scene.tags, style: o.style, seed: o.seed, model: o.model });
    }
    lib.markUsed(asset.id);
    out.push(lib.get(asset.id)!);
  }
  return out;
}
