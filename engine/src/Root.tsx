import React from "react";
import { Composition } from "remotion";
import { Short } from "./Short";
import type { RenderProps } from "./types";

const demo: RenderProps = {
  story: {
    title: "Demo",
    cast: [{ id: "sam", name: "Sam", kind: "adult", skin: "#f2c9a0", shirt: "#c0392b", pants: "#2c3e50" }],
    scenes: [{
      narration: "Demo", setting: "town", time: "day", props: [], effect: "none",
      actors: [{ id: "sam", x: 0, z: 0, action: "walk", expression: "happy", to_x: 2 }],
      camera: { shot: "medium", move: "push", target: "sam" },
    }],
  },
  timeline: { fps: 30, total: 90, scenes: [{ audio: "", start: 0, frames: 90, audio_start: 0, words: [], effect_frame: null }] },
  captions: false,
  music: null,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={90}
    defaultProps={demo}
    calculateMetadata={({ props }: { props: RenderProps }) => ({ durationInFrames: props.timeline.total, fps: props.timeline.fps })}
  />
);
