// One scene of the story as a three.js world, posed per frame: place, props, actors, camera and effects.
import * as THREE from "three";
import { NOINK } from "../vendor/ink";
import { Pen, fxBurst, fxCloud, fxPuff, fxSplash, fxStars } from "../vendor/toon";
import type { Beat, Camera, CastMember, Scene, Symbol } from "../types";
import { Card, contactShadow, heightOf, poseAt, type ActorTiming, type ActorView } from "./character";
import { LIGHTS, PLACES, hashString, rng, scatter } from "./look";
import { buildProp, propRadius } from "./props";
import { AnimalModel, hasAnimal3D } from "./models";

export type SceneTimes = { frames: number; talk: [number, number][]; hit: number | null; beats?: Beat[] };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smoother = (x: number) => { const u = clamp01(x); return u * u * u * (u * (u * 6 - 15) + 10); };
const rad = (d: number) => (d * Math.PI) / 180;

const SHOT = {
  wide: { dist: 14, h: 2.8, look: 2.4, fov: 42 },
  medium: { dist: 5.6, h: 1.5, look: 1.65, fov: 38 },
  close: { dist: 2.6, h: 1.45, look: 1.45, fov: 34 },
  aerial: { dist: 18, h: 15, look: 0, fov: 44 },
  low: { dist: 4.2, h: 0.4, look: 2.0, fov: 46 },
} as const;

const skyMaterial = (top: string, horizon: string) =>
  new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
      #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });

const cardTexture = (w: number, h: number, draw: (p: Pen) => void) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  draw(new Pen(g));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx: g, tex: t };
};

class FxCard {
  readonly mesh: THREE.Mesh;
  private c: ReturnType<typeof cardTexture>;
  constructor(private w: number, private h: number, private draw: (p: Pen, t: number) => void, size: number) {
    this.c = cardTexture(w, h, () => {});
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, (size * h) / w),
      new THREE.MeshBasicMaterial({ map: this.c.tex, transparent: true, depthWrite: false, fog: false }));
    this.mesh.layers.set(NOINK);
    this.mesh.visible = false;
  }
  set(t: number | null) {
    this.mesh.visible = t !== null && t >= 0 && t <= 1;
    if (!this.mesh.visible) return;
    this.c.ctx.clearRect(0, 0, this.w, this.h);
    this.draw(new Pen(this.c.ctx), t!);
    this.c.tex.needsUpdate = true;
  }
}

/** painted ground: base colour with soft lighter/darker patches, plus cobbles/paving lines in built-up places */
const groundTexture = (color: string, setting: string, seed: number) => {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!, r = rng(seed + 77), base = new THREE.Color(color);
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const k = 0.9 + r() * 0.2, col = base.clone().multiplyScalar(k);
    g.fillStyle = `#${col.getHexString()}`;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, 6 + r() * 30, 4 + r() * 18, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  if (["town", "harbor", "castle"].includes(setting)) {
    g.strokeStyle = `#${base.clone().multiplyScalar(0.78).getHexString()}`;
    g.lineWidth = 2;
    for (let y = 0; y < 512; y += 32)
      for (let x = (y / 32) % 2 ? 16 : 0; x < 512; x += 32) g.strokeRect(x + 1, y + 1, 30, 30);
  } else if (setting === "city") {
    g.strokeStyle = `#${base.clone().multiplyScalar(0.8).getHexString()}`;
    g.lineWidth = 3;
    for (let y = 0; y < 512; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    for (let x = 0; x < 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(240, 240);
  t.anisotropy = 8;
  return t;
};

const CROWD_SHIRTS = ["#c0392b", "#2c6fbb", "#2e8b57", "#8e44ad", "#d35400", "#16a085", "#7f8c8d", "#b7950b", "#6d4c41"];
const CROWD_PANTS = ["#2c3e50", "#3b3f52", "#5a4632", "#4a4a4a"];
const CROWD_SKINS = ["#ffe2c2", "#f5c9a0", "#ecd0b6", "#c99067", "#8d5a3b"];

/** cartoon emotion symbols popping over a head, drawn on a 300 x 300 canvas */
const drawSymbol = (p: Pen, sym: Symbol, t: number) => {
  const g = p.g;
  const text = (txt: string, col: string, size: number, x = 150, y = 170) => {
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 18; g.strokeStyle = "#241726"; g.lineJoin = "round"; g.strokeText(txt, x, y);
    g.fillStyle = col; g.fillText(txt, x, y);
  };
  switch (sym) {
    case "exclaim": text("!", "#ffd84a", 230); break;
    case "question": text("?", "#ffffff", 220); break;
    case "zzz": text("Z", "#cfe3ff", 90, 120, 200); text("z", "#cfe3ff", 70, 190, 130); break;
    case "sweat":
      p.poly([[150, 60], [200, 170], [150, 230], [100, 170]], "#8fd3ff", 10);
      p.ell(150, 180, 50, 50, "#8fd3ff", 0);
      break;
    case "anger":
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        const ang = (k: number) => (k * Math.PI) / 2 + Math.PI / 4;
        p.line([[150 + 28 * Math.cos(ang(a)), 150 + 28 * Math.sin(ang(a))], [150 + 95 * Math.cos(ang(a) + 0.35), 150 + 95 * Math.sin(ang(a) + 0.35)]], "#e0393b", 26);
        void b;
      }
      break;
    case "stars": fxStars(p, t); break;
    case "hearts":
      for (const [x, y, r] of [[110, 160, 40], [195, 110, 28]] as const) {
        p.poly([[x, y + r * 1.4], [x - r * 1.3, y], [x - r * 0.65, y - r * 0.8], [x, y - r * 0.25], [x + r * 0.65, y - r * 0.8], [x + r * 1.3, y]], "#ff5d7a", 9);
      }
      break;
    case "idea":
      p.ell(150, 130, 70, 75, "#fff3a0", 12);
      p.poly([[120, 195], [180, 195], [172, 245], [128, 245]], "#c9ccd2", 10);
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.45; p.stroke([[150 + 95 * Math.cos(a), 130 + 95 * Math.sin(a)], [150 + 125 * Math.cos(a), 130 + 125 * Math.sin(a)]], 12, "#ffd84a"); }
      break;
  }
};

/** shot size that follows another one when a long scene needs an automatic cut */
const NEXT_SHOT: Record<Camera["shot"], Camera["shot"]> = { wide: "medium", medium: "close", close: "medium", low: "medium", aerial: "wide" };

export class World {
  readonly root = new THREE.Group();
  readonly light;
  private copies: { a: Scene["actors"][number]; k: number; dx: number; dz: number; view: ActorView }[] = [];
  private props: { obj: THREE.Object3D; r: number }[] = [];
  private sun = new THREE.DirectionalLight();
  private fx: FxCard[] = [];
  private confetti: THREE.InstancedMesh | null = null;
  private symbols: { beat: Beat; card: FxCard; h: number }[] = [];
  /** camera changes on beats (plus an automatic cut in long single-shot scenes), in frame order */
  private camBeats: { frame: number; camera: Camera }[] = [];
  /** the camera in use for the current frame and the frame it started on */
  private cam: Camera;
  private camStart = 0;
  private seed: number;

  /** every prop of a scene: background scatter for the setting + the story's own props */
  static propsFor(scene: Scene, index: number) {
    return [...scatter(scene.setting, World.seedOf(scene, index)), ...scene.props];
  }

  static seedOf(scene: Scene, index: number) {
    return hashString(`${index}:${scene.setting}:${scene.narration}`);
  }

  constructor(private scene: Scene, private cast: CastMember[], index: number, private times: SceneTimes) {
    this.seed = World.seedOf(scene, index);
    const L = (this.light = LIGHTS[scene.time]);
    const place = PLACES[scene.setting];
    const night = scene.time === "night";
    const skyTop = place.space ? "#05060f" : L.skyTop, skyHorizon = place.space ? "#151a33" : L.skyHorizon;

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial(skyTop, skyHorizon));
    sky.layers.set(NOINK);
    this.root.add(sky);
    if (L.stars || place.space) this.root.add(this.stars());
    if (L.clouds && !place.space && !place.interior) this.clouds();
    if (place.space) {
      const planet = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: "#4f8fd8", fog: false }));
      planet.position.set(-120, 140, -500);
      planet.layers.set(NOINK);
      this.root.add(planet);
    }

    const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
    this.sun.color.set(L.sun);
    this.sun.intensity = L.sunIntensity;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.002;
    this.sun.shadow.normalBias = 0.1;
    this.root.add(hemi, this.sun, this.sun.target);

    this.root.add(this.ground(place.ground, place.waterFrom, place.water, place.interior));

    // the story's own props first, then background scatter only where it does not intersect anything already
    // placed or the stage where the actors stand (so houses never merge into each other)
    const placed: THREE.Box3[] = [];
    const stage = new THREE.Box3(new THREE.Vector3(-6, -1, -3.5), new THREE.Vector3(6, 5, 4));
    const scenery = scatter(scene.setting, this.seed);
    [...scene.props, ...scenery].forEach((p, i) => {
      const background = i >= scene.props.length;
      const obj = buildProp(p, this.seed + i * 7919);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      box.min.y = -1;
      const clash = (b: THREE.Box3) => {
        const sh = b.clone().expandByVector(new THREE.Vector3(-0.15, 0, -0.15));
        return sh.intersectsBox(stage) || placed.some((q) => q.intersectsBox(sh));
      };
      if (background && clash(box)) {
        // nudge sideways before giving up, so the set stays full instead of thinning out
        const w = box.max.x - box.min.x + 0.4;
        const step = [w, -w, 2 * w, -2 * w].find((dx) => !clash(box.clone().translate(new THREE.Vector3(dx, 0, 0))));
        if (step === undefined) return;
        obj.position.x += step;
        box.translate(new THREE.Vector3(step, 0, 0));
      }
      placed.push(box);
      this.props.push({ obj, r: propRadius(obj) });
      this.root.add(obj);
    });

    const contact = contactShadow();
    for (const a of scene.actors) {
      const m = cast.find((c) => c.id === a.id);
      if (!m) continue;
      const animal = !!m.species && m.species !== "human";
      if (animal && !hasAnimal3D(m.species!)) continue;
      const n = a.count ?? 1, r = rng(hashString(a.id) + 3);
      for (let k = 0; k < n; k++) {
        // crowd/herd in compact rows of 5 around the mark (copy 0 in the middle of the front row), slight jitter
        const sx = animal ? heightOf(m) * 1.3 : 0.65, sz = animal ? heightOf(m) * 1.0 : 0.8;
        const col = k % 5, rowN = Math.floor(k / 5), slot = [0, -1, 1, -2, 2][col];
        const dx = slot * sx + (k ? (r() - 0.5) * sx * 0.4 : 0) + (rowN % 2 ? sx / 2 : 0);
        const dz = -rowN * sz + (k ? (r() - 0.5) * sz * 0.3 : 0);
        // crowd copies are different people: own colours and head shape, same hat
        const who = k && !animal ? {
          ...m, id: `${m.id}_${k}`,
          shirt: CROWD_SHIRTS[(k * 7 + n) % CROWD_SHIRTS.length], pants: CROWD_PANTS[k % CROWD_PANTS.length],
          skin: CROWD_SKINS[(k * 3) % CROWD_SKINS.length],
        } : m;
        const view: ActorView = animal ? new AnimalModel(m.species!, contact) : new Card(who, L.cardTint, contact);
        this.copies.push({ a, k, dx, dz, view });
        this.root.add(view.root);
      }
    }
    if (night) this.nightLights();
    this.effects();
    this.cam = scene.camera;
    const beats = times.beats ?? [];
    for (const b of beats) {
      if (b.camera) this.camBeats.push({ frame: b.frame, camera: { ...b.camera, target: b.camera.target ?? null } });
      if (b.symbol) {
        const who = b.actor ?? scene.camera.target ?? scene.actors[0]?.id;
        const m = cast.find((c) => c.id === who);
        const sym = b.symbol;
        const card = new FxCard(300, 300, (p, t) => drawSymbol(p, sym, t), 0.75);
        this.root.add(card.mesh);
        this.symbols.push({ beat: { ...b, actor: who ?? null }, card, h: m ? heightOf(m) : 1.7 });
      }
    }
    // rhythm: a scene that stays on one shot for more than ~2.5 s gets a cut to the next shot size mid-sentence
    const talk = times.talk;
    if (!this.camBeats.length && talk.length > 2 && talk[talk.length - 1][1] - talk[0][0] > 75 && scene.actors.length) {
      const mid = talk[Math.floor(talk.length / 2)][0];
      const shot = NEXT_SHOT[scene.camera.shot];
      this.camBeats.push({ frame: mid, camera: { ...scene.camera, shot, move: "push", target: scene.camera.target ?? (shot === "close" ? scene.actors[0].id : null) } });
    }
    this.camBeats.sort((x, y) => x.frame - y.frame);
  }

  private ground(color: string, waterFrom: number | null, water: string, interior: boolean) {
    const g = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ map: groundTexture(color, this.scene.setting, this.seed) });
    const near = 60, depth = waterFrom === null ? 1200 : near - waterFrom;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1200, depth), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.z = waterFrom === null ? 0 : near - depth / 2;
    plane.receiveShadow = true;
    mat.map!.repeat.set(1200 / 5, depth / 5);
    g.add(plane);
    if (waterFrom !== null) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1200, 1.2, 0.6), new THREE.MeshToonMaterial({ color: "#7d7468" }));
      edge.position.set(0, -0.6, waterFrom);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1000), new THREE.MeshToonMaterial({ color: water }));
      w.rotation.x = -Math.PI / 2;
      w.position.set(0, -0.7, waterFrom - 500);
      w.receiveShadow = true;
      g.add(edge, w);
    }
    if (interior) {
      const wall = new THREE.MeshToonMaterial({ color: "#eef0f2" });
      const back = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 0.3), wall);
      back.position.set(0, 3.5, -7.5);
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 24), wall);
      left.position.set(-10, 3.5, 2);
      const right = left.clone();
      right.position.x = 10;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 0.32), new THREE.MeshToonMaterial({ color: "#4a90c2" }));
      stripe.position.set(0, 1.2, -7.5);
      for (const m of [back, left, right]) m.receiveShadow = true;
      g.add(back, left, right, stripe);
    }
    return g;
  }

  /** night: a moon, warm point lights at glowing parts nearest the stage, a warm rim on the actors */
  private nightLights() {
    const moon = new THREE.Mesh(new THREE.CircleGeometry(18, 40), new THREE.MeshBasicMaterial({ color: "#f6f1d6", fog: false }));
    moon.position.set(-140, 260, -700);
    moon.lookAt(0, 0, 0);
    moon.layers.set(NOINK);
    this.root.add(moon);
    const glows: { pos: THREE.Vector3; color: string }[] = [];
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      if (o.userData.glow) glows.push({ pos: o.getWorldPosition(new THREE.Vector3()), color: o.userData.glow as string });
    });
    glows.sort((a, b) => a.pos.length() - b.pos.length());
    for (const g of glows.slice(0, 8)) {
      const l = new THREE.PointLight(g.color, 14, 12, 1.5);
      l.position.copy(g.pos);
      this.root.add(l);
    }
    const rim = new THREE.DirectionalLight("#ffb46b", 0.7);
    rim.position.set(6, 5, -10);
    this.root.add(rim);
  }

  private stars() {
    const r = rng(this.seed + 5), n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, y = 0.08 + r() * 0.92, s = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * s * 800, y * 800, Math.sin(th) * s * 800], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, fog: false }));
    pts.layers.set(NOINK);
    return pts;
  }

  private clouds() {
    const r = rng(this.seed + 9);
    for (let i = 0; i < 7; i++) {
      const { tex } = cardTexture(600, 400, (p) => fxCloud(p, i + 1));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.92 }));
      m.position.set((r() - 0.5) * 700, 70 + r() * 90, -380 - r() * 200);
      m.layers.set(NOINK);
      this.root.add(m);
    }
  }

  private effects() {
    const e = this.scene.effect;
    if (e === "explosion") this.fx.push(new FxCard(500, 500, (p, t) => fxBurst(p, t, "#ffd36b", 12), 6));
    if (e === "explosion" || e === "smoke")
      for (let i = 0; i < 5; i++) this.fx.push(new FxCard(300, 300, (p, t) => fxPuff(p, t), 3.2 + i * 0.4));
    if (e === "splash") this.fx.push(new FxCard(800, 800, (p, t) => fxSplash(p, t), 7));
    if (e === "confetti") {
      const n = 160, m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
      const cols = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6", "#ffffff"].map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) m.setColorAt(i, cols[i % cols.length]);
      m.layers.set(NOINK);
      m.visible = false;
      this.confetti = m;
      this.root.add(m);
    }
    for (const f of this.fx) this.root.add(f.mesh);
  }

  private actorPos(id: string, f: number) {
    const a = this.scene.actors.find((x) => x.id === id);
    if (!a) return null;
    const p = poseAt(a, f, this.actorTiming(), hashString(id));
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  private actorTiming(): ActorTiming {
    return { frames: this.times.frames, talk: this.times.talk, hit: this.times.hit };
  }

  /** where the camera looks: its target actor, else the middle of the actors, else the scene centre */
  private focus(f: number) {
    const t = this.cam.target;
    const p = t ? this.actorPos(t, f) : null;
    if (p) return p;
    const pts = this.scene.actors.map((a) => this.actorPos(a.id, f)!).filter(Boolean);
    if (!pts.length) return new THREE.Vector3(0, 0, -4);
    const c = new THREE.Vector3();
    pts.forEach((v) => c.add(v));
    return c.divideScalar(pts.length);
  }

  private subjectIsAnimal() {
    const t = this.cam.target ?? this.scene.actors[0]?.id;
    const m = this.cast.find((c) => c.id === t);
    return !!m && !!m.species && m.species !== "human";
  }

  private subjectHeight() {
    const t = this.cam.target;
    const ids = t ? [t] : this.scene.actors.map((a) => a.id);
    const hs = ids.map((id) => this.cast.find((c) => c.id === id)).filter(Boolean).map((m) => heightOf(m!));
    return hs.length ? Math.max(...hs) : 1.7;
  }

  update(f: number, camera: THREE.PerspectiveCamera) {
    const { frames, hit } = this.times;
    const active = [...this.camBeats].reverse().find((b) => b.frame <= f);
    this.cam = active ? active.camera : this.scene.camera;
    this.camStart = active ? active.frame : 0;
    const cam = this.cam, r = rng(this.seed + 1 + (active ? active.frame : 0));
    const empty = this.scene.actors.length === 0;
    const base = SHOT[empty && (cam.shot === "close" || cam.shot === "low") ? "medium" : cam.shot];
    // frame the subject by its size: a mouse close-up is much closer and lower than a horse close-up
    const subj = this.subjectHeight() / 1.7;
    const k = cam.shot === "wide" || cam.shot === "aerial" ? Math.max(1, subj) : Math.min(1.9, Math.max(0.28, subj));
    // animals carry their head lower in their silhouette than people do
    const low = this.subjectIsAnimal() && cam.shot !== "wide" && cam.shot !== "aerial" ? 0.62 : 1;
    // animals are wider than tall: step back so the whole body fits the vertical frame
    const S = { dist: base.dist * k * (low < 1 ? 1.6 : 1), h: base.h * k * low, look: base.look * k * low, fov: base.fov };
    const u = smoother((f - this.camStart) / Math.max(1, frames - 1 - this.camStart));
    const az0 = (r() - 0.5) * 24, roll0 = (r() - 0.5) * 4;
    let dist: number = S.dist, az = az0, panX = 0;
    switch (cam.move) {
      case "push": dist *= 1 - 0.2 * u; break;
      case "pull": dist *= 0.8 + 0.2 * u; break;
      case "orbit": az += -16 + 32 * u; break;
      case "pan": panX = -1.6 + 3.2 * u; break;
      case "static": dist *= 1 - 0.05 * u; break;
    }
    // the focus glides with walking actors, softened so the camera does not jitter
    const target = this.focus(Math.min(frames - 1, f)).clone().lerp(this.focus(this.camStart), 0.35);
    target.y = 0;
    const look = new THREE.Vector3(target.x + panX, S.look, target.z);
    camera.position.set(
      look.x + Math.sin(rad(az)) * dist,
      S.h + (cam.shot === "aerial" ? 0 : 0),
      look.z + Math.cos(rad(az)) * dist,
    );
    // impacts: a flip-sign kick that decays over 8 frames
    const kick = hit !== null && (this.scene.effect === "shake" || this.scene.effect === "explosion") ? f - hit : -1;
    let roll = roll0 + (cam.angle === "dutch" ? 10 : 0);
    if (kick >= 0 && kick < 8) {
      const a = 0.14 * (1 - kick / 8) * (kick % 2 ? -1 : 1);
      camera.position.x += a;
      camera.position.y += a * 0.6;
      roll += a * 30;
    }
    // punch-in: a quick 12-frame zoom bump when something happens to the subject on a word
    const subject = cam.target ?? this.scene.actors[0]?.id;
    const punch = (this.times.beats ?? []).filter((b) => !b.camera && (b.symbol || b.expression || b.action) && (b.actor ?? subject) === subject)
      .map((b) => f - b.frame).filter((d) => d >= 0 && d < 12)
      .reduce((m, d) => Math.max(m, d < 3 ? d / 3 : 1 - (d - 3) / 9), 0);
    camera.fov = S.fov * (1 - 0.12 * punch);
    camera.near = 0.1;
    camera.far = 2000;
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    camera.rotateZ(rad(roll));
    camera.updateProjectionMatrix();

    // sun: fixed relative to the camera so every shot is lit from the upper side
    const L = this.light, sAz = rad(az + L.sunAz), sEl = rad(L.sunEl);
    this.sun.position.set(look.x + Math.sin(sAz) * Math.cos(sEl) * 80, Math.sin(sEl) * 80, look.z + Math.cos(sAz) * Math.cos(sEl) * 80);
    this.sun.target.position.copy(look);
    this.sun.target.updateMatrixWorld();

    // actors
    const closeUp = this.subjectIsAnimal() && (cam.shot === "close" || cam.shot === "medium");
    const subjectId = cam.target ?? this.scene.actors[0]?.id;
    const beats = this.times.beats ?? [];
    const acted = (a: Scene["actors"][number]) => {
      const b = [...beats].reverse().find((x) => x.frame <= f && x.actor === a.id && (x.expression || x.action));
      return b ? { a: { ...a, expression: b.expression ?? a.expression, action: b.action ?? a.action }, from: b.action ? b.frame : 0 } : { a, from: 0 };
    };
    const speaker = this.scene.actors.map(acted).find((x) => x.a.action === "talk");
    const speakerX = speaker ? poseAt(speaker.a, f, this.actorTiming(), hashString(speaker.a.id)).x : null;
    for (const c of this.copies) {
      if (c.view instanceof AnimalModel) c.view.closeUp = closeUp && c.a.id === subjectId && c.k === 0;
      const { a: who, from } = acted(c.a);
      const tm = this.actorTiming();
      const pose = from
        ? poseAt(who, f - from, { frames: tm.frames - from, talk: tm.talk.map(([x, y]) => [x - from, y - from] as [number, number]), hit: 0 }, hashString(c.a.id) + c.k * 17)
        : poseAt(who, f, tm, hashString(c.a.id) + c.k * 17);
      if (from) { pose.x = poseAt(c.a, f, tm, hashString(c.a.id)).x + (pose.x - who.x * 0.55); }
      if (speakerX !== null && who.action !== "talk") pose.look = Math.max(-1, Math.min(1, (speakerX - pose.x) * 0.8));
      // close-up: neighbours step aside so their heads do not pile onto the subject's
      if (cam.shot === "close" && c.a.id !== subjectId) {
        const sub = this.copies.find((x) => x.a.id === subjectId && x.k === 0);
        const sx = sub ? poseAt(sub.a, f, tm, hashString(sub.a.id)).x + sub.dx : pose.x;
        const gap = pose.x - sx;
        if (Math.abs(gap) < 0.9) pose.x = sx + (gap >= 0 ? 1 : -1) * 0.9;
      }
      pose.x += c.dx;
      pose.z += c.dz;
      pose.phase += c.k * 0.31;
      c.view.update(pose, camera, f + c.k * 7);
    }

    // composition for a vertical frame: in wider shots put the ground line low (feet ~80 % down the frame) so the
    // set fills the upper part instead of empty floor filling the lower half
    if (cam.shot === "wide" || cam.shot === "medium" || cam.shot === "low") {
      const d = camera.position.distanceTo(look), halfH = Math.tan(rad(camera.fov / 2)) * d;
      const want = 0.6 * halfH;
      if (look.y < want) {
        look.y = want;
        camera.position.y = Math.max(camera.position.y, want * 0.9);
        camera.lookAt(look);
        camera.rotateZ(rad(roll));
        camera.updateMatrixWorld();
      }
    }

    // framing: the 9:16 frame is narrow, so measure what is actually on stage (cards, 3D animals, herds) and back
    // the camera off until all of it fits with a margin. A close-up of a person crops on purpose.
    const humanClose = cam.shot === "close" && !this.subjectIsAnimal();
    if (cam.shot !== "aerial" && !humanClose && this.copies.length) {
      const halfW = Math.tan(rad(camera.fov / 2)) * (camera.aspect || 9 / 16), halfH = Math.tan(rad(camera.fov / 2));
      const back = camera.position.clone().sub(look).setY(0).normalize();
      const right = new THREE.Vector3(back.z, 0, -back.x);
      const camY = camera.position.y, box = new THREE.Box3(), v = new THREE.Vector3();
      let need = 0;
      for (const c of this.copies) {
        // a close-up frames its subject only; any wider shot keeps the whole cast in, the target just centres it
        if (cam.shot === "close" && cam.target && c.a.id !== cam.target) continue;
        box.setFromObject(c.view.root);
        for (let n = 0; n < 8; n++) {
          v.set(n & 1 ? box.max.x : box.min.x, n & 2 ? box.max.y : box.min.y, n & 4 ? box.max.z : box.min.z);
          const lat = Math.abs(v.clone().sub(look).dot(right)) + 0.25, fwd = v.clone().sub(look).dot(back);
          const vert = Math.abs(v.y - look.y) + 0.15;
          need = Math.max(need, lat / halfW + fwd, vert / halfH + fwd);
        }
      }
      if (need > dist) {
        const dy = camera.position.y - look.y;
        camera.position.copy(look).addScaledVector(back, Math.min(60, need)).setY(look.y + dy);
        camera.lookAt(look);
        camera.rotateZ(rad(roll));
        camera.updateMatrixWorld();
        void camY;
      }
    }

    // line of sight: hide props standing between the camera and what it looks at
    const seg = new THREE.Line3(camera.position.clone().setY(0), look.clone().setY(0)), q = new THREE.Vector3();
    for (const p of this.props) {
      const pos = p.obj.position;
      seg.closestPointToPoint(pos, true, q);
      const between = q.distanceTo(pos) < p.r + 0.6 && q.distanceTo(look.clone().setY(0)) > 1.2;
      p.obj.visible = !between || pos.distanceTo(camera.position) > 60;
    }

    for (const sy of this.symbols) {
      const d = f - sy.beat.frame;
      // a newer symbol on the same actor replaces this one
      const replaced = this.symbols.some((o) => o !== sy && o.beat.actor === sy.beat.actor && o.beat.frame > sy.beat.frame && o.beat.frame <= f);
      const on = d >= 0 && d < 42 && !replaced;
      sy.card.set(on ? (d % 30) / 30 : null);
      if (!on) continue;
      const c = this.copies.find((x) => x.a.id === sy.beat.actor && x.k === 0);
      const at = c ? c.view.root.position : new THREE.Vector3();
      const pop = d < 5 ? 0.3 + 0.9 * (d / 5) : d < 9 ? 1.2 - 0.2 * ((d - 5) / 4) : d > 34 ? 1 - (d - 34) / 8 : 1;
      sy.card.mesh.scale.setScalar(Math.max(0.01, pop));
      // beside the head on the side away from the frame edge, so close-ups never crop it
      const side = at.x > look.x ? -1 : 1;
      const dcam = camera.position.distanceTo(at), tanH = Math.tan(rad(camera.fov / 2));
      const halfW = tanH * (camera.aspect || 9 / 16) * dcam, halfH = tanH * dcam;
      // never on the face: beside the head if the frame has room, otherwise just above it
      const k = Math.min(1, halfW / 0.8), size = 0.75 * k, headHalf = Math.max(0.27, sy.h * 0.16);
      sy.card.mesh.scale.multiplyScalar(k);
      const besideX = at.x + side * (headHalf + size / 2 + 0.04);
      const fits = Math.abs(besideX - look.x) + size / 2 < halfW * 0.95;
      const x = fits ? besideX : at.x + side * 0.12;
      const y = fits ? sy.h * 0.92 : Math.min(sy.h + size / 2 + 0.02, look.y + halfH * 0.95 - size / 2);
      sy.card.mesh.position.set(x, y + 0.04 * Math.sin(d / 4), at.z + 0.05);
      sy.card.mesh.rotation.y = Math.atan2(camera.position.x - at.x, camera.position.z - at.z);
    }

    this.updateEffects(f, camera, look);
  }

  private updateEffects(f: number, camera: THREE.PerspectiveCamera, look: THREE.Vector3) {
    const hit = this.times.hit ?? 0, k = f - hit, e = this.scene.effect;
    const at = new THREE.Vector3(look.x, 0, look.z - 2.5);
    const face = (m: THREE.Object3D) => { m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z); };
    this.fx.forEach((c, i) => {
      if (e === "explosion" && i === 0) {
        c.mesh.position.set(at.x, 2.4, at.z);
        c.set(k / 14);
      } else if (e === "splash") {
        c.mesh.position.set(at.x, 3.2, at.z);
        c.set(k / 26);
      } else {
        const j = e === "explosion" ? i - 1 : i, r = rng(this.seed + 31 * j);
        const start = e === "explosion" ? 4 + j * 3 : ((j * 17) % 50), period = 50;
        const t = e === "explosion" ? (k - start) / 40 : (((f + start) % period) / period);
        c.mesh.position.set(at.x + (r() - 0.5) * 3, 0.8 + 2.4 * Math.max(0, t), at.z + (r() - 0.5));
        c.set(e === "explosion" ? t : t);
      }
      face(c.mesh);
    });
    if (this.confetti) {
      this.confetti.visible = k >= 0;
      if (k < 0) return;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < this.confetti.count; i++) {
        const r = rng(this.seed + i * 13);
        const x0 = (r() - 0.5) * 6, z0 = (r() - 0.5) * 3, vy = 1.2 + r() * 1.2, ph = r() * 6, t = k / 30;
        const p = new THREE.Vector3(look.x + x0 + 0.3 * Math.sin(t * 3 + ph), 4.8 - vy * t + 2.2 * (r() - 0.2) * Math.max(0, 0.4 - t), look.z + z0);
        q.setFromEuler(new THREE.Euler(t * 7 + ph, t * 5 + ph, t * 3));
        m4.compose(p, q, s);
        this.confetti.setMatrixAt(i, m4);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }
}
