// Picture library schema (Drizzle ORM). Migrations in drizzle/ are generated with `npx drizzle-kit generate`.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sha256: text("sha256").notNull().unique(),
  file: text("file").notNull(),
  prompt: text("prompt").notNull(),
  style: text("style").notNull(),
  seed: integer("seed").notNull(),
  model: text("model").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

