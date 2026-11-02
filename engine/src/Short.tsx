// The whole short: one Sequence per scene (3D world + voice clip), captions, music ducked under the voice,
// and a quick white dip when the place or time of day changes.
import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SceneView } from "./SceneView";
import { Captions } from "./Captions";
import type { RenderProps } from "./types";
import type { SceneTimes } from "./world/World";

export const Short: React.FC<RenderProps> = ({ story, timeline, captions, music, sfx }) => {
  const f = useCurrentFrame();
  const times: SceneTimes[] = useMemo(() => timeline.scenes.map((t) => ({
    frames: t.frames,
    talk: t.words.map((w) => [w.start - t.start, w.end - t.start] as [number, number]),
    hit: t.effect_frame === null || t.effect_frame === undefined ? null : t.effect_frame - t.start,
    beats: (t.beats ?? []).map((b) => ({ ...b, frame: b.frame - t.start })),
  })), [timeline]);
  const allWords = useMemo(() => timeline.scenes.flatMap((s) => s.words), [timeline]);
  const cuts = timeline.scenes
    .map((t, i) => {
      if (i === 0) return null;
      const a = story.scenes[i], b = story.scenes[i - 1];
      return a.setting !== b.setting || a.time !== b.time ? t.start : null;
    })
    .filter((x): x is number => x !== null);
  const dip = Math.max(0, ...cuts.map((c) => interpolate(f - c, [-3, 0, 6], [0, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const speaking = (fr: number) =>
    timeline.scenes.some((s) => s.words.length > 0 && fr >= s.words[0].start - 6 && fr < s.words[s.words.length - 1].end + 6);
  return (
    <AbsoluteFill style={{ background: "#cfe3f2" }}>
      {timeline.scenes.map((t, i) => (
        <Sequence key={i} from={t.start} durationInFrames={t.frames} name={`Scene ${i + 1}`}>
          <SceneView scene={story.scenes[i]} cast={story.cast} index={i} times={times[i]} />
          {t.audio ? (
            <Sequence from={t.audio_start - t.start} name="voice">
              <Audio src={staticFile(t.audio)} startFrom={t.audio_trim ?? 0} />
            </Sequence>
          ) : null}
        </Sequence>
      ))}
      {dip > 0 && <AbsoluteFill style={{ background: "#ffffff", opacity: dip }} />}
      {captions && <Captions words={allWords} />}
      {music && <Audio src={staticFile(music)} loop volume={(fr) => (speaking(fr) ? 0.12 : 0.3)} />}
      {(sfx ?? []).map((e, i) => (
        <Sequence key={`sfx${i}`} from={Math.max(0, e.frame - 1)} durationInFrames={90} name={`sfx ${e.sound}`}>
          <Audio src={staticFile(`sfx/${e.sound}.wav`)} volume={e.volume * 0.7} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
