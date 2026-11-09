import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { moveToStores } from "../src/move.js";
import { DirStore, tmp } from "./helpers.js";

it("moves the pictures and videos still on disk into their stores, once", async () => {
  const d = tmp();
  const library = join(d, "library");
  const jobs = join(d, "jobs");
  mkdirSync(join(library, "images"), { recursive: true });
  writeFileSync(join(library, "images", "abc.png"), "png");
  mkdirSync(join(jobs, "20261109-120000-aaaaaa"), { recursive: true });
  writeFileSync(join(jobs, "20261109-120000-aaaaaa", "video.mp4"), "mp4");
  mkdirSync(join(jobs, "20261109-130000-bbbbbb"), { recursive: true }); // a job without a video yet
  const images = new DirStore(join(d, "s-images"));
  const videos = new DirStore(join(d, "s-videos"));

  expect(await moveToStores({ library, jobs }, { images, videos })).toEqual({ images: 1, videos: 1 });
  expect(images.keys()).toEqual(["abc.png"]);
  expect(videos.keys()).toEqual(["20261109-120000-aaaaaa.mp4"]);
  expect(existsSync(join(library, "images", "abc.png"))).toBe(false);
  expect(existsSync(join(jobs, "20261109-120000-aaaaaa", "video.mp4"))).toBe(false);

  expect(await moveToStores({ library, jobs }, { images, videos })).toEqual({ images: 0, videos: 0 });
});
