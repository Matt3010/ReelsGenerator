// Downloads the models into MODELS_DIR when missing: npm run setup (the API container runs it at start)
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { CONFIG } from "./config.js";
import { MODELS, type Item } from "./models.js";

const HF = "https://huggingface.co";

/** the story model, then every image model's files (shared ones once), then ESRGAN for 4K */
export const ITEMS: Item[] = [
  { name: "Qwen3-8B Q4_K_M", check: "Qwen3-8B-Q4_K_M.gguf", size: 5027783488,
    urls: [`${HF}/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf`] },
  ...[...new Map(MODELS.flatMap((m) => m.files).map((f) => [f.check, f])).values()],
  { name: "RealESRGAN x4plus", check: "RealESRGAN_x4plus.pth", size: 67040989,
    urls: ["https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"] },
];

/** the headers a download needs: Civitai wants the account's key */
export function authHeaders(item: Item, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (item.auth !== "civitai") return {};
  if (!env.CIVITAI_TOKEN) throw new Error(`${item.name}: set CIVITAI_TOKEN in .env to download it from Civitai`);
  return { authorization: `Bearer ${env.CIVITAI_TOKEN}` };
}

export function missing(root = CONFIG.models, items = ITEMS): Item[] {
  return items.filter((i) => {
    const p = join(root, i.check);
    return !existsSync(p) || (i.size !== undefined && statSync(p).size !== i.size);
  });
}

/** resumable: a partial file continues where it stopped */
async function download(url: string, dst: string, auth: Record<string, string> = {}): Promise<void> {
  mkdirSync(dirname(dst), { recursive: true });
  const have = existsSync(dst) ? statSync(dst).size : 0;
  const r = await fetch(url, { headers: { ...auth, ...(have ? { range: `bytes=${have}-` } : {}) }, redirect: "follow" });
  if (r.status === 416) return;
  if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(dst, { flags: r.status === 206 ? "a" : "w" }));
}

async function install(item: Item, root = CONFIG.models): Promise<void> {
  for (const url of item.urls) {
    console.log(`  ${url.split("/").at(-1)}`);
    await download(url, join(root, item.check), authHeaders(item));
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
