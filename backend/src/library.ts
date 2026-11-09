// Reusable picture library: PNGs in <root>/images, an SQLite index (Drizzle ORM, migrations in drizzle/).
import Database from "better-sqlite3";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { assets, assetTags } from "./db.js";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface Asset {
  id: number; path: string; prompt: string; tags: string[]; style: string; seed: number; model: string;
  width: number; height: number; uses: number;
}
export interface AssetMeta { prompt: string; tags: string[]; style: string; seed: number; model: string }

export const promptKey = (p: string) => p.trim().toLowerCase().replace(/\s+/g, " ");
const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

export class Library {
  readonly imagesDir: string;
  readonly dbPath: string;
  private db: BetterSQLite3Database;

  constructor(readonly root: string) {
    this.imagesDir = join(root, "images");
    mkdirSync(this.imagesDir, { recursive: true });
    this.dbPath = join(root, "library.sqlite");
    const sqlite = new Database(this.dbPath);
    sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(sqlite);
    migrate(this.db, { migrationsFolder: MIGRATIONS });
  }

  private toAsset(row: typeof assets.$inferSelect): Asset {
    const tags = this.db.select({ tag: assetTags.tag }).from(assetTags).where(eq(assetTags.assetId, row.id))
      .orderBy(asc(assetTags.position)).all().map((t) => t.tag);
    return { id: row.id, path: join(this.imagesDir, row.file), prompt: row.prompt, tags, style: row.style, seed: row.seed,
      model: row.model, width: row.width, height: row.height, uses: row.uses };
  }

  async add(image: string, meta: AssetMeta): Promise<Asset> {
    const sha = createHash("sha256").update(readFileSync(image)).digest("hex");
    const existing = this.db.select().from(assets).where(eq(assets.sha256, sha)).get();
    if (existing) return this.toAsset(existing);
    const file = `${sha.slice(0, 16)}${extname(image).toLowerCase() || ".png"}`;
    const dst = join(this.imagesDir, file);
    if (!existsSync(dst)) copyFileSync(image, dst);
    const { width = 0, height = 0 } = await sharp(dst).metadata();
    const row = this.db.transaction((tx) => {
      const r = tx.insert(assets).values({ sha256: sha, file, prompt: meta.prompt, promptKey: promptKey(meta.prompt),
        style: meta.style, seed: meta.seed, model: meta.model, width, height, uses: 0, createdAt: new Date() }).returning().get();
      const tags = cleanTags(meta.tags);
      if (tags.length) tx.insert(assetTags).values(tags.map((tag, position) => ({ assetId: r.id, tag, position }))).run();
      return r;
    });
    return this.toAsset(row);
  }

  get(id: number): Asset | null {
    const row = this.db.select().from(assets).where(eq(assets.id, id)).get();
    return row ? this.toAsset(row) : null;
  }

  /** the same prompt in the same style, drawn by the same model */
  findExact(prompt: string, style: string, model: string): Asset | null {
    const row = this.db.select().from(assets)
      .where(and(eq(assets.promptKey, promptKey(prompt)), eq(assets.style, style), eq(assets.model, model)))
      .orderBy(asc(assets.id)).get();
    return row ? this.toAsset(row) : null;
  }

  /** assets in the same style and by the same model, ranked by tag overlap (Jaccard), best first */
  candidates(tags: string[], style: string, model: string, minOverlap = 0.5, limit = 5): Asset[] {
    const want = new Set(cleanTags(tags));
    if (!want.size) return [];
    const rows = this.db.selectDistinct({ id: assets.id }).from(assets).innerJoin(assetTags, eq(assetTags.assetId, assets.id))
      .where(and(inArray(assetTags.tag, [...want]), eq(assets.style, style), eq(assets.model, model))).all();
    return rows.map((r) => this.get(r.id)!)
      .map((a) => {
        const have = new Set(a.tags);
        const common = [...want].filter((t) => have.has(t)).length;
        return { a, score: common / new Set([...want, ...have]).size };
      })
      .filter((x) => x.score >= minOverlap)
      .sort((x, y) => y.score - x.score || x.a.id - y.a.id)
      .slice(0, limit)
      .map((x) => x.a);
  }

  /** a picture gone for good: its file, its row and (by cascade) its tags; false when there was none */
  remove(id: number): boolean {
    const row = this.db.select().from(assets).where(eq(assets.id, id)).get();
    if (!row) return false;
    this.db.delete(assets).where(eq(assets.id, id)).run();
    rmSync(join(this.imagesDir, row.file), { force: true });
    return true;
  }

  markUsed(id: number): void {
    this.db.update(assets).set({ uses: sql`${assets.uses} + 1` }).where(eq(assets.id, id)).run();
  }


}
