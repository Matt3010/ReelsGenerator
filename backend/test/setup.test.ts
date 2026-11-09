import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ITEMS, missing, type Item } from "../src/setup.js";
import { tmp } from "./helpers.js";

const FAKE: Item[] = [
  { name: "vae", check: "v.bin", urls: ["u"] },
  { name: "model", check: "m.bin", urls: ["u"], size: 100 },
];

it("everything is missing in an empty folder", () => {
  expect(missing(tmp()).map((i) => i.name)).toEqual(ITEMS.map((i) => i.name));
});

it("present files are not downloaded again", () => {
  const d = tmp();
  writeFileSync(join(d, "v.bin"), "vae");
  writeFileSync(join(d, "m.bin"), "x".repeat(100));
  expect(missing(d, FAKE)).toEqual([]);
});

it("a truncated model counts as missing", () => {
  const d = tmp();
  writeFileSync(join(d, "m.bin"), "x".repeat(10));
  expect(missing(d, FAKE).map((i) => i.name)).toEqual(["vae", "model"]);
});
