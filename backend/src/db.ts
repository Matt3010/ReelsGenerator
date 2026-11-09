// Picture library schema (Drizzle ORM). Migrations in drizzle/ are generated with `npx drizzle-kit generate`.
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sha256: text("sha256").notNull().unique(),
  file: text("file").notNull(),
  prompt: text("prompt").notNull(),
  promptKey: text("prompt_key").notNull(),
  style: text("style").notNull(),
  seed: integer("seed").notNull(),
  model: text("model").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  uses: integer("uses").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [index("assets_prompt_key").on(t.promptKey), index("assets_style").on(t.style)]);

export const assetTags = sqliteTable("asset_tags", {
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.assetId, t.tag] }), index("asset_tags_tag").on(t.tag)]);

