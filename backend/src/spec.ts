// The story.json contract between the local LLM and the pipeline: narration plus one still image per scene.
import { z } from "zod";

export const MOTIONS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"] as const;
export type Motion = (typeof MOTIONS)[number];

// small local models write "same as previous" instead of repeating the picture text
const SAME_AS_PREVIOUS = /^\s*(same|identical)\b.*\b(previous|above|before|last)\b/i;

export const norm = (word: string) => word.toLowerCase().replace(/[^a-z0-9']/g, "");

const CastMember = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1).max(60),
  look: z.string().min(3).max(200),
});

const Scene = z.strictObject({
  narration: z.string().trim().min(1).max(400),
  image: z.string().trim().min(10).max(400).describe("what the still picture shows, in English"),
  cast: z.array(z.string()).max(4).default([]).describe("ids of the characters visible"),
  tags: z.array(z.string()).min(1).max(8).describe("lowercase keywords to find the picture again"),
  motion: z.enum(MOTIONS).default("zoom_in"),
});

const Source = z.strictObject({ outlet: z.string(), title: z.string(), url: z.string(), published: z.string().default("") });

const StoryShape = z.strictObject({
  title: z.string().min(1).max(100),
  era: z.string().min(3).max(120).describe("place and year every picture is set in"),
  avoid: z.array(z.string()).max(10).default([]).describe("things that must NOT appear: anachronisms, wrong materials"),
  source: Source.optional(),
  cast: z.array(CastMember).max(8).default([]),
  scenes: z.array(Scene).min(1).max(20),
});

export type Story = z.infer<typeof StoryShape>;
export type Scene = Story["scenes"][number];
export type Source = z.infer<typeof Source>;

/** the JSON schema the model's reply is constrained to */
export const storyJsonSchema = () => z.toJSONSchema(StoryShape, { io: "input" });

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

/** validate a reply and repair what small models typically get wrong */
export function parseStory(data: unknown): Story {
  const story = StoryShape.parse(data);
  const ids = story.cast.map((c) => c.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) throw new Error(`duplicate cast ids: ${dupes.sort().join(", ")}`);
  story.scenes.forEach((scene, n) => {
    scene.tags = cleanTags(scene.tags);
    if (!scene.tags.length) throw new Error(`scene ${n + 1}: no tags`);
    if (SAME_AS_PREVIOUS.test(scene.image)) {
      if (n === 0) throw new Error("the first scene's image must describe a picture, not refer to a previous one");
      scene.image = story.scenes[n - 1].image;
      scene.cast = [...story.scenes[n - 1].cast];
    }
    // small models list props ("horse-drawn cart") as characters: fold them into the picture instead
    for (const cid of scene.cast.filter((c) => !ids.includes(c))) {
      scene.cast = scene.cast.filter((c) => c !== cid);
      if (!scene.image.toLowerCase().includes(cid.toLowerCase())) scene.image = `${scene.image}, ${cid}`;
    }
  });
  return story;
}

export function imagePrompt(story: Story, scene: Scene): string {
  const looks = new Map(story.cast.map((c) => [c.id, c.look]));
  return [scene.image, ...scene.cast.map((c) => looks.get(c)!), story.era].join(", ");
}

const NO_REAL_PEOPLE = ["real person", "celebrity", "politician", "famous face", "likeness", "portrait photo"];

/** what a job may draw: the anachronism list on or off, real people in news pictures allowed or not */
export interface Limits { avoid: boolean; realPeople: boolean }
export const DEFAULT_LIMITS: Limits = { avoid: true, realPeople: false };

export function negativeExtra(story: Story, limits: Limits = DEFAULT_LIMITS): string {
  const parts = limits.avoid ? story.avoid.map((a) => a.trim()).filter(Boolean) : [];
  if (story.source && !limits.realPeople) parts.push(...NO_REAL_PEOPLE);
  return parts.join(", ");
}
