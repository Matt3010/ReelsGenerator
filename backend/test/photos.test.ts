import { join } from "node:path";
import { expect, it } from "vitest";
import { Library } from "../src/library.js";
import { CATEGORIES, composePrompt, suggestions } from "../src/photos.js";
import { tmp } from "./helpers.js";

it("has the five categories, each with starting tags", () => {
  expect(CATEGORIES.map((c) => c.id)).toEqual(["subject", "place", "era", "light", "framing"]);
  for (const c of CATEGORIES) {
    expect(c.defaults.length).toBeGreaterThanOrEqual(16);
    expect(new Set(c.defaults).size).toBe(c.defaults.length);
  }
});

it("composes the prompt in category order, then the free text", () => {
  const p = composePrompt({ framing: ["close-up"], subject: ["an old fisherman", "a dog"], era: ["1920s"] }, " smiling ");
  expect(p).toBe("an old fisherman, a dog, 1920s, close-up, smiling");
});

it("ignores unknown categories and blank tags", () => {
  expect(composePrompt({ subject: [" ", "a cat"], colour: ["red"] } as Record<string, string[]>, "")).toBe("a cat");
});

it("offers every starting tag, after the favourites", () => {
  const subject = suggestions([]).find((c) => c.id === "subject")!;
  expect(subject.tags).toEqual([...CATEGORIES[0].defaults]);
});

it("suggests the most used and most recent tags first, then the starting ones", () => {
  const lib = new Library(join(tmp(), "lib"));
  lib.recordTags({ subject: ["a robot"] });
  lib.recordTags({ subject: ["a cat"] });
  lib.recordTags({ subject: ["a robot"] });
  lib.recordTags({ subject: ["a lighthouse keeper"] });
  const subject = suggestions(lib.usedTags()).find((c) => c.id === "subject")!;
  expect(subject.tags.slice(0, 3)).toEqual(["a robot", "a lighthouse keeper", "a cat"]);
  expect(subject.tags).toContain(CATEGORIES[0].defaults[0]);
  expect(new Set(subject.tags).size).toBe(subject.tags.length);
  expect(subject.label).toBe("Soggetto");
});
