// Per-setting and per-time-of-day look: sky, fog, lights, ground and the background scatter that makes each place read.
import type { GradeParams } from "../vendor/grade";
import { GRADE_DAY2, GRADE_GOLDEN2 } from "../vendor/grade";
import type { Prop, Setting, TimeOfDay } from "../types";
import { CATALOG } from "./models";

export type Light = {
  skyTop: string; skyHorizon: string; fogNear: number; fogFar: number;
  sun: string; sunIntensity: number; sunAz: number; sunEl: number;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  cardTint: string; grade: GradeParams; stars: boolean; clouds: boolean;
};

const GRADE_NIGHT: GradeParams = {
  ky: [0, 0.08, 0.22, 0.5, 0.78, 0.92, 1], sat: [0.9, 0.95, 1.0],
  tintS: [0.03, -0.01], tintM: [0.02, -0.005], tintH: [0, 0], vig: [0.28, 0.38],
};

export const LIGHTS: Record<TimeOfDay, Light> = {
  day: {
    skyTop: "#3e7fd2", skyHorizon: "#b8d0ec", fogNear: 30, fogFar: 320,
    sun: "#fff4e2", sunIntensity: 2.4, sunAz: 55, sunEl: 48,
    hemiSky: "#cfe0f7", hemiGround: "#8c7d62", hemiIntensity: 1.25,
    cardTint: "#ffffff", grade: GRADE_DAY2, stars: false, clouds: true,
  },
  golden: {
    skyTop: "#f2a86b", skyHorizon: "#ffd29a", fogNear: 25, fogFar: 260,
    sun: "#ffb36b", sunIntensity: 2.6, sunAz: 20, sunEl: 10,
    hemiSky: "#a99ad0", hemiGround: "#6d5a4a", hemiIntensity: 1.05,
    cardTint: "#ffe2c0", grade: GRADE_GOLDEN2, stars: false, clouds: true,
  },
  night: {
    skyTop: "#0b1330", skyHorizon: "#2b3b6b", fogNear: 20, fogFar: 200,
    sun: "#a9bfff", sunIntensity: 1.1, sunAz: -40, sunEl: 35,
    hemiSky: "#3a4c86", hemiGround: "#1b1f2e", hemiIntensity: 0.9,
    cardTint: "#9fb0dc", grade: GRADE_NIGHT, stars: true, clouds: false,
  },
};

export type Place = {
  ground: string;
  /** z beyond which the ground is water (harbor/beach), else null */
  waterFrom: number | null;
  water: string;
  interior: boolean;
  /** overrides the sky for places without one (space) */
  space: boolean;
  /** interiors: wall and skirting colours */
  wall?: string;
  trim?: string;
};

export const PLACES: Record<Setting, Place> = {
  town: { ground: "#b9a98a", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  countryside: { ground: "#86b45a", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  city: { ground: "#8d8f96", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  forest: { ground: "#6f9a4a", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  desert: { ground: "#e3c27e", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  beach: { ground: "#ecd7a2", waterFrom: -9, water: "#3fa3c9", interior: false, space: false },
  snow: { ground: "#eef3f8", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  harbor: { ground: "#a39a8a", waterFrom: -9, water: "#3d7fa8", interior: false, space: false },
  castle: { ground: "#7fa65a", waterFrom: null, water: "#4f8fc0", interior: false, space: false },
  lab: { ground: "#d9dde3", waterFrom: null, water: "#4f8fc0", interior: true, space: false, wall: "#eef0f2", trim: "#4a90c2" },
  home: { ground: "#b07a4a", waterFrom: null, water: "#4f8fc0", interior: true, space: false, wall: "#ecdcc0", trim: "#8a5a34" },
  office: { ground: "#8f9aa6", waterFrom: null, water: "#4f8fc0", interior: true, space: false, wall: "#e2e8ec", trim: "#5a6b7a" },
  classroom: { ground: "#c49a62", waterFrom: null, water: "#4f8fc0", interior: true, space: false, wall: "#efe6c8", trim: "#6b8f5a" },
  tavern: { ground: "#6f4a2e", waterFrom: null, water: "#4f8fc0", interior: true, space: false, wall: "#c9a77a", trim: "#5a3b22" },
  space: { ground: "#9a9aa2", waterFrom: null, water: "#4f8fc0", interior: false, space: true },
};

/** deterministic PRNG (mulberry32) */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const P = (model: string, x: number, z: number, scale = 1): Prop => ({ model, x, z, scale, rot_y: 0, parts: [] });
const TABLE: Prop["parts"] = [
  { shape: "box", size: [2.2, 0.1, 1.1], pos: [0, 0.95, 0], rot_y: 0, color: "#c9ccd2" },
  { shape: "box", size: [0.1, 0.9, 1.0], pos: [-1, 0.45, 0], rot_y: 0, color: "#6b7280" },
  { shape: "box", size: [0.1, 0.9, 1.0], pos: [1, 0.45, 0], rot_y: 0, color: "#6b7280" },
  { shape: "cylinder", size: [0.18, 0.4, 0.18], pos: [-0.5, 1.2, 0], rot_y: 0, color: "#7fd1b9" },
  { shape: "sphere", size: [0.3, 0.3, 0.3], pos: [0.4, 1.15, 0.1], rot_y: 0, color: "#f2b33d" },
];

const HOUSES = "abcdefghijklmnopqrstu".split("").map((c) => `city-kit-suburban/building-type-${c}`);
const TREES = ["tree_default", "tree_oak", "tree_detailed", "tree_fat", "tree_blocks"].map((n) => `nature-kit/${n}`);
const PINES = ["tree_pineDefaultA", "tree_pineRoundA", "tree_pineTallA", "tree_pineRoundC", "tree_pineDefaultB"].map((n) => `nature-kit/${n}`);
const ROCKS = ["rock_largeA", "rock_largeB", "rock_largeC", "rock_largeD"].map((n) => `nature-kit/${n}`);
const BUSHES = ["plant_bushLarge", "plant_bushDetailed", "plant_bush"].map((n) => `nature-kit/${n}`);
const CARS = ["sedan", "hatchback-sports", "van", "taxi", "suv", "police", "delivery"].map((n) => `car-kit/${n}`);
const PALMS = ["palm-straight", "palm-bend", "palm-detailed-straight"].map((n) => `pirate-kit/${n}`);
const SHIPS = ["ship-small", "ship-medium", "ship-large"].map((n) => `pirate-kit/${n}`);

const K = (pack: string, names: string[]) => names.map((n) => `${pack}/${n}`);
const FLOWERS = K("nature-kit", ["flower_redA", "flower_yellowA", "flower_purpleA", "plant_bushSmall"]);
const FARM = K("nature-kit", ["crops_cornStageD", "crop_pumpkin", "crops_wheatStageB", "stump_old", "log", "crop_melon"]);
const WOODS = K("nature-kit", ["stump_old", "log", "mushroom_red", "stump_oldTall", "plant_bushDetailed"]);
const CACTI = K("nature-kit", ["cactus_tall", "cactus_short"]);
const DOCK = K("pirate-kit", ["crate", "barrel", "crate-bottles", "chest", "cannon"]);
const part = (shape: "box" | "cylinder" | "sphere" | "cone", size: [number, number, number], pos: [number, number, number], color: string) =>
  ({ shape, size, pos, rot_y: 0, color });
const LAMP: Prop["parts"] = [
  part("cylinder", [0.14, 3.4, 0.14], [0, 1.7, 0], "#2d3138"),
  { ...part("box", [0.45, 0.55, 0.45], [0, 3.6, 0], "#ffd98a"), glow: true },
  part("cone", [0.7, 0.35, 0.7], [0, 4.05, 0], "#2d3138"),
];
const BENCH: Prop["parts"] = [
  part("box", [1.8, 0.1, 0.5], [0, 0.48, 0], "#a5754a"),
  part("box", [1.8, 0.45, 0.08], [0, 0.78, -0.22], "#a5754a"),
  part("box", [0.08, 0.48, 0.45], [-0.8, 0.24, 0], "#2d3138"),
  part("box", [0.08, 0.48, 0.45], [0.8, 0.24, 0], "#2d3138"),
];
const custom = (parts: Prop["parts"], x: number, z: number): Prop => ({ model: null, x, z, scale: 1, rot_y: 0, parts });
/** wall dressing: a glazed window (glows a little by day and at night), framed pictures, a clock */
const WINDOW: Prop["parts"] = [
  part("box", [1.9, 2.0, 0.08], [0, 2.3, 0], "#f3eee2"),
  { ...part("box", [1.6, 1.7, 0.1], [0, 2.3, 0.02], "#bfe3f7"), glow: true },
  part("box", [0.08, 1.7, 0.14], [0, 2.3, 0.05], "#f3eee2"),
  part("box", [1.6, 0.08, 0.14], [0, 2.3, 0.05], "#f3eee2"),
  part("box", [2.1, 0.12, 0.3], [0, 1.25, 0.1], "#f3eee2"),
];
const PICTURE = (c1: string, c2: string): Prop["parts"] => [
  part("box", [1.1, 0.8, 0.06], [0, 2.6, 0], "#6b4a33"),
  part("box", [0.95, 0.65, 0.08], [0, 2.6, 0.01], c1),
  part("sphere", [0.35, 0.35, 0.05], [0.15, 2.65, 0.05], c2),
];
const CLOCK: Prop["parts"] = [part("cylinder", [0.55, 0.55, 0.08], [0, 3.1, 0], "#f6f1e3"), part("box", [0.04, 0.2, 0.1], [0, 3.17, 0.05], "#241726"), part("box", [0.15, 0.04, 0.1], [0.06, 3.1, 0.05], "#241726")];
const onWall = (parts: Prop["parts"], x: number): Prop => ({ model: null, x, z: -6.95, scale: 1, rot_y: 0, parts: parts.map((q) => ({ ...q, pos: [q.pos[0], q.pos[1], q.pos[2]] as [number, number, number] })) });

const TOWNY = [...K("city-kit-suburban", ["planter", "tree-small"]), ...K("pirate-kit", ["barrel", "crate"]), ...BUSHES, ...FLOWERS];

/** background set dressing in layers: a packed back row (and a second one further away), a midground of smaller
 *  props between the actors and the back row, and a few framing props at the sides of the stage. The world drops
 *  or nudges anything that would intersect the stage or another prop. */
export const scatter = (setting: Setting, seed: number): Prop[] => {
  const r = rng(seed);
  const out: Prop[] = [];
  const any = (list: string[]) => list[Math.floor(r() * list.length)];
  const jitter = (a: number) => (r() - 0.5) * a;
  const row = (list: string[], z: number, x0: number, x1: number, step: number, scale = 1) => {
    for (let x = x0; x <= x1; x += step * (0.85 + 0.3 * r())) out.push(P(any(list), x, z + jitter(2), scale * (0.9 + 0.2 * r())));
  };
  /** n props scattered in a z band across x (the stage itself is kept clear by the world) */
  const band = (list: string[], n: number, z0: number, z1: number, xw: number, scale = 1) => {
    for (let i = 0; i < n; i++) out.push(P(any(list), jitter(xw * 2), z0 + (z1 - z0) * r(), scale * (0.8 + 0.4 * r())));
  };
  /** framing props left and right of the stage, close to the lens */
  const sides = (list: string[], n: number, scale = 1) => {
    for (let i = 0; i < n; i++) out.push(P(any(list), (i % 2 ? 1 : -1) * (5 + r() * 4), -1 - r() * 4, scale * (0.8 + 0.4 * r())));
  };
  const F = (names: string[]) => K("furniture-kit", names);
  /** interiors: windows and pictures on the back wall, tall furniture against it, a denser row of lower furniture
   *  in front, and props along the side walls */
  const backWall = (tall: string[], low: string[], centre = true) => {
    // the 9:16 frame only shows a few metres of the back wall: keep its windows near the middle
    out.push(onWall(WINDOW, -2.3), onWall(WINDOW, 2.3), onWall(PICTURE("#5a8fc2", "#f2c230"), -5.2), onWall(PICTURE("#6fae45", "#ffffff"), 5.2));
    if (centre) out.push(onWall(r() < 0.5 ? CLOCK : PICTURE("#d9a441", "#c0392b"), 0));
    for (let x = -7.4; x <= 7.4; x += 1.7 + 0.6 * r()) out.push(P(any(tall), x, -6.55));
    if (low.length) for (let x = -6.5; x <= 6.5; x += 2.2 + r()) out.push(P(any(low), x, -4.7 - r() * 0.6));
  };
  switch (setting) {
    case "town":
      row(HOUSES, -16, -42, 42, 12.5);
      row(HOUSES, -31, -56, 56, 12.5);
      band([...TOWNY, ...TREES, ...CARS], 30, -5, -12, 16, 0.9);
      for (let x = -12; x <= 12; x += 6) out.push(custom(r() < 0.6 ? LAMP : BENCH, x + jitter(2), -4.5 - r() * 2));
      sides([...BUSHES, ...TREES, "city-kit-suburban/planter"], 4, 0.8);
      break;
    case "city":
      row(HOUSES, -15, -42, 42, 12.5, 1.25);
      row(HOUSES, -31, -60, 60, 13, 1.6);
      band([...CARS, ...TOWNY], 30, -5, -11, 16);
      for (let x = -12; x <= 12; x += 5) out.push(custom(r() < 0.7 ? LAMP : BENCH, x + jitter(2), -4.5 - r() * 2));
      sides([...CARS, ...BUSHES, "city-kit-suburban/planter"], 4);
      break;
    case "countryside":
      row([...TREES, ...PINES], -24, -50, 50, 5, 1.1);
      row([...TREES, ...PINES], -42, -80, 80, 6, 1.4);
      out.push(P(any(HOUSES), 15 + jitter(6), -20), P(any(HOUSES), -18 + jitter(6), -26));
      row(K("nature-kit", ["fence_simple"]), -9, -20, 20, 3.4);
      band([...FARM, ...FLOWERS, ...BUSHES], 18, -5, -14, 18);
      sides([...BUSHES, ...TREES], 4);
      break;
    case "forest":
      for (let i = 0; i < 90; i++) out.push(P(r() < 0.6 ? any(PINES) : any(TREES), jitter(90), -6 - r() * 60, 0.9 + r() * 0.6));
      band(WOODS, 14, -4, -10, 14);
      sides([...PINES, ...TREES], 4);
      break;
    case "desert":
      row([...ROCKS, ...CACTI], -18, -45, 45, 6, 1.6);
      row(ROCKS, -40, -90, 90, 10, 4);
      band([...CACTI, ...ROCKS], 12, -5, -13, 16, 0.9);
      sides(CACTI, 4);
      break;
    case "beach":
      row(PALMS, -7, -26, -8, 4);
      row(PALMS, -7, 8, 26, 4);
      // ships sail off to the sides, never right behind the action
      out.push(P(any(SHIPS), 14 + jitter(3), -30), P(any(SHIPS), -20 + jitter(4), -46), P(any(SHIPS), 30, -60));
      band([...K("pirate-kit", ["rocks-sand-a", "rocks-sand-b", "barrel", "crate", "chest"]), ...K("nature-kit", ["canoe"])], 10, -3, -8, 14);
      sides(PALMS, 2);
      break;
    case "snow":
      for (let i = 0; i < 60; i++) out.push(P(r() < 0.8 ? any(PINES) : any(ROCKS), jitter(90), -10 - r() * 55, 0.9 + r() * 0.6));
      band([...WOODS.slice(0, 2), ...ROCKS], 10, -4, -10, 14, 0.7);
      sides(PINES, 4);
      break;
    case "harbor":
      out.push(P(any(SHIPS), -7 + jitter(4), -20), P(any(SHIPS), 10 + jitter(4), -26), P(any(SHIPS), -18, -40), P(any(SHIPS), 22, -44));
      row(HOUSES, -3, -48, -13, 12.5);
      row(HOUSES, -3, 13, 48, 12.5);
      band(DOCK, 12, -4, -8.5, 12);
      sides(DOCK, 4);
      break;
    case "castle":
      out.push(P("castle-kit/tower-square", -14, -24, 1.4), P("castle-kit/tower-square", 14, -24, 1.4), P("castle-kit/tower-slant-roof", 0, -34, 1.6));
      row(["castle-kit/wall"], -26, -12, 12, 4.4);
      row(TREES, -16, -44, -18, 5);
      row(TREES, -16, 18, 44, 5);
      band([...K("castle-kit", ["flag-banner-long", "rocks-small", "tree-small", "siege-catapult"]), ...BUSHES], 12, -6, -14, 16);
      sides([...TREES, ...BUSHES], 4);
      break;
    case "lab":
      for (const z of [-4.4, -5.9]) for (const x of [-5.5, -2, 2, 5.5]) out.push({ x: x + jitter(1), z, scale: 1, rot_y: 0, model: null, parts: TABLE });
      backWall(F(["bookcaseClosed", "kitchenFridge", "bookcaseClosedWide"]), F(["computerScreen", "pottedPlant"]));
      sides(F(["cardboardBoxClosed", "trashcan", "pottedPlant"]), 4);
      break;
    case "home":
      backWall(F(["bookcaseOpen", "cabinetTelevision", "lampSquareFloor", "pottedPlant", "kitchenFridge", "coatRackStanding"]), F(["loungeSofa", "tableCoffee", "loungeChair"]));
      out.push(P("furniture-kit/rugRectangle", jitter(2), -1.5, 1.6), P("furniture-kit/rugRound", 5.5, -3, 1.2));
      sides(F(["loungeChair", "pottedPlant", "sideTable", "lampSquareFloor"]), 4);
      break;
    case "office":
      backWall(F(["bookcaseClosed", "bookcaseClosedDoors", "pottedPlant", "lampSquareFloor"]), F(["desk", "deskCorner"]));
      for (const x of [-6, -2.5, 2.5, 6]) out.push(P("furniture-kit/chairDesk", x + jitter(1), -3.9));
      sides(F(["pottedPlant", "trashcan", "cardboardBoxClosed", "coatRackStanding"]), 4);
      break;
    case "classroom":
      out.push({ model: null, x: 0, z: -6.95, scale: 1, rot_y: 0, parts: [part("box", [4.6, 2.0, 0.08], [0, 2.5, 0], "#2f4f3a"), part("box", [4.9, 0.12, 0.2], [0, 1.45, 0.05], "#8a5a34"),
        part("box", [1.4, 0.05, 0.02], [-1, 3, 0.05], "#f6f1e3"), part("box", [0.9, 0.05, 0.02], [0.6, 2.6, 0.05], "#f6f1e3")] });
      for (const z of [-3.9, -5.4]) for (const x of [-6.6, -4.4, 4.4, 6.6]) out.push(P("furniture-kit/desk", x, z), P("furniture-kit/chair", x, z + 0.75));
      backWall(F(["bookcaseOpen", "pottedPlant"]), [], false);
      sides(F(["bookcaseOpenLow", "pottedPlant", "trashcan"]), 4);
      break;
    case "tavern":
      out.push(...[-6, -4.4, -2.8, -1.2, 0.4].map((x) => P("furniture-kit/kitchenBar", x, -6.4)));
      for (const x of [-5.2, -3.6, -2, -0.4]) out.push(P("furniture-kit/stoolBar", x + jitter(0.3), -5.3));
      for (const [x, z] of [[-6.4, -3.6], [6.2, -3.6], [5.6, -5.6]] as const) out.push(P("furniture-kit/tableRound", x, z), P("furniture-kit/chair", x - 0.9, z), P("furniture-kit/chair", x + 0.9, z));
      out.push(P("pirate-kit/barrel", 7.2, -6.6), P("pirate-kit/barrel", 6.1, -6.7), P("pirate-kit/crate-bottles", -7.4, -6.6));
      for (const x of [-4.5, 0, 4.5]) out.push(onWall([{ ...part("box", [0.3, 0.4, 0.3], [0, 3.2, 0.2], "#ffc65c"), glow: true }, part("box", [0.08, 0.5, 0.3], [0, 3.55, 0.05], "#3b2a20")], x));
      out.push(onWall(PICTURE("#8a5a34", "#d9a441"), -2.5), onWall(PICTURE("#5a3b22", "#c0392b"), 2.5));
      sides([...F(["chair", "tableRound"]), "pirate-kit/barrel"], 4);
      break;
    case "space":
      row(ROCKS, -14, -45, 45, 5, 1.5);
      band([...ROCKS, "nature-kit/statue_obelisk"], 12, -5, -12, 16, 0.8);
      sides(ROCKS, 4);
      break;
  }
  return out.filter((p) => !p.model || p.model in CATALOG);
};
