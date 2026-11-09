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
  /** the weights and its own settings (steps, guidance, sampler), as sd-cli arguments */
  args: (dir: string) => string[];
  /** the longest side it draws well by itself; past it, the hires fix (SDXL) or ESRGAN */
  maxSide: number;
  /** SDXL's way past its size: a second, light pass at the larger size */
  hiresFix: boolean;
  /** run without guidance, a model ignores the negative prompt */
  negative: boolean;
  /** about how long one picture takes on the GTX 1060, by resolution (measured), for the menu */
  minutes: Record<Resolution, number>;
}

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
    args: (dir) => ["-m", join(dir, "DreamShaperXL_Turbo_v2_1.safetensors"), "--vae", join(dir, "sdxl.vae.safetensors"),
      "--steps", "8", "--cfg-scale", "2", "--sampling-method", "dpm++2m", "--scheduler", "karras", "--vae-tiling"],
    maxSide: 1344,
    hiresFix: true,
    negative: true,
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
  },
  {
    id: "krea2",
    label: "Krea 2 Turbo",
    note: "estetica fotografica (licenza Krea 2 Community)",
    minutes: { standard: 4, fullhd: 9.5, "4k": 12.5 },
    files: [
      { name: "Krea 2 Turbo Q4_K_M", check: "Krea-2-Turbo-Q4_K_M.gguf", size: 7216993376,
        urls: [`${HF}/realrebelai/KREA-2_GGUFs/resolve/main/TURBO/Krea-2-Turbo-Q4_K_M.gguf`] },
      { name: "Qwen3-VL 4B (Krea text)", check: "Qwen3VL-4B-Instruct-Q4_K_M.gguf", size: 2497281664,
        urls: [`${HF}/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf`] },
      { name: "Wan 2.1 VAE", check: "wan_2.1_vae.safetensors", size: 253815318,
        urls: [`${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors`] },
    ],
    args: (dir) => ["--diffusion-model", join(dir, "Krea-2-Turbo-Q4_K_M.gguf"), "--llm", join(dir, "Qwen3VL-4B-Instruct-Q4_K_M.gguf"),
      "--vae", join(dir, "wan_2.1_vae.safetensors"), "--steps", "8", "--cfg-scale", "1", "--offload-to-cpu", "--vae-tiling"],
    maxSide: 2048,
    hiresFix: false,
    negative: false,
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
