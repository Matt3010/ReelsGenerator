// The generated pictures: the PNGs in a store (silo), an SQLite index in <root> (Drizzle ORM, migrations in drizzle/).
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { assets } from "./db.js";
import type { Store } from "./storage.js";

export const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface Asset {
  /** the file's name in the store */
  id: number; key: string; prompt: string; style: string; seed: number; model: string; width: number; height: number;
}
export interface AssetMeta { prompt: string; style: string; seed: number; model: string }

export class Library {
  readonly dbPath: string;
  private db: BetterSQLite3Database;

  /** `migrations`: another folder, only for a test that needs a library as it was */
  constructor(readonly root: string, readonly store: Store, migrations = MIGRATIONS) {
    mkdirSync(root, { recursive: true });
    this.dbPath = join(root, "library.sqlite");
    const sqlite = new Database(this.dbPath);
    sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(sqlite);
    migrate(this.db, { migrationsFolder: migrations });
  }

  private toAsset(row: typeof assets.$inferSelect): Asset {
    return { id: row.id, key: row.file, prompt: row.prompt, style: row.style, seed: row.seed, model: row.model,
      width: row.width, height: row.height };
  }

  async add(image: string, meta: AssetMeta): Promise<Asset> {
    const sha = createHash("sha256").update(readFileSync(image)).digest("hex");
    const existing = this.db.select().from(assets).where(eq(assets.sha256, sha)).get();
    if (existing) return this.toAsset(existing);
    const file = `${sha.slice(0, 16)}${extname(image).toLowerCase() || ".png"}`;
    const { width = 0, height = 0 } = await sharp(image).metadata();
    await this.store.put(file, image, file.endsWith(".png") ? "image/png" : "image/jpeg");
    const row = this.db.insert(assets).values({ sha256: sha, file, prompt: meta.prompt, style: meta.style, seed: meta.seed,
      model: meta.model, width, height, createdAt: new Date() }).returning().get();
    return this.toAsset(row);
  }

  get(id: number): Asset | null {
    const row = this.db.select().from(assets).where(eq(assets.id, id)).get();
    return row ? this.toAsset(row) : null;
  }

  /** a picture gone for good: its file and its row; false when there was none */
  async remove(id: number): Promise<boolean> {
    const row = this.db.select().from(assets).where(eq(assets.id, id)).get();
    if (!row) return false;
    this.db.delete(assets).where(eq(assets.id, id)).run();
    await this.store.remove(row.file);
    return true;
  }
}
