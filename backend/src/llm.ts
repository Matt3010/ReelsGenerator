// Story writing with a local model served by llama.cpp (llama-server, OpenAI-compatible, JSON-schema constrained).
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import type { Asset } from "./library.js";
import { CONFIG } from "./config.js";
import { parseStory, storyJsonSchema, type Story } from "./spec.js";

export type Runner = (prompt: string, schema?: object, think?: boolean) => Promise<string>;

const PROMPT = `You write {seconds}-second vertical story shorts (YouTube Shorts / TikTok): a deadpan English narrator over
a sequence of still cartoon illustrations, one picture per scene, with a slow zoom or pan on each.
Funny, surprising, and TRUE.

TOPIC: {topic}

Research notes (true facts to build on; use ONLY facts from here, never invent numbers):
{notes}

Narration:
- One surprising true story with a visual cause and effect. Only real, well-known facts. No invented dates or numbers.
- {min_words}-{words} words in total, HARD LIMIT {words} (the voice reads ~2.9 words/s). {scenes} scenes, each ONE
  short sentence (4-16 words). Beats: HOOK (the absurd fact) -> setting (year, place) -> escalation -> the snap
  -> twist ending that loops back to the hook. Plain spoken English, no emojis, no stage directions.

Pictures (an image model draws them from your text, so describe only what is VISIBLE):
- "image": one concrete picture in English, 12-40 words: subject, action, place, era, time of day, camera framing
  (wide shot / close-up / low angle). Never ask for text, signs with words, logos or speech bubbles.
- "cast": recurring characters. Give each a "look" (age, clothes, colours, one distinctive detail; 6-25 words) that
  never changes; list in a scene's "cast" only the characters visible in its picture (at most 2 is best), and do NOT
  describe their clothes again in "image". Background people are just described in "image".
- "tags": 3-8 lowercase single words naming the subject, place and era, used to find the picture again later.
- When two scenes show the same thing, write exactly the same "image" text and cast: the picture is reused.
- "motion": zoom_in (tension, reveal), zoom_out (show the scale), pan_left / pan_right (travel, crowds),
  pan_up (tall things, hope), pan_down (falling, gloom). Vary it between scenes.
- "era": the place and year every picture is set in (e.g. "Boston North End, January 1919").
- "avoid": 3-8 things the image model must NOT draw because they would be wrong here: anachronisms (cars, phones,
  plastic, modern clothes...) and wrong materials or colours (e.g. "blue water" for a flood of dark molasses).
- Describe materials, colours and period details explicitly in every "image" (e.g. "thick dark brown molasses").

Reply with ONLY the JSON object.
`;

const RETRY = `

Your previous reply was rejected:
{error}

Previous reply:
{reply}

Fix every problem and reply again with ONLY the corrected JSON object.`;

const CHOOSE = `A short video needs this picture:
"{prompt}"

These pictures already exist in the library:
{listing}

Answer with the id of a picture that shows the same subject, place and era and could be used as it is, or 0 if none
of them really fits (when in doubt, answer 0). Reply with ONLY JSON: {"id": <number>}`;

const RESEARCH = `You are researching a 30-second story short about: {topic}

Think carefully, then write compact research notes in English:
- 8-12 bullet points of well-established TRUE facts (who, where, when, what happened, how big, the consequences),
  with the exact numbers where they are well known. Leave out anything you are not sure of.
- One bullet "Twist:" with the most surprising or ironic true detail, good for the last line.
- One bullet "Visuals:" with what the place, people, clothes, vehicles and materials looked like at the time.
Reply with only the bullet points.`;

const RESEARCH_ARTICLE = `You are preparing a 30-second news short. Use ONLY this article, nothing you remember.

ARTICLE:
{article}

Write compact research notes in English:
- 6-10 bullet points with the facts of the article (who in general terms, where, when, what happened, numbers).
- One bullet "Visuals:" symbolic pictures that could show this without showing any real person.
Reply with only the bullet points.`;

const NEWS_RULES = `
This short is about a NEWS story. The article below is the ONLY source: every fact must come from it.
{people}
ARTICLE:
{article}
`;

const NO_REAL_PEOPLE = `- Never depict real people: no names of real people anywhere in "image", "look" or "era". Characters are generic
  figures ("a firefighter", "a minister in a grey suit"); prefer symbolic pictures (a gavel, a map, a crowd, empty
  streets) over people.
`;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));

const stripThinking = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/g, "");

export function extractJson(text: string): Record<string, unknown> {
  const clean = stripThinking(text);
  const candidates: string[] = [];
  const fenced = clean.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) candidates.push(fenced[1]);
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(clean.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch { /* try the next candidate */ }
  }
  throw new Error("no JSON object found in the reply");
}

/** words that fit in maxSeconds at ~2.9 words/s, minus ~4 s of lead-in, pauses and tail */
export const wordBudget = (maxSeconds: number) => Math.round((maxSeconds - 4) * 2.9);

function buildPrompt(topic: string, maxSeconds: number, notes?: string): string {
  const words = wordBudget(maxSeconds);
  return fill(PROMPT, {
    topic: topic.trim(), seconds: maxSeconds, words, min_words: Math.round(words * 0.75),
    scenes: `${Math.max(3, Math.floor(words / 10))}-${Math.max(4, Math.floor(words / 7))}`,
    notes: (notes || "(none: use only facts you are sure of)").trim(),
  });
}

/** a free-form, thinking pass that collects the facts before the constrained JSON pass */
export async function researchNotes(topic: string, run: Runner, sourceText?: string): Promise<string> {
  const prompt = sourceText ? fill(RESEARCH_ARTICLE, { article: sourceText }) : fill(RESEARCH, { topic: topic.trim() });
  return stripThinking(await run(prompt, undefined, true)).trim();
}

const PROPER = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** rule breaches of a news short: real names (from the article) in the pictures */
export function newsProblems(story: Story, article: string): string[] {
  const era = story.era.toLowerCase();
  const names = new Set<string>();
  for (const sentence of article.split(/(?<=[.!?])\s+/)) {
    for (const m of sentence.matchAll(PROPER)) {
      if (m.index === 0 && !m[0].includes(" ")) continue; // a capital at the start of a sentence is just grammar
      const words = m[0].split(/\s+/);
      words.forEach((_, i) => names.add(words.slice(i).join(" "))); // "Rosa Valli" -> also "Valli"
    }
  }
  const texts: [string, string][] = [...story.scenes.map((s): [string, string] => ["image", s.image]),
    ...story.cast.map((c): [string, string] => ["look", c.look])];
  const problems: string[] = [];
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (era.includes(name.toLowerCase())) continue;
    const hit = texts.find(([, text]) => new RegExp(`\\b${escape(name)}\\b`).test(text));
    if (hit) problems.push(`"${name}" appears in a ${hit[0]}: never name real people, use a generic figure`);
  }
  return problems;
}

export interface StoryOptions {
  attempts?: number; maxSeconds?: number; notes?: string; newsText?: string;
  /** real people may be named and drawn (news): off by default */
  realPeople?: boolean;
}

export async function generateStory(topic: string, run: Runner, o: StoryOptions = {}): Promise<Story> {
  const { attempts = 3, maxSeconds = 30, notes, newsText, realPeople = false } = o;
  const schema = storyJsonSchema();
  let base = buildPrompt(topic, maxSeconds, notes);
  if (newsText) base += fill(NEWS_RULES, { article: newsText, people: realPeople ? "" : NO_REAL_PEOPLE });
  const limit = wordBudget(maxSeconds);
  const minimum = Math.round(limit * 0.75 * 0.85);
  let prompt = base, lastError = "no attempts";
  for (let i = 0; i < attempts; i++) {
    const reply = await run(prompt, schema);
    try {
      const story = parseStory(extractJson(reply));
      const n = story.scenes.reduce((sum, s) => sum + s.narration.split(/\s+/).length, 0);
      if (n > limit * 1.08) throw new Error(`the narration is too long: ${n} words, the limit is ${limit}. Cut it down.`);
      if (n < minimum) {
        throw new Error(`the narration is too short: ${n} words, write at least ${Math.round(limit * 0.75)} words in more `
          + `scenes so the short lasts about ${maxSeconds} seconds.`);
      }
      const problems = newsText && !realPeople ? newsProblems(story, newsText) : [];
      if (problems.length) throw new Error(problems.join("; "));
      return story;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      prompt = base + fill(RETRY, { error: lastError.slice(0, 3000), reply: reply.slice(0, 12000) });
    }
  }
  throw new Error(`story still invalid after ${attempts} attempts: ${lastError}`);
}

export async function chooseImage(prompt: string, candidates: Asset[], run: Runner): Promise<number | null> {
  const ids = candidates.map((a) => a.id);
  const schema = { type: "object", properties: { id: { type: "integer", enum: [0, ...ids] } }, required: ["id"] };
  const listing = candidates.map((a) => `${a.id}: "${a.prompt}"`).join("\n");
  try {
    const pick = extractJson(await run(fill(CHOOSE, { prompt, listing }), schema)).id;
    return typeof pick === "number" && ids.includes(pick) ? pick : null;
  } catch {
    return null;
  }
}

export function llamaRunner(baseUrl: string, fetcher: typeof fetch = fetch, temperature = 0.7, maxTokens = 4096): Runner {
  return async (prompt, schema, think = false) => {
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: prompt }], temperature, max_tokens: maxTokens * (think ? 3 : 1),
      chat_template_kwargs: { enable_thinking: think },
    };
    if (schema) body.response_format = { type: "json_schema", json_schema: { name: "reply", schema } };
    let r: Response;
    try {
      r = await fetcher(`${baseUrl}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(900_000),
      });
    } catch (e) {
      throw new Error(`llama-server unreachable: ${e}`);
    }
    if (!r.ok) throw new Error(`llama-server answered ${r.status}: ${(await r.text()).slice(-1500)}`);
    const content: string = (await r.json()).choices[0].message.content ?? "";
    return think ? stripThinking(content).trim() : content;
  };
}

export interface LlamaOptions {
  exe?: string; model?: string; port?: number; ctx?: number; startupMs?: number; log?: string;
  spawn?: (cmd: string, args: string[], opts: object) => ChildProcess;
  health?: (url: string) => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
}

const httpStatus = async (url: string) => (await fetch(url, { signal: AbortSignal.timeout(5000) })).status;

/** llama-server running only while needed: the 6 GB GPU then belongs to the image model again */
export class LlamaServer {
  readonly url: string;
  private cmd: string[];
  private proc: ChildProcess | null = null;

  constructor(private o: LlamaOptions = {}) {
    const port = o.port ?? 8091;
    this.url = `http://127.0.0.1:${port}`;
    this.cmd = [o.exe ?? CONFIG.llamaServer, "-m", o.model ?? join(CONFIG.models, "Qwen3-8B-Q4_K_M.gguf"),
      "--host", "127.0.0.1", "--port", String(port), "-c", String(o.ctx ?? 8192), "-np", "1", "--jinja"]; // no -ngl: auto-fit is 2x faster
  }

  async start(): Promise<string> {
    const spawn = this.o.spawn ?? nodeSpawn;
    const health = this.o.health ?? httpStatus;
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const proc = spawn(this.cmd[0], this.cmd.slice(1), { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;
    if (this.o.log && proc.stdout && proc.stderr) {
      const log = createWriteStream(this.o.log, { flags: "a" });
      proc.stdout.pipe(log);
      proc.stderr.pipe(log);
    }
    const deadline = Date.now() + (this.o.startupMs ?? 300_000);
    for (;;) {
      if (proc.exitCode !== null) throw new Error("llama-server exited while loading the model (see llama-server.log)");
      try {
        if ((await health(`${this.url}/health`)) === 200) return this.url;
      } catch { /* still loading */ }
      if (Date.now() > deadline) {
        await this.stop();
        throw new Error("llama-server did not become ready in time");
      }
      await sleep(1000);
    }
  }

  async stop(): Promise<void> {
    const p = this.proc;
    this.proc = null;
    if (p && p.exitCode === null) {
      const exited = new Promise<void>((r) => { p.once("exit", () => r()); setTimeout(r, 30_000); });
      p.kill();
      if (this.o.spawn === undefined) await exited;
    }
  }
}

/** runs fn with a fresh llama-server, always stopping it afterwards */
export async function withLlama<T>(fn: (run: Runner) => Promise<T>, o: LlamaOptions = {}): Promise<T> {
  const server = new LlamaServer(o);
  try {
    return await fn(llamaRunner(await server.start()));
  } finally {
    await server.stop();
  }
}
