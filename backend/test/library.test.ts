import Database from "better-sqlite3";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { Library } from "../src/library.js";
import { png, tmp } from "./helpers.js";

const meta = { style: "toon", seed: 1, model: "m" };

it("migrations create the schema", () => {
  const lib = new Library(join(tmp(), "lib"));
  const tables = new Database(lib.dbPath).prepare("select name from sqlite_master where type='table'").all().map((r: any) => r.name);
  expect(tables).toEqual(expect.arrayContaining(["assets", "asset_tags", "__drizzle_migrations"]));
});

it("add copies the image and records it", async () => {
  const d = tmp();
  const lib = new Library(join(d, "lib"));
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "a red barn", tags: ["barn", "farm"], style: "toon", seed: 7, model: "dsxl" });
  expect(dirname(a.path)).toBe(lib.imagesDir);
  expect([a.width, a.height]).toEqual([8, 14]);
  expect(a.tags).toEqual(["barn", "farm"]);
  expect([a.seed, a.model, a.uses]).toEqual([7, "dsxl", 0]);
});

it("stores the same pixels once", async () => {
  const d = tmp();
  const lib = new Library(join(d, "lib"));
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "a red barn", tags: ["barn"], ...meta });
  const b = await lib.add(await png(join(d, "y.png")), { prompt: "a red barn", tags: ["barn"], ...meta });
  expect(a.id).toBe(b.id);
  expect(readdirSync(lib.imagesDir)).toHaveLength(1);
});

it("finds exact prompts ignoring case and spaces but not style", async () => {
  const d = tmp();
  const lib = new Library(join(d, "lib"));
  await lib.add(await png(join(d, "x.png")), { prompt: "A red  barn", tags: ["barn"], ...meta });
  expect(lib.findExact("a red barn", "toon")).not.toBeNull();
  expect(lib.findExact("a red barn", "photo")).toBeNull();
  expect(lib.findExact("a blue barn", "toon")).toBeNull();
});

it("ranks candidates by tag overlap", async () => {
  const d = tmp();
  const lib = new Library(join(d, "lib"));
  const barn = await lib.add(await png(join(d, "1.png"), [1, 1, 1]), { prompt: "barn", tags: ["barn", "farm", "day"], ...meta });
  const farm = await lib.add(await png(join(d, "2.png"), [2, 2, 2]), { prompt: "farm", tags: ["farm", "cows", "field", "day"], ...meta });
  await lib.add(await png(join(d, "3.png"), [3, 3, 3]), { prompt: "ship", tags: ["ship", "sea"], ...meta });
  await lib.add(await png(join(d, "4.png"), [4, 4, 4]), { prompt: "barn", tags: ["barn", "farm", "day"], ...meta, style: "photo" });
  expect(lib.candidates(["barn", "farm", "day"], "toon", 0.4).map((a) => a.id)).toEqual([barn.id, farm.id]);
});

it("counts uses", async () => {
  const d = tmp();
  const lib = new Library(join(d, "lib"));
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "barn", tags: ["barn"], ...meta });
  lib.markUsed(a.id);
  lib.markUsed(a.id);
  expect(lib.get(a.id)!.uses).toBe(2);
});

it("keeps the data when reopened", async () => {
  const d = tmp();
  const a = await new Library(join(d, "lib")).add(await png(join(d, "x.png")), { prompt: "barn", tags: ["barn"], ...meta });
  expect(new Library(join(d, "lib")).get(a.id)!.prompt).toBe("barn");
});

it("remembers which tags were used, how often and when", async () => {
  const lib = new Library(join(tmp(), "lib"));
  lib.recordTags({ subject: ["cat", "dog"], light: ["night"] });
  lib.recordTags({ subject: ["cat"] });
  const used = lib.usedTags();
  const cat = used.find((u) => u.tag === "cat")!;
  expect(cat).toMatchObject({ category: "subject", uses: 2 });
  expect(used.find((u) => u.tag === "dog")!.uses).toBe(1);
  expect(used.find((u) => u.tag === "night")!.category).toBe("light");
  expect(lib.recentTagSets()).toEqual([{ subject: ["cat"] }, { subject: ["cat", "dog"], light: ["night"] }]);
});

it("keeps only the latest tag sets", () => {
  const lib = new Library(join(tmp(), "lib"));
  for (let i = 0; i < 5; i++) lib.recordTags({ subject: [`s${i}`] });
  expect(lib.recentTagSets(2)).toEqual([{ subject: ["s4"] }, { subject: ["s3"] }]);
});

it("removes a picture: its file, its row and its tags", async () => {
  const d = tmp();
  const lib = new Library(join(d, "lib"));
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "barn", tags: ["barn"], ...meta });
  expect(lib.remove(a.id)).toBe(true);
  expect(lib.get(a.id)).toBeNull();
  expect(readdirSync(lib.imagesDir)).toHaveLength(0);
  expect(lib.candidates(["barn"], "toon", 0)).toEqual([]);
  expect(lib.remove(a.id)).toBe(false);
});
