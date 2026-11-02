// Render test stills from one bundle: node scripts/stills.mjs <props.json> <outDir> <frame,frame,...> [scale]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const [propsPath, outDir, frameList, scaleArg] = process.argv.slice(2);
const inputProps = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const frames = frameList.split(",").map(Number);
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: inputProps.publicDir ?? null });
const composition = await selectComposition({ serveUrl, id: "Short", inputProps, chromiumOptions: { gl: "angle" } });
for (const frame of frames) {
  const output = path.join(outDir, `f${String(frame).padStart(5, "0")}.jpg`);
  await renderStill({ serveUrl, composition, frame, output, inputProps, scale: Number(scaleArg ?? 0.5), imageFormat: "jpeg", chromiumOptions: { gl: "angle" } });
  console.log(output);
}
