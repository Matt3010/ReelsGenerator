// Props: a CC0 catalog model by key, or a custom object built from primitive parts (for things no kit has).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Part, Prop } from "../types";
import { modelFor, toon } from "./models";
import { rng } from "./look";

const DEG = Math.PI / 180;

/** one primitive; boxes get softly rounded edges so big custom objects read as toys, not blocks */
const partGeometry = (shape: Part["shape"], [w, h, d]: Part["size"]): THREE.BufferGeometry => {
  switch (shape) {
    case "box": {
      const r = Math.min(0.3, Math.min(w, h, d) * 0.18);
      return r > 0.02 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
    }
    case "cylinder": return new THREE.CylinderGeometry(w / 2, w / 2, h, 28);
    case "cone": return new THREE.ConeGeometry(w / 2, h, 28);
    case "capsule": {
      const r = Math.min(w, h) / 2;
      return new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 8, 24).scale(1, 1, d / w);
    }
    case "torus": {
      const tube = Math.min(d, w / 2) / 2;
      // a ring lying flat (like a hoop on the floor); rot_x 90 stands it up like a wheel
      return new THREE.TorusGeometry((w - 2 * tube) / 2, tube, 14, 36).rotateX(Math.PI / 2).scale(1, 1, h / w);
    }
    default: return new THREE.SphereGeometry(0.5, 28, 16).scale(w, h, d);
  }
};

const customProp = (p: Prop) => {
  const g = new THREE.Group();
  for (const part of p.parts ?? []) {
    // glowing parts are unlit and bright (bloom-free warm light); the world adds real lights for them at night
    const m = new THREE.Mesh(partGeometry(part.shape, part.size), part.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(part.color).multiplyScalar(1.3) }) : toon(part.color));
    if (part.glow) m.userData.glow = part.color;
    m.position.set(...part.pos);
    m.rotation.set((part.rot_x ?? 0) * DEG, (part.rot_y ?? 0) * DEG, (part.rot_z ?? 0) * DEG, "YXZ");
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
