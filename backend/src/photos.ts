// The photo composer: prompts built from tags in five categories, the favourite tags first.
import type { TagSet, TagUse } from "./library.js";

export const CATEGORIES = [
  { id: "subject", label: "Soggetto", defaults: ["an old fisherman", "a curious cat", "a crowd of people", "a small robot", "a lighthouse", "a steam train", "a market stall", "a child with a kite"] },
  { id: "place", label: "Luogo", defaults: ["a seaside village", "a busy city street", "a forest clearing", "a mountain pass", "a harbour", "a desert road", "a cosy kitchen", "a rooftop"] },
  { id: "era", label: "Epoca", defaults: ["today", "1920s", "1950s", "victorian era", "medieval", "ancient rome", "the far future"] },
  { id: "light", label: "Luce", defaults: ["golden hour", "bright morning", "night with lanterns", "foggy", "rainy", "snowy", "dramatic storm light"] },
  { id: "framing", label: "Inquadratura", defaults: ["wide shot", "close-up", "low angle", "aerial view", "over the shoulder", "full body"] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** the prompt in category order (subject first: SD weighs the start most), then the free text */
export function composePrompt(tags: Partial<Record<string, string[]>>, extra = ""): string {
  const parts = CATEGORIES.flatMap((c) => (tags[c.id] ?? []).map((t) => t.trim()).filter(Boolean));
  if (extra.trim()) parts.push(extra.trim());
  return parts.join(", ");
}

/** per category: the tags used most (and most lately) first, then the starting ones not used yet */
export function suggestions(used: TagUse[], perCategory = 14) {
  return CATEGORIES.map((c) => {
    const mine = used.filter((u) => u.category === c.id)
      .sort((a, b) => b.uses - a.uses || b.lastUsed.getTime() - a.lastUsed.getTime()).map((u) => u.tag);
    return { id: c.id, label: c.label, tags: [...new Set([...mine, ...c.defaults])].slice(0, perCategory) };
  });
}

export const tagsOf = (tags: TagSet) => Object.values(tags).flat().map((t) => t.trim().toLowerCase()).filter(Boolean);
