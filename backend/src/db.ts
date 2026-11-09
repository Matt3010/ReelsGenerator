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

/** how often and when each tag of the photo composer was used: the composer puts the favourites first */
export const tagUses = sqliteTable("tag_uses", {
  category: text("category").notNull(),
  tag: text("tag").notNull(),
  uses: integer("uses").notNull().default(0),
  lastUsed: integer("last_used", { mode: "timestamp_ms" }).notNull(),
}, (t) => [primaryKey({ columns: [t.category, t.tag] })]);

/** the latest tag combinations, to make one again with a click */
export const recentPrompts = sqliteTable("recent_prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tags: text("tags", { mode: "json" }).notNull().$type<Record<string, string[]>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
