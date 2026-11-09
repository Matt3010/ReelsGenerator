// The photo composer: prompts built from tags in five categories, the favourite tags first.
import type { TagSet, TagUse } from "./library.js";

export const CATEGORIES = [
  { id: "subject", label: "Soggetto", defaults: ["an old fisherman", "a curious cat", "a crowd of people", "a small robot", "a lighthouse",
    "a steam train", "a market stall", "a child with a kite", "a knight in armour", "an astronaut", "a street musician", "a fox",
    "a dragon", "a vintage car", "a chef cooking", "a hot air balloon", "a sailing ship", "a dog running", "a scientist in a lab",
    "a dancer", "an elephant", "a castle"] },
  { id: "place", label: "Luogo", defaults: ["a seaside village", "a busy city street", "a forest clearing", "a mountain pass", "a harbour",
    "a desert road", "a cosy kitchen", "a rooftop", "a train station", "an underwater reef", "a snowy village", "a jungle",
    "a library", "a medieval market", "a space station", "a rice field", "a lighthouse cliff", "a neon alley", "an old factory",
    "a cathedral", "a beach at sunset", "a farmhouse"] },
  { id: "era", label: "Epoca", defaults: ["today", "1920s", "1950s", "1980s", "victorian era", "medieval", "ancient rome", "ancient egypt",
    "renaissance", "the wild west", "the stone age", "the 1960s", "world war era", "belle epoque", "edo period japan",
    "viking age", "the far future", "a post-apocalyptic future"] },
  { id: "light", label: "Luce", defaults: ["golden hour", "bright morning", "night with lanterns", "foggy", "rainy", "snowy",
    "dramatic storm light", "blue hour", "candlelight", "moonlight", "harsh noon sun", "neon glow", "overcast", "sunrise",
    "backlit silhouette", "firelight", "aurora in the sky", "soft studio light"] },
  { id: "framing", label: "Inquadratura", defaults: ["wide shot", "close-up", "low angle", "aerial view", "over the shoulder", "full body",
    "extreme close-up", "high angle", "bird's eye view", "worm's eye view", "dutch angle", "medium shot", "panoramic",
    "symmetrical composition", "silhouette against the sky", "through a window", "reflection in water", "point of view"] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** the prompt in category order (subject first: SD weighs the start most), then the free text */
export function composePrompt(tags: Partial<Record<string, string[]>>, extra = ""): string {
  const parts = CATEGORIES.flatMap((c) => (tags[c.id] ?? []).map((t) => t.trim()).filter(Boolean));
  if (extra.trim()) parts.push(extra.trim());
  return parts.join(", ");
}

/** per category: the tags used most (and most lately) first, then the starting ones not used yet */
export function suggestions(used: TagUse[], perCategory = 40) {
  return CATEGORIES.map((c) => {
    const mine = used.filter((u) => u.category === c.id)
      .sort((a, b) => b.uses - a.uses || b.lastUsed.getTime() - a.lastUsed.getTime()).map((u) => u.tag);
    return { id: c.id, label: c.label, tags: [...new Set([...mine, ...c.defaults])].slice(0, perCategory) };
  });
}

export const tagsOf = (tags: TagSet) => Object.values(tags).flat().map((t) => t.trim().toLowerCase()).filter(Boolean);
