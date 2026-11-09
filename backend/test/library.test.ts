import Database from "better-sqlite3";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { Library, MIGRATIONS } from "../src/library.js";
import { png, tmp, DirStore } from "./helpers.js";

const meta = { style: "toon", seed: 1, model: "m" };

it("migrations create the schema", () => {
  const lib = new Library(join(tmp(), "lib"), new DirStore(join(tmp(), "store")));
  const tables = new Database(lib.dbPath).prepare("select name from sqlite_master where type='table'").all().map((r: any) => r.name);
  expect(tables).toEqual(expect.arrayContaining(["assets", "__drizzle_migrations"]));
});

it("add puts the image in the store and records it", async () => {
  const d = tmp();
  const store = new DirStore(join(d, "store"));
  const lib = new Library(join(d, "lib"), store);
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "a red barn", style: "toon", seed: 7, model: "dsxl" });
  expect(store.keys()).toEqual([a.key]);
  expect(a.key).toMatch(/^[0-9a-f]{16}.png$/);
  expect([a.width, a.height]).toEqual([8, 14]);
  expect([a.seed, a.model]).toEqual([7, "dsxl"]);
});

it("stores the same pixels once", async () => {
  const d = tmp();
  const store = new DirStore(join(d, "store"));
  const lib = new Library(join(d, "lib"), store);
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "a red barn", ...meta });
  const b = await lib.add(await png(join(d, "y.png")), { prompt: "a red barn", ...meta });
  expect(a.id).toBe(b.id);
  expect(store.keys()).toHaveLength(1);
});




it("keeps the data when reopened", async () => {
  const d = tmp();
  const a = await new Library(join(d, "lib"), new DirStore(join(d, "store"))).add(await png(join(d, "x.png")), { prompt: "barn", ...meta });
  expect(new Library(join(d, "lib"), new DirStore(join(d, "store"))).get(a.id)!.prompt).toBe("barn");
});

it("removes a picture: its file in the store and its row", async () => {
  const d = tmp();
  const store = new DirStore(join(d, "store"));
  const lib = new Library(join(d, "lib"), store);
  const a = await lib.add(await png(join(d, "x.png")), { prompt: "barn", ...meta });
  expect(await lib.remove(a.id)).toBe(true);
  expect(lib.get(a.id)).toBeNull();
  expect(store.keys()).toHaveLength(0);
  expect(await lib.remove(a.id)).toBe(false);
});


it("pictures drawn before the model choice are recorded as DreamShaper's", async () => {
  const d = tmp();
  // a library as it was before: only the migrations up to 0002, and a picture recorded then
  const old = join(d, "old-migrations");
  cpSync(MIGRATIONS, old, { recursive: true });
  const journal = JSON.parse(readFileSync(join(old, "meta", "_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 2);
  writeFileSync(join(old, "meta", "_journal.json"), JSON.stringify(journal));
  const before = new Library(join(d, "lib"), new DirStore(join(d, "store")), old);
  const db = new Database(before.dbPath);
  db.prepare("insert into assets (sha256, file, prompt, prompt_key, style, seed, model, width, height, uses, created_at) "
    + "values ('s', 'f.png', 'barn', 'barn', 'toon', 1, 'DreamShaperXL_Turbo_v2_1', 8, 14, 0, 0)").run();
  db.close();
  // opened with today's migrations
  expect(new Library(join(d, "lib"), new DirStore(join(d, "store"))).get(1)!.model).toBe("dreamshaper");
});
