// Downloads the models into MODELS_DIR when missing: npm run setup (the API container runs it at start)
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { CONFIG } from "./config.js";

const HF = "https://huggingface.co";

export interface Item {
  name: string;
  check: string;       // the file, relative to MODELS_DIR
  urls: string[];
  size?: number;       // expected bytes, to catch interrupted downloads
}

export const ITEMS: Item[] = [
  { name: "Qwen3-8B Q4_K_M", check: "Qwen3-8B-Q4_K_M.gguf", size: 5027783488,
    urls: [`${HF}/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf`] },
  { name: "DreamShaper XL Turbo v2.1", check: "DreamShaperXL_Turbo_v2_1.safetensors", size: 6939220250,
    urls: [`${HF}/Lykon/dreamshaper-xl-v2-turbo/resolve/main/DreamShaperXL_Turbo_v2_1.safetensors`] },
  { name: "SDXL VAE fp16-fix", check: "sdxl.vae.safetensors", size: 334641162,
    urls: [`${HF}/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl.vae.safetensors`] },
  { name: "RealESRGAN x4plus", check: "RealESRGAN_x4plus.pth", size: 67040989,
    urls: ["https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"] },
]

export function missing(root = CONFIG.models, items = ITEMS): Item[] {
  return items.filter((i) => {
    const p = join(root, i.check);
    return !existsSync(p) || (i.size !== undefined && statSync(p).size !== i.size);
  });
}

/** resumable: a partial file continues where it stopped */
async function download(url: string, dst: string): Promise<void> {
  mkdirSync(dirname(dst), { recursive: true });
  const have = existsSync(dst) ? statSync(dst).size : 0;
  const r = await fetch(url, { headers: have ? { range: `bytes=${have}-` } : {}, redirect: "follow" });
  if (r.status === 416) return;
  if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(dst, { flags: r.status === 206 ? "a" : "w" }));
}

async function install(item: Item, root = CONFIG.models): Promise<void> {
  for (const url of item.urls) {
    console.log(`  ${url.split("/").at(-1)}`);
    await download(url, join(root, item.check));
  }
}

async function main(): Promise<number> {
  const todo = missing();
  if (!todo.length) { console.log("Modelli e strumenti locali già presenti."); return 0; }
  for (const item of todo) {
    console.log(`Scarico ${item.name}…`);
    await install(item);
  }
  const left = missing();
  if (left.length) { console.log(`Download incompleti: ${left.map((i) => i.name).join(", ")}`); return 1; }
  console.log("Pronto.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main();
