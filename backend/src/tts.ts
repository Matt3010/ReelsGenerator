// Narration with Microsoft Edge neural voices (free, needs internet), with per-word timings.
import { mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { run } from "./proc.js";
import type { SceneAudio, Word } from "./timeline.js";

export const VOICES: Record<string, string> = {
  "en-US-GuyNeural": "Guy (US, deep narrator)",
  "en-US-AndrewNeural": "Andrew (US, warm)",
  "en-US-ChristopherNeural": "Christopher (US, calm)",
  "en-GB-RyanNeural": "Ryan (UK)",
  "en-US-AriaNeural": "Aria (US, female)",
  "en-GB-SoniaNeural": "Sonia (UK, female)",
};

/** speaks text into a temporary mp3; returns its path and the word timings */
export type Speaker = (text: string, voice: string, workDir: string) => Promise<{ audio: string; words: Word[] }>;

/** Edge metadata: word offsets and durations in 100 ns ticks */
export function parseBoundaries(chunks: string[]): Word[] {
  const words: Word[] = [];
  for (const chunk of chunks) {
    for (const m of JSON.parse(chunk).Metadata ?? []) {
      if (m.Type !== "WordBoundary") continue;
      const start = m.Data.Offset / 1e7;
      words.push({ text: m.Data.text.Text, start, end: start + m.Data.Duration / 1e7 });
    }
  }
  return words;
}

/** Edge drops punctuation from word events; put it back so captions can break on sentence ends */
export function attachPunctuation(text: string, words: Word[]): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  let i = 0;
  return words.map((w) => {
    while (i < tokens.length && !tokens[i].toLowerCase().includes(w.text.toLowerCase())) i++;
    const out = { ...w, text: i < tokens.length ? tokens[i] : w.text };
    i++;
    return out;
  });
}

const edgeSpeaker: Speaker = async (text, voice, workDir) => {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioFilePath, metadataFilePath } = await tts.toFile(workDir, text, { rate: "+6%" });
    const words = metadataFilePath ? parseBoundaries([readFileSync(metadataFilePath, "utf8")]) : [];
    if (!words.length) throw new Error("no audio received");
    return { audio: audioFilePath, words };
  } finally {
    tts.close();
  }
};

export async function mediaDuration(path: string): Promise<number> {
  const r = await run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  const d = Number.parseFloat(r.output);
  if (r.code !== 0 || !Number.isFinite(d)) throw new Error(`ffprobe failed on ${path}: ${r.output.slice(-500)}`);
  return d;
}

export interface SynthOptions {
  speak?: Speaker; attempts?: number; sleep?: (ms: number) => Promise<void>; duration?: (path: string) => Promise<number>;
}

/** the free Edge endpoint randomly answers with no audio: back off and try again */
export async function synthesize(text: string, voice: string, outPath: string, o: SynthOptions = {}): Promise<SceneAudio> {
  const { speak = edgeSpeaker, attempts = 6, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)), duration = mediaDuration } = o;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    const work = mkdtempSync(join(dirname(outPath), ".tts-"));
    try {
      const { audio, words } = await speak(text, voice, work);
      renameSync(audio, outPath);
      return { audio: basename(outPath), duration: await duration(outPath), words: attachPunctuation(text, words) };
    } catch (e) {
      last = e;
      await sleep(Math.min(20_000, 1500 * 2 ** i));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  throw new Error(`the voice service failed ${attempts} times: ${last}`);
}
