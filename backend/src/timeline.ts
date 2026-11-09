// Per-scene voice clips -> a frame-accurate timeline.

export interface Word { text: string; start: number; end: number }          // seconds within the clip
export interface SceneAudio { audio: string; duration: number; words: Word[] }
export interface FrameWord { text: string; start: number; end: number }     // absolute frames
export interface SceneTiming {
  audio: string; start: number; frames: number; audioStart: number; words: FrameWord[];
  audioTrim: number; // frames of leading TTS silence skipped in the clip
}
export interface Timeline { fps: number; total: number; scenes: SceneTiming[] }

export interface TimelineOptions { fps?: number; lead?: number; gap?: number; tail?: number; trim?: boolean; pre?: number; post?: number }

/** lay the clips end to end; with trim, the TTS padding around the words is cut (pre/post seconds kept) */
export function buildTimeline(clips: SceneAudio[], o: TimelineOptions = {}): Timeline {
  const { fps = 30, lead = 0.3, gap = 0.15, tail = 1.0, trim = true, pre = 0.08, post = 0.15 } = o;
  const scenes: SceneTiming[] = [];
  let cursor = 0;
  clips.forEach((clip, i) => {
    const leadF = i === 0 ? Math.round(lead * fps) : 0;
    const tailF = i === clips.length - 1 ? Math.round(tail * fps) : 0;
    let t0 = 0, t1 = clip.duration;
    if (trim && clip.words.length) {
      t0 = Math.max(0, clip.words[0].start - pre);
      t1 = Math.min(clip.duration, clip.words[clip.words.length - 1].end + post);
    }
    const audioF = Math.ceil((t1 - t0) * fps - 1e-6);
    const frames = leadF + audioF + Math.round(gap * fps) + tailF;
    const audioStart = cursor + leadF;
    const words = clip.words.map((w) => ({
      text: w.text, start: audioStart + Math.round((w.start - t0) * fps), end: audioStart + Math.round((w.end - t0) * fps),
    }));
    scenes.push({ audio: clip.audio, start: cursor, frames, audioStart, words, audioTrim: Math.round(t0 * fps) });
    cursor += frames;
  });
  return { fps, total: cursor, scenes };
}
