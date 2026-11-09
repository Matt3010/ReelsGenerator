import { describe, expect, it } from "vitest";
import { imagePrompt, negativeExtra, norm, parseStory, storyJsonSchema } from "../src/spec.js";
import { storyDict } from "./fixtures.js";

describe("story", () => {
  it("accepts a valid story", () => {
    const s = parseStory(storyDict());
    expect(s.scenes[1].motion).toBe("pan_left");
  });

  it("rejects unknown motions and extra fields", () => {
    const d = storyDict();
    d.scenes[1].motion = "spin";
    expect(() => parseStory(d)).toThrow();
    const e = storyDict();
    e.scenes[0].sfx = "crash";
    expect(() => parseStory(e)).toThrow();
  });

  it("rejects duplicate cast ids", () => {
    const d = storyDict();
    d.cast.push({ ...d.cast[0] });
    expect(() => parseStory(d)).toThrow(/duplicate/);
  });

  it("normalises tags to lowercase unique", () => {
    const d = storyDict();
    d.scenes[0].tags = ["Bridge", "bridge ", "River"];
    expect(parseStory(d).scenes[0].tags).toEqual(["bridge", "river"]);
  });

  it("folds unknown scene cast into the picture", () => {
    const d = storyDict();
    d.scenes[0].cast = ["sam", "horse-drawn cart"];
    const s = parseStory(d);
    expect(s.scenes[0].cast).toEqual(["sam"]);
    expect(s.scenes[0].image.endsWith("over a river, horse-drawn cart")).toBe(true);
  });

  it("does not repeat an unknown cast entry already in the picture", () => {
    const d = storyDict();
    d.scenes[0].cast = ["river"];
    const s = parseStory(d);
    expect(s.scenes[0].cast).toEqual([]);
    expect(s.scenes[0].image.endsWith("over a river")).toBe(true);
  });

  it.each(["same as previous", "Same as the previous scene", "identical to above"])(
    "reuses the previous picture for %s", (text) => {
      const d = storyDict();
      d.scenes[1].image = text;
      const s = parseStory(d);
      expect(s.scenes[1].image).toBe(s.scenes[0].image);
      expect(s.scenes[1].cast).toEqual(s.scenes[0].cast);
    });

  it("rejects same-as-previous on the first scene", () => {
    const d = storyDict();
    d.scenes[0].image = "same as previous";
    expect(() => parseStory(d)).toThrow(/first scene/);
  });

  it("builds the image prompt with looks and era", () => {
    const s = parseStory(storyDict());
    const p = imagePrompt(s, s.scenes[0]);
    expect(p.startsWith("soldiers marching in step")).toBe(true);
    expect(p).toContain("a young soldier in a red 19th-century uniform");
    expect(imagePrompt(s, s.scenes[1])).not.toContain("red 19th-century");
    expect(imagePrompt(s, s.scenes[1]).endsWith("Manchester, England, 1831")).toBe(true);
  });

  it("lists anachronisms, plus no real people for news", () => {
    expect(negativeExtra(parseStory(storyDict()))).toBe("cars, electric lights");
    const d = storyDict();
    d.source = { outlet: "BBC News", title: "t", url: "u", published: "" };
    const neg = negativeExtra(parseStory(d));
    expect(neg.startsWith("cars, electric lights")).toBe(true);
    expect(neg).toContain("celebrity");
    expect(neg).toContain("politician");
  });

  it("exposes a JSON schema for the model", () => {
    const schema: any = storyJsonSchema();
    expect(schema.properties.scenes.items.properties.image.type).toBe("string");
    expect(schema.properties.scenes.items.properties.motion.enum).toContain("pan_up");
  });

  it("norm strips punctuation", () => expect(norm("Snapped!")).toBe("snapped"));
});
