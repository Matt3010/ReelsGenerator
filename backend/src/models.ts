// The image models on offer: what each needs on disk, how sd.cpp runs it, and how it reaches a given size.
import { posix } from "node:path";

// the paths go to sd.cpp, which runs in Linux (Docker); forward slashes work on Windows too
const join = posix.join;

const HF = "https://huggingface.co";

/** a file a model needs in MODELS_DIR (downloaded by setup when missing) */
export interface Item {
  name: string;
  check: string;       // the file, relative to MODELS_DIR
  urls: string[];
  size?: number;       // expected bytes, to catch interrupted downloads
  /** whose key the download needs (from the environment) */
  auth?: "civitai";
}

export type Size = readonly [number, number];
export type Format = "portrait" | "square" | "landscape";
export type Resolution = "standard" | "fullhd" | "4k";

export interface ImageModel {
  id: string;
  label: string;
  /** a line for the menu: what it is good at, how long it takes */
  note: string;
  files: Item[];
  /** the weights and its own settings (steps, guidance, sampler), as sd-cli arguments; `init`: starting from a photo */
  args: (dir: string, o?: { init?: boolean }) => string[];
  /** the longest side it draws well by itself; past it, the hires fix (SDXL) or ESRGAN */
  maxSide: number;
  /** SDXL's way past its size: a second, light pass at the larger size */
  hiresFix: boolean;
  /** run without guidance, a model ignores the negative prompt */
  negative: boolean;
  /** may start from an uploaded photo; never the NSFW ones: no real person's photo made explicit */
  img2img: boolean;
  /** about how long one picture takes on the GTX 1060, by resolution (measured), for the menu */
  minutes: Record<Resolution, number>;
}

/**
 * An SDXL checkpoint from Civitai, as its authors suggest it: no turbo, so 30 steps at a guidance of 4.5 (slower than
 * DreamShaper's 8). NSFW-capable: text only.
 */
function sdxlFromCivitai(m: { id: string; label: string; note: string; file: string; download: string; size?: number }): ImageModel {
  return {
    id: m.id, label: m.label, note: m.note,
    files: [{ name: m.label, check: m.file, size: m.size, auth: "civitai", urls: [`https://civitai.com/api/download/models/${m.download}`] }, VAE_SDXL],
    args: (dir) => ["-m", join(dir, m.file), "--vae", join(dir, "sdxl.vae.safetensors"), "--steps", "30", "--cfg-scale", "4.5",
      "--sampling-method", "dpm++2m", "--scheduler", "karras", "--vae-tiling"],
    maxSide: 1344, hiresFix: true, negative: true, img2img: false,
    // measured with Juggernaut: 5 min at 768x1344, 30 steps
    minutes: { standard: 5, fullhd: 9, "4k": 12 },
  };
}

/** Krea 2's text model and VAE: LUSTIFY v10 is built on Krea 2 and uses them too */
const KREA_TEXT: Item = { name: "Qwen3-VL 4B (Krea text)", check: "Qwen3VL-4B-Instruct-Q4_K_M.gguf", size: 2497281664,
  urls: [`${HF}/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf`] };
const KREA_VAE: Item = { name: "Wan 2.1 VAE", check: "wan_2.1_vae.safetensors", size: 253815318,
  urls: [`${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors`] };

const VAE_SDXL: Item = { name: "SDXL VAE fp16-fix", check: "sdxl.vae.safetensors", size: 334641162,
  urls: [`${HF}/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl.vae.safetensors`] };

export const MODELS: ImageModel[] = [
  {
    id: "dreamshaper",
    label: "DreamShaper XL Turbo",
    note: "SDXL, il più veloce",
    files: [
      { name: "DreamShaper XL Turbo v2.1", check: "DreamShaperXL_Turbo_v2_1.safetensors", size: 6939220250,
        urls: [`${HF}/Lykon/dreamshaper-xl-v2-turbo/resolve/main/DreamShaperXL_Turbo_v2_1.safetensors`] },
      VAE_SDXL,
    ],
    // from a photo, euler_a: dpm++2m karras overcooks an img2img at so few steps (tried on the lighthouse)
    args: (dir, o = {}) => ["-m", join(dir, "DreamShaperXL_Turbo_v2_1.safetensors"), "--vae", join(dir, "sdxl.vae.safetensors"),
      "--steps", "8", "--cfg-scale", "2", "--sampling-method", o.init ? "euler_a" : "dpm++2m", "--scheduler", o.init ? "discrete" : "karras",
      "--vae-tiling"],
    maxSide: 1344,
    hiresFix: true,
    negative: true,
    img2img: true,
    minutes: { standard: 1.5, fullhd: 5, "4k": 10 },
  },
  {
    id: "zimage",
    label: "Z-Image Turbo",
    note: "foto realistiche, scritte leggibili",
    minutes: { standard: 2.5, fullhd: 6, "4k": 9 },
    files: [
      { name: "Z-Image Turbo Q4_K", check: "z_image_turbo-Q4_K.gguf", size: 3864250304,
        urls: [`${HF}/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf`] },
      { name: "Qwen3 4B (Z-Image text)", check: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf", size: 2497281120,
        urls: [`${HF}/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`] },
      { name: "FLUX VAE", check: "flux_ae.safetensors", size: 335304388,
        urls: [`${HF}/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors`] },
    ],
    args: (dir) => ["--diffusion-model", join(dir, "z_image_turbo-Q4_K.gguf"), "--llm", join(dir, "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"),
      "--vae", join(dir, "flux_ae.safetensors"), "--steps", "8", "--cfg-scale", "1", "--offload-to-cpu", "--vae-tiling"],
    maxSide: 2048,
    hiresFix: false,
    negative: false,
    img2img: true,
  },
  {
    id: "krea2",
    label: "Krea 2 Turbo",
    note: "estetica fotografica (licenza Krea 2 Community)",
    minutes: { standard: 4, fullhd: 9.5, "4k": 12.5 },
    files: [
      { name: "Krea 2 Turbo Q4_K_M", check: "Krea-2-Turbo-Q4_K_M.gguf", size: 7216993376,
        urls: [`${HF}/realrebelai/KREA-2_GGUFs/resolve/main/TURBO/Krea-2-Turbo-Q4_K_M.gguf`] },
      KREA_TEXT,
      KREA_VAE,
    ],
    args: (dir) => ["--diffusion-model", join(dir, "Krea-2-Turbo-Q4_K_M.gguf"), "--llm", join(dir, "Qwen3VL-4B-Instruct-Q4_K_M.gguf"),
      "--vae", join(dir, "wan_2.1_vae.safetensors"), "--steps", "8", "--cfg-scale", "1", "--offload-to-cpu", "--vae-tiling"],
    maxSide: 2048,
    hiresFix: false,
    negative: false,
    img2img: true,
  },
  sdxlFromCivitai({
    id: "juggernaut", label: "Juggernaut XL", note: "SDXL fotorealistico, anche NSFW (solo da testo)",
    file: "JuggernautXL_Ragnarok_ByRunDiffusion.safetensors", download: "1759168?fileId=1659952", size: 7105350162,
  }),
  sdxlFromCivitai({
    id: "lustify", label: "LUSTIFY! v9", note: "SDXL NSFW fotorealistico (solo da testo)",
    file: "lustify_v9_finalsdxl_.safetensors", download: "3045803?fileId=2924520", size: 6938143490,
  }),
  {
    id: "lustify-krea",
    label: "LUSTIFY! v10 Krea",
    note: "NSFW su Krea 2 Turbo, il più nuovo (solo da testo)",
    files: [
      { name: "LUSTIFY v10 Krea Turbo Q4_0", check: "lustify-v10-krea-turbo-Q4_0.gguf", size: 8311164960, auth: "civitai",
        urls: ["https://civitai.com/api/download/models/3112728?fileId=3002352"] },
      KREA_TEXT,
      KREA_VAE,
    ],
    args: (dir) => ["--diffusion-model", join(dir, "lustify-v10-krea-turbo-Q4_0.gguf"), "--llm", join(dir, "Qwen3VL-4B-Instruct-Q4_K_M.gguf"),
      "--vae", join(dir, "wan_2.1_vae.safetensors"), "--steps", "8", "--cfg-scale", "1", "--offload-to-cpu", "--vae-tiling"],
    maxSide: 2048,
    hiresFix: false,
    negative: false,
    img2img: false,
    // measured: 4 min at 768x1344, like Krea 2
    minutes: { standard: 4, fullhd: 9.5, "4k": 12.5 },
  },
];

export const DEFAULT_MODEL = "dreamshaper";

export function modelById(id: string): ImageModel {
  const model = MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`unknown image model: ${id}`);
  return model;
}

/** the shapes every model draws natively (about a megapixel) */
export const FORMATS: Record<Format, Size> = { portrait: [768, 1344], square: [1024, 1024], landscape: [1344, 768] };
/** the long side of each resolution past the native one */
export const RESOLUTIONS: Record<Resolution, number | null> = { standard: null, fullhd: 1920, "4k": 3840 };
const RATIOS: Record<Format, number> = { portrait: 9 / 16, square: 1, landscape: 16 / 9 };

/** the size a picture comes out at: native for standard, else the exact aspect with the given long side */
export function targetSize(format: Format, resolution: Resolution): Size {
  const long = RESOLUTIONS[resolution];
  if (long === null) return FORMATS[format];
  const r = RATIOS[format];
  return r >= 1 ? [long, Math.round(long / r)] : [Math.round(long * r), long];
}

const up16 = (n: number) => Math.ceil(n / 16) * 16;

/**
 * How a model reaches a size: `size` drawn (plus a `hires` second pass to that size for SDXL), then ESRGAN when
 * `upscale`, and a cut to `exact`. The newer models draw up to their maxSide directly.
 */
export interface DrawPlan { size: Size; hires?: Size; upscale?: true; exact: Size }

export function drawPlan(model: ImageModel, format: Format, resolution: Resolution): DrawPlan {
  const exact = targetSize(format, resolution);
  if (resolution === "standard") return { size: FORMATS[format], exact };
  const fullhd = targetSize(format, "fullhd");
  const tail = resolution === "4k" ? { upscale: true as const } : {};
  if (model.hiresFix) return { size: FORMATS[format], hires: fullhd, ...tail, exact };
  return { size: [up16(fullhd[0]), up16(fullhd[1])], ...tail, exact };
}
