// Once, at start: the pictures and videos made before silo, from the disk into their buckets (then off the disk).
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./storage.js";
import { videoKey } from "./storage.js";

export async function moveToStores(dirs: { library: string; jobs: string }, stores: { images: Store; videos: Store }) {
  const moved = { images: 0, videos: 0 };
  const images = join(dirs.library, "images");
  if (existsSync(images)) {
    for (const name of readdirSync(images)) {
      await stores.images.put(name, join(images, name), name.endsWith(".png") ? "image/png" : "image/jpeg");
      rmSync(join(images, name));
      moved.images++;
    }
  }
  if (existsSync(dirs.jobs)) {
    for (const id of readdirSync(dirs.jobs)) {
      const video = join(dirs.jobs, id, "video.mp4");
      if (!existsSync(video)) continue;
      await stores.videos.put(videoKey(id), video, "video/mp4");
      rmSync(video);
      moved.videos++;
    }
  }
  return moved;
}
