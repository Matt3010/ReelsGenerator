// Props: a CC0 catalog model by key, or a custom object built from primitive parts (for things no kit has).
import * as THREE from "three";
import type { Prop } from "../types";
import { modelFor, toon } from "./models";
import { rng } from "./look";

const customProp = (p: Prop) => {
  const g = new THREE.Group();
  for (const part of p.parts ?? []) {
    const [w, h, d] = part.size;
    const geo =
      part.shape === "box" ? new THREE.BoxGeometry(w, h, d)
      : part.shape === "cylinder" ? new THREE.CylinderGeometry(w / 2, w / 2, h, 20)
      : part.shape === "cone" ? new THREE.ConeGeometry(w / 2, h, 20)
      : new THREE.SphereGeometry(0.5, 20, 12);
    // glowing parts are unlit and bright (bloom-free warm light); the world adds real lights for them at night
    const m = new THREE.Mesh(geo, part.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(part.color).multiplyScalar(1.3) }) : toon(part.color));
    if (part.glow) m.userData.glow = part.color;
    if (part.shape === "sphere") m.scale.set(w, h, d);
    m.position.set(...part.pos);
    m.rotation.y = ((part.rot_y ?? 0) * Math.PI) / 180;
    g.add(m);
  }
  return g;
};

export const buildProp = (p: Prop, seed: number): THREE.Group => {
  const r = rng(seed);
  const g = new THREE.Group();
  const inner = p.model ? modelFor(p.model) : customProp(p);
  if (inner) g.add(inner);
  g.scale.setScalar(p.scale);
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rot_y ? (p.rot_y * Math.PI) / 180 : p.model ? (r() - 0.5) * 0.6 : 0;
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
};

/** rough ground radius of a built prop, for the line-of-sight culler */
export const propRadius = (obj: THREE.Object3D) => {
  const s = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  return Math.max(0.5, Math.max(s.x, s.z) / 2);
};
