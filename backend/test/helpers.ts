import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import type { Store } from "../src/storage.js";

export const tmp = () => mkdtempSync(join(tmpdir(), "shorts-"));

export async function png(path: string, color: [number, number, number] = [200, 30, 30], size: [number, number] = [8, 14]) {
  await sharp({ create: { width: size[0], height: size[1], channels: 3, background: { r: color[0], g: color[1], b: color[2] } } })
    .png().toFile(path);
  return path;
}

/** a Store in a folder, for the tests: the same contract as silo, links that say what they were signed for */
export class DirStore implements Store {
  constructor(readonly dir: string, readonly bucket = "reels-test") { mkdirSync(dir, { recursive: true }); }
  keys() { return readdirSync(this.dir).sort(); }
  async put(key: string, file: string, _type?: string) { copyFileSync(file, join(this.dir, key)); }
  async download(key: string, dst: string) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(join(this.dir, key), dst); }
  async has(key: string) { return existsSync(join(this.dir, key)); }
  async remove(key: string) { rmSync(join(this.dir, key), { force: true }); }
  async signedGet(key: string, host: string, o: { filename?: string } = {}) {
    return `/${this.bucket}/${key}?host=${host}${o.filename ? `&name=${o.filename}` : ""}`;
  }
  async signedUpload(key: string, o: { maxBytes: number; contentType: string }) {
    return { url: `/${this.bucket}`, fields: { key, max: String(o.maxBytes), type: o.contentType } };
  }
}
