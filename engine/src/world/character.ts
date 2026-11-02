// Story actors as camera-facing 2D cards drawn every frame with the vendored toon pen.
import * as THREE from "three";
import { NOINK } from "../vendor/ink";
import { Pen, bodyFront, bodySide, shade, type Expr, type Outfit } from "../vendor/toon";
import type { Actor, CastMember, Expression } from "../types";
import { ANIMALS3D } from "./models";
import { hashString, rng } from "./look";

/** metres per design unit: the 600 x 1000 design canvas is 1.30 x 2.16 m, soles at y = 975 */
export const SU = 0.00216;
const K = 0.8; // canvas pixels per design unit (480 x 800 px per card)

const EXPR: Record<Expression, Expr> = {
  neutral: "neutral", happy: "grin", sad: "sad", angry: "angry", surprised: "shock",
  scared: "scared", smug: "smile", thinking: "whistle",
};

export const outfitOf = (m: CastMember): Outfit => {
  const elder = m.kind === "elder";
  const r = rng(hashString(m.id));
  const pickc = (v: string | null, list: string[]) => v ?? list[Math.floor(r() * list.length)];
  const shirt = pickc(m.shirt, ["#c0392b", "#2c6fbb", "#2e8b57", "#8e44ad", "#d35400", "#16a085"]);
  const o: Outfit = {
    jacket: shirt, pants: pickc(m.pants, ["#2c3e50", "#3b3f52", "#5a4632"]), boots: "#4a3426",
    skin: pickc(m.skin, ["#ffe2c2", "#f5c9a0", "#ecd0b6", "#c99067", "#8d5a3b"]),
    build: m.kind === "kid" ? "kid" : "adult",
  };
  o.hat = null; // bald bean heads: no hats, no hair
  return o;
};

export type Pose = {
  x: number; y: number; z: number;
  side: boolean; flip: boolean; mode: "stand" | "sit" | "fall" | "stroll";
  phase: number; expr: Expr; wave?: number; tilt: number; headTilt: number; blink: number; stride: number;
  /** eyes: -1 look left .. 1 look right (listeners look at whoever speaks) */
  look?: number;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * u * (u * (u * 6 - 15) + 10); };

/** horizontal compression of the actors' marks (the vertical frame only shows a few metres across) */
export const SQUEEZE = 0.55;

export type ActorTiming = { frames: number; talk: [number, number][]; hit: number | null };

/** pose of an actor at local frame f of its scene */
export const poseAt = (a: Actor, f: number, t: ActorTiming, seed: number): Pose => {
  const r = rng(seed);
  const blinkEvery = 45 + Math.floor(r() * 40), blinkOff = Math.floor(r() * 40);
  const blink = (f + blinkOff) % blinkEvery < 4 ? 1 : 0;
  const base: Pose = {
    x: a.x * SQUEEZE, y: 0, z: a.z, side: false, flip: false, mode: "stand", phase: 0, expr: EXPR[a.expression],
    tilt: 0, headTilt: 1.5 * Math.sin(f / 22 + seed), blink, stride: 1,
  };
  const hit = t.hit ?? Math.min(10, t.frames - 1);
  switch (a.action) {
    case "walk":
    case "run": {
      const run = a.action === "run";
      const ax = a.x * SQUEEZE, to = (a.to_x ?? a.x + (run ? 5 : 3)) * SQUEEZE;
      const f0 = 3, f1 = Math.max(f0 + 1, t.frames * 0.85);
      const u = clamp01((f - f0) / (f1 - f0));
      const x = ax + (to - ax) * smooth(u);
      const moving = u > 0 && u < 1 && Math.abs(to - ax) > 0.05;
      const travelled = Math.abs(x - ax);
      return {
        ...base, x, side: moving, flip: to < ax, mode: moving ? "stroll" : "stand",
        phase: travelled / (run ? 2.4 : 1.6), stride: run ? 1.5 : 1, tilt: run && moving ? 6 : 0,
      };
    }
    case "jump":
      return { ...base, y: 0.55 * Math.abs(Math.sin((Math.PI * f) / 18)), wave: 1, expr: base.expr === "neutral" ? "grin" : base.expr };
    case "cheer":
      return { ...base, y: 0.15 * Math.abs(Math.sin((Math.PI * f) / 14)), wave: 0.5 + 0.5 * Math.sin(f / 3), expr: "grin" };
    case "shocked": {
      const k = f - hit;
      return { ...base, y: k >= 0 && k < 8 ? 0.25 * Math.sin((Math.PI * k) / 8) : 0, wave: 1, expr: k >= 0 ? "shock" : base.expr };
    }
    case "fall": {
      const k = f - hit;
      if (k < 0) return { ...base, expr: "scared" };
      return { ...base, mode: "fall", expr: k < 30 ? "shock" : "dazed", y: k < 6 ? 0.3 * Math.sin((Math.PI * k) / 6) : 0 };
    }
    case "sit":
      return { ...base, mode: "sit" };
    case "point":
      return { ...base, wave: 0.15, headTilt: 0 };
    case "talk": {
      const speaking = t.talk.some(([s, e]) => f >= s && f < e);
      return { ...base, expr: speaking && (f >> 2) % 2 === 0 ? "talk" : base.expr, headTilt: speaking ? 3 * Math.sin(f / 5) : base.headTilt };
    }
    default:
      return base;
  }
};

export const heightOf = (m: CastMember) =>
  m.species && m.species !== "human" ? ANIMALS3D[m.species]?.h ?? 1 : m.kind === "kid" ? 1.25 : 1.7;

export interface ActorView {
  readonly root: THREE.Group;
  update(p: Pose, camera: THREE.Camera, t: number): void;
}

export class Card implements ActorView {
  readonly root = new THREE.Group();
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private card: THREE.Mesh;
  private outfit: Outfit;
  private elder = false;
  private seed: number;
  private last = "";

  constructor(member: CastMember, tint: string, contact: THREE.Texture) {
    this.canvas.width = 600 * K;
    this.canvas.height = 1000 * K;
    this.ctx = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.outfit = outfitOf(member);
    this.elder = member.kind === "elder";
    this.seed = (hashString(member.id) % 97) + 1;
    const geo = new THREE.PlaneGeometry(600 * SU, 1000 * SU);
    geo.translate(0, 1000 * SU * 0.5 - 25 * SU, 0);
    this.card = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, color: tint, side: THREE.DoubleSide, fog: true }));
    this.card.layers.set(NOINK);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.6),
      new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, fog: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.layers.set(NOINK);
    this.root.add(this.card, blob);
  }

  update(p: Pose, camera: THREE.Camera, _t = 0) {
    this.root.position.set(p.x, 0, p.z);
    this.card.position.y = p.y;
    this.card.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    const key = JSON.stringify([p.side, p.flip, p.mode, p.phase.toFixed(3), p.expr, p.wave?.toFixed(2), p.tilt, p.headTilt.toFixed(1), p.blink, p.look?.toFixed(1)]);
    if (key === this.last) return;
    this.last = key;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (p.flip) g.setTransform(-K, 0, 0, K, this.canvas.width, 0);
    else g.setTransform(K, 0, 0, K, 0, 0);
    const pen = new Pen(g);
    if (p.side) {
      bodySide(pen, this.outfit, { phase: p.phase, expr: p.expr, mode: "march", blink: p.blink, stride: 0.55 * p.stride, stomp: 0.6, seed: this.seed });
    } else {
      const o = this.elder ? 4 : 0; // elders stoop a little
      bodyFront(pen, this.outfit, {
        mode: p.mode, phase: p.phase, expr: p.expr, blink: p.blink, wave: p.wave, tilt: p.tilt + o,
        headTilt: p.headTilt, seed: this.seed, facing: p.flip ? -1 : p.look && Math.abs(p.look) > 0.4 ? (p.look > 0 ? 1 : -1) : 0, look: p.look ?? 0,
      });
    }
    this.tex.needsUpdate = true;
  }
}

let contactTex: THREE.CanvasTexture | null = null;
export const contactShadow = () => {
  if (contactTex) return contactTex;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 32, 0, 64, 32, 60);
  gr.addColorStop(0, "rgba(20,15,30,0.55)"); gr.addColorStop(0.5, "rgba(20,15,30,0.3)"); gr.addColorStop(1, "rgba(20,15,30,0)");
  g.setTransform(1, 0, 0, 0.5, 0, 16);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  contactTex = new THREE.CanvasTexture(c);
  contactTex.colorSpace = THREE.SRGBColorSpace;
  return contactTex;
};
