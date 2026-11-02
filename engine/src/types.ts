// Mirrors shorts/spec.py (story) + shorts/timeline.py (timing). Python is the source of truth.
export type Setting =
  | "town" | "countryside" | "city" | "forest" | "desert" | "beach" | "snow"
  | "harbor" | "castle" | "lab" | "space" | "home" | "office" | "classroom" | "tavern";
export type TimeOfDay = "day" | "golden" | "night";
export type Action = "idle" | "walk" | "run" | "talk" | "jump" | "fall" | "point" | "cheer" | "shocked" | "sit";
export type Expression = "neutral" | "happy" | "sad" | "angry" | "surprised" | "scared" | "smug" | "thinking";

export type Species =
  | "human" | "cat" | "cow" | "dog" | "eagle" | "horse" | "llama" | "pig" | "fish" | "pug" | "sheep" | "wolf" | "zebra";
export type CastMember = {
  id: string; name: string; species?: Species; kind: "adult" | "kid" | "elder";
  skin: string | null; shirt: string | null; pants: string | null;
};
export type Part = { shape: "box" | "cylinder" | "sphere" | "cone" | "capsule" | "torus"; size: [number, number, number]; pos: [number, number, number]; rot_y: number; rot_x?: number; rot_z?: number; color: string; glow?: boolean };
/** a catalog model by key, or (model null) a custom object built from parts */
export type Prop = { model: string | null; x: number; z: number; scale: number; rot_y: number; parts: Part[] };
export type Actor = { id: string; x: number; z: number; action: Action; expression: Expression; to_x: number | null; count?: number };
export type Camera = { shot: "wide" | "medium" | "close" | "aerial" | "low"; move: "push" | "pull" | "orbit" | "pan" | "static"; target: string | null; angle?: "level" | "dutch" };
export type Symbol = "exclaim" | "question" | "sweat" | "anger" | "stars" | "hearts" | "idea" | "zzz";
export type Beat = { word: string; frame: number; actor: string | null; expression: Expression | null; action: Action | null; symbol: Symbol | null; camera: Camera | null; sfx: string | null };
export type Effect = "none" | "shake" | "flash" | "explosion" | "confetti" | "smoke" | "splash";
export type Scene = {
  narration: string; setting: Setting; time: TimeOfDay; props: Prop[]; actors: Actor[];
  camera: Camera; effect: Effect; effect_word?: string | null;
};
export type Story = { title: string; cast: CastMember[]; scenes: Scene[] };

export type Word = { text: string; start: number; end: number };
export type SceneTiming = { audio: string; start: number; frames: number; audio_start: number; words: Word[]; effect_frame: number | null; audio_trim?: number; beats?: Beat[] };
export type Timeline = { fps: number; total: number; scenes: SceneTiming[] };

export type RenderProps = {
  story: Story;
  timeline: Timeline;
  captions: boolean;
  music: string | null;
  sfx?: { sound: string; frame: number; volume: number }[];
};
