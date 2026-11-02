// One scene rendered by three.js inside Remotion: world -> ink outlines -> tone mapping -> colour grade.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { InkPass, noInkFallback } from "./vendor/ink";
import { GradeEffect } from "./vendor/grade";
import { World, type SceneTimes } from "./world/World";
import type { CastMember, Scene } from "./types";
import { loadModels } from "./world/models";

type Props = { scene: Scene; cast: CastMember[]; index: number; times: SceneTimes };

const Inner: React.FC<Props> = ({ scene, cast, index, times }) => {
  const f = useCurrentFrame();
  const { camera, scene: three } = useThree();
  const world = useMemo(() => new World(scene, cast, index, times), [scene, cast, index, times]);
  const fx = useMemo(() => ({
    ink: new InkPass(three, camera as THREE.PerspectiveCamera),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(world.light.grade, 1),
  }), [three, camera, world]);
  useEffect(() => () => fx.ink.dispose(), [fx]);
  useMemo(() => {
    three.fog = new THREE.Fog(world.light.skyHorizon, world.light.fogNear, world.light.fogFar);
  }, [three, world]);
  world.update(f, camera as THREE.PerspectiveCamera);
  noInkFallback(world.root);
  return (
    <>
      <primitive object={world.root} dispose={null} />
      <EffectComposer multisampling={4}>
        <primitive object={fx.ink} dispose={null} />
        <primitive object={fx.tone} dispose={null} />
        <primitive object={fx.grade} dispose={null} />
      </EffectComposer>
    </>
  );
};

const useModels = (keys: string[]) => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("models"));
  useEffect(() => { loadModels(keys).then(() => { setReady(true); continueRender(handle); }); }, [handle]);
  return ready;
};

export const SceneView: React.FC<Props> = (props) => {
  const { width, height } = useVideoConfig();
  const keys = useMemo(() => World.propsFor(props.scene, props.index).flatMap((p) => (p.model ? [p.model] : [])), [props.scene, props.index]);
  const ready = useModels(keys);
  if (!ready) return null;
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows
        gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
        camera={{ fov: 40, near: 0.1, far: 2000 }}>
        <Inner {...props} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
