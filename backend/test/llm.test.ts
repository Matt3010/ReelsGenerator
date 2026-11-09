import { describe, expect, it } from "vitest";
import type { Asset } from "../src/library.js";
import { LlamaServer, chooseImage, extractJson, generateStory, llamaRunner, newsProblems, researchNotes, type Runner } from "../src/llm.js";
import { parseStory } from "../src/spec.js";
import { storyDict } from "./fixtures.js";

describe("extractJson", () => {
  it("reads a fenced block", () => expect(extractJson('Sure!\n```json\n{"a": 1}\n```\nbye')).toEqual({ a: 1 }));
  it("reads bare text after thinking", () => expect(extractJson('<think>{no}</think> here: {"a": {"b": 2}} done')).toEqual({ a: { b: 2 } }));
  it("throws when there is none", () => expect(() => extractJson("no json here")).toThrow());
});

const replying = (...replies: string[]) => {
  const prompts: string[] = [];
  const schemas: unknown[] = [];
  const run: Runner = async (prompt, schema) => {
    prompts.push(prompt);
    schemas.push(schema);
    return replies.length > 1 ? replies.shift()! : replies[0];
  };
  return { run, prompts, schemas };
};

describe("generateStory", () => {
  it("sends topic, notes and schema", async () => {
    const r = replying(JSON.stringify(storyDict()));
    const story = await generateStory("a bridge that fell", r.run, { maxSeconds: 10, notes: "- The tank was 50 feet tall." });
    expect(story.title).toBe("The Bridge That Fell");
    expect(r.prompts[0]).toContain("a bridge that fell");
    expect(r.prompts[0]).toContain("- The tank was 50 feet tall.");
    expect((r.schemas[0] as any).properties.scenes.items.properties.image).toBeDefined();
  });

  it("retries with the error", async () => {
    const bad = storyDict();
    bad.scenes[0].motion = "spin";
    const r = replying(JSON.stringify(bad), JSON.stringify(storyDict()));
    await generateStory("x", r.run, { maxSeconds: 10 });
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[1]).toContain("spin");
  });

  it("rejects a narration that is too long", async () => {
    const d = storyDict();
    for (const s of d.scenes) s.narration = Array(90).fill("go").join(" ");
    await expect(generateStory("x", replying(JSON.stringify(d)).run, { attempts: 2 })).rejects.toThrow(/too long/);
  });

  it("rejects a narration that is too short", async () => {
    await expect(generateStory("x", replying(JSON.stringify(storyDict())).run, { attempts: 1, maxSeconds: 30 })).rejects.toThrow(/too short/);
  });
});

it("research notes think freely without a schema", async () => {
  const calls: any[] = [];
  const notes = await researchNotes("The molasses flood", async (p, s, think) => {
    calls.push([p, s, think]);
    return "<think>hmm</think>\n- fact one\n- fact two\n";
  });
  expect(notes).toBe("- fact one\n- fact two");
  expect(calls[0][0]).toContain("The molasses flood");
  expect(calls[0][1]).toBeUndefined();
  expect(calls[0][2]).toBe(true);
});

const ARTICLE = "Prime Minister Rosa Valli opened the Old Bridge in Turin on Monday. "
  + "The bridge had been closed since a flood killed three people. Valli said it was a new start.";

it("research notes from an article use only the article", async () => {
  const calls: string[] = [];
  await researchNotes("Bridge reopens", async (p) => { calls.push(p); return "- fact"; }, ARTICLE);
  expect(calls[0]).toContain(ARTICLE);
  expect(calls[0]).toContain("ONLY");
});

describe("news", () => {
  it("flags real names in pictures but not the place", () => {
    const d = storyDict();
    d.era = "Turin, Italy, November 2026";
    d.scenes[0].image = "Rosa Valli cutting a ribbon on the Old Bridge in Turin";
    d.cast[0].look = "a woman like Valli in a grey suit";
    const problems = newsProblems(parseStory(d), ARTICLE);
    expect(problems.some((p) => p.includes("Rosa Valli"))).toBe(true);
    expect(problems.some((p) => p.includes("\"Valli\""))).toBe(true);
    expect(problems.some((p) => p.includes("Turin"))).toBe(false);
  });

  it("retries until no real person is named", async () => {
    const good = { ...storyDict(), era: "Turin, Italy, November 2026" };
    const bad = structuredClone(good);
    bad.scenes[0].image = "Rosa Valli cutting a ribbon on a bridge";
    const r = replying(JSON.stringify(bad), JSON.stringify(good));
    await generateStory("Bridge reopens", r.run, { maxSeconds: 10, notes: "- fact", newsText: ARTICLE });
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[1]).toContain("Rosa Valli");
    expect(r.prompts[0]).toContain("real people");
  });
});

it("llamaRunner posts a schema-constrained chat without thinking", async () => {
  const seen: any = {};
  const fetcher = async (url: string, init: any) => {
    seen.url = url;
    seen.body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"a": 1}' } }] }));
  };
  const run = llamaRunner("http://127.0.0.1:9", fetcher as unknown as typeof fetch);
  expect(await run("hello", { type: "object" })).toBe('{"a": 1}');
  expect(seen.url).toBe("http://127.0.0.1:9/v1/chat/completions");
  expect(seen.body.messages.at(-1)).toEqual({ role: "user", content: "hello" });
  expect(seen.body.response_format).toEqual({ type: "json_schema", json_schema: { name: "reply", schema: { type: "object" } } });
  expect(seen.body.chat_template_kwargs).toEqual({ enable_thinking: false });
});

it("llamaRunner can think and strips the thoughts", async () => {
  let body: any;
  const fetcher = async (_u: string, init: any) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "<think>x</think>answer" } }] }));
  };
  expect(await llamaRunner("http://h", fetcher as unknown as typeof fetch)("q", undefined, true)).toBe("answer");
  expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
  expect(body.response_format).toBeUndefined();
});

it("llamaRunner reports HTTP errors", async () => {
  const fetcher = async () => new Response("boom", { status: 500 });
  await expect(llamaRunner("http://x", fetcher as unknown as typeof fetch)("hi")).rejects.toThrow(/boom/);
});

const asset = (id: number): Asset => ({ id, path: "", prompt: `prompt ${id}`, tags: ["a"], style: "toon", seed: 1, model: "m", width: 4, height: 4, uses: 0 });

it("chooseImage returns the picked id, or null for 0", async () => {
  const run: Runner = async (p, schema: any) => {
    expect(p).toContain("prompt 7");
    expect(schema.properties.id.enum).toEqual([0, 7, 9]);
    return '{"id": 9}';
  };
  expect(await chooseImage("a bridge", [asset(7), asset(9)], run)).toBe(9);
  expect(await chooseImage("a bridge", [asset(7)], async () => '{"id": 0}')).toBeNull();
});

it("LlamaServer starts, waits for health and stops", async () => {
  const launched: string[][] = [];
  let killed = false;
  const health: (number | Error)[] = [new Error("no"), 503, 200];
  const spawnFn = (cmd: string, args: string[]) => {
    launched.push([cmd, ...args]);
    return { exitCode: null, kill: () => { killed = true; return true; }, once: () => {} } as any;
  };
  const get = async () => {
    const h = health.shift()!;
    if (h instanceof Error) throw h;
    return h;
  };
  const srv = new LlamaServer({ exe: "llama-server.exe", model: "q.gguf", port: 8091, spawn: spawnFn, health: get, sleep: async () => {} });
  expect(await srv.start()).toBe("http://127.0.0.1:8091");
  const cmd = launched[0];
  expect(cmd[0]).toBe("llama-server.exe");
  expect(cmd[cmd.indexOf("-m") + 1]).toBe("q.gguf");
  expect(cmd[cmd.indexOf("--port") + 1]).toBe("8091");
  expect(cmd).toContain("--jinja");
  expect(cmd).not.toContain("-ngl");               // llama.cpp fits the layers to free VRAM itself (2x faster)
  expect(cmd[cmd.indexOf("-np") + 1]).toBe("1");
  await srv.stop();
  expect(killed).toBe(true);
});

it("with real people allowed, a news story may name them", async () => {
  const story = { ...storyDict(), era: "Turin, Italy, November 2026" };
  story.scenes[0].image = "Rosa Valli cutting a ribbon on a bridge";
  const r = replying(JSON.stringify(story));
  await generateStory("Bridge reopens", r.run, { maxSeconds: 10, notes: "- fact", newsText: ARTICLE, realPeople: true });
  expect(r.prompts).toHaveLength(1);
  expect(r.prompts[0]).not.toContain("Never depict real people");
});
