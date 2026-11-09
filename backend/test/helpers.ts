import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

export const tmp = () => mkdtempSync(join(tmpdir(), "shorts-"));

export async function png(path: string, color: [number, number, number] = [200, 30, 30], size: [number, number] = [8, 14]) {
  await sharp({ create: { width: size[0], height: size[1], channels: 3, background: { r: color[0], g: color[1], b: color[2] } } })
    .png().toFile(path);
  return path;
}
