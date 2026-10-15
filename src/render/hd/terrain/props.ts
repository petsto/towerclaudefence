// HD map props. Hard-surface pieces (build pad, colony core, spawn portal, wrecks) are built with the unit kit so they
// share the sprites' PBR materials; rocks are displaced icosahedra drawn with the terrain material (./material.ts).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, cyl, finalize, kit, PI, rbox, torus, type Built } from '../kit';
import { hash } from '../textures';

const hex = (s: string): number => parseInt(s.slice(1), 16);

/** Build pad deck: plate top at y = padY. Frame lights are separate (instance-coloured, see ./build.ts). */
export function padModel(padColor: string, padY: number): Built {
  const k = kit();
  const c = hex(padColor);
  const t = padY + 0.04; // plate sinks 0.04 into the ground
  k.add(rbox(0.88, t, 0.88, 0.02, 2), 'metal', c, { p: [0, t / 2 - 0.04, 0] });
  k.add(rbox(0.7, 0.012, 0.7, 0.006), 'paint', c, { p: [0, padY - 0.002, 0] }); // inset deck
  for (let i = -2; i <= 2; i++) k.add(rbox(0.6, 0.004, 0.012, 0.002), 'metal', C.gunD, { p: [0, padY + 0.005, i * 0.12] }); // tread ribs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(rbox(0.12, 0.006, 0.12, 0.003), 'hazard', 0xffffff, { p: [sx * 0.37, padY + 0.001, sz * 0.37] });
    k.add(cyl(0.016, 0.016, 0.012, 6), 'metal', C.steel, { p: [sx * 0.3, padY + 0.004, sz * 0.3] });
  }
  return finalize(k, 0);
}

/** Corner-bracket frame light geometry (one pad), drawn unlit with an instance colour. */
export function padFrameGeo(padY: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const F = 0.43, L = 0.2, T = 0.03;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(L, 0.016, T).translate(sx * (F - L / 2), padY + 0.004, sz * (F - T / 2)).toNonIndexed());
    parts.push(new THREE.BoxGeometry(T, 0.016, L).translate(sx * (F - T / 2), padY + 0.004, sz * (F - L / 2)).toNonIndexed());
  }
  // thin continuous edge line between the brackets: the whole pad outline stays legible at zoom 24
  for (const s of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(2 * F, 0.01, 0.012).translate(0, padY + 0.002, s * (F - 0.006)).toNonIndexed());
    parts.push(new THREE.BoxGeometry(0.012, 0.01, 2 * F).translate(s * (F - 0.006), padY + 0.002, 0).toNonIndexed());
  }
  const pos = parts.flatMap((g) => [...(g.attributes.position!.array as Float32Array)]);
  parts.forEach((g) => g.dispose());
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
}

/** Colony core (team structure). Its glow parts are returned separately so they can flicker live. */
export function coreModel(glow: string): { body: Built; glow: Built } {
  const k = kit();
  const g = hex(glow);
  const R8 = [0, PI / 8, 0] as const;
  k.add(cyl(0.74, 0.8, 0.1, 8), 'metal', C.gunD, { p: [0, 0.05, 0], r: R8 });
  k.add(cyl(0.66, 0.7, 0.04, 8), 'hazard', 0xffffff, { p: [0, 0.12, 0], r: R8 });
  k.add(cyl(0.5, 0.58, 0.3, 8), 'paint', C.team, { p: [0, 0.29, 0], r: R8 });
  k.add(rbox(0.82, 0.18, 0.58, 0.03, 2), 'metal', C.gun, { p: [0, 0.53, 0.02] });
  k.add(cyl(0.2, 0.3, 0.2, 16), 'metal', C.steel, { p: [-0.05, 0.72, 0] });
  for (const s of [-1, 1]) {
    k.add(rbox(0.26, 0.26, 0.36, 0.025, 2), 'metal', C.gunD, { p: [s * 0.58, 0.2, 0.08] });
    k.add(rbox(0.28, 0.04, 0.38, 0.01), 'paint', C.team, { p: [s * 0.58, 0.35, 0.08] });
    for (let i = 0; i < 4; i++) k.add(rbox(0.012, 0.16, 0.3, 0.004), 'metal', C.steel, { p: [s * 0.715, 0.2, 0.08 + (i - 1.5) * 0.002], r: [0, 0, s * 0.1] });
  }
  k.rod([0.26, 0.6, -0.18], [0.26, 1.2, -0.18], 0.025, 'metal', C.gunD);
  k.add(cyl(0, 0.16, 0.06, 16), 'metal', C.steel, { p: [0.26, 1.18, -0.18], r: [0.5, 0, 0] });
  k.add(rbox(0.1, 0.18, 0.1, 0.02), 'metal', C.gunD, { p: [0, 0.7, 0.3] });
  for (let i = 0; i < 3; i++) k.rod([-0.6 + i * 0.05, 0.05, 0.62], [-0.3 + i * 0.05, 0.42, 0.25], 0.012, 'metal', C.rubber);
  const body = finalize(k, 0);
  const kg = kit();
  kg.glow(rbox(0.84, 0.03, 0.6, 0.01), g, { p: [0, 0.445, 0.02] }, 3);
  kg.glow(cyl(0.09, 0.09, 0.05, 12), g, { p: [-0.05, 0.84, 0] }, 4);
  kg.glow(rbox(0.06, 0.06, 0.06, 0.01), C.amber, { p: [0.26, 1.23, -0.18] }, 6);
  for (const s of [-1, 1]) kg.glow(rbox(0.2, 0.03, 0.02, 0.005), g, { p: [s * 0.58, 0.24, 0.27] }, 3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8;
    kg.glow(rbox(0.06, 0.025, 0.06, 0.008), g, { p: [Math.cos(a) * 0.7, 0.115, Math.sin(a) * 0.7] }, 3);
  }
  return { body, glow: finalize(kg, 0) };
}

/** Hostile spawn portal: chitin claws around a dark maw. The spinning ring is separate (live). */
export function portalModel(): { body: Built; ring: Built } {
  const k = kit();
  k.add(cyl(0.42, 0.46, 0.05, 32), 'chitin', C.chDark, { p: [0, 0.0, 0] });
  k.add(cyl(0.3, 0.3, 0.02, 32), 'glow', 0x1a0410, { p: [0, 0.03, 0] });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.3;
    const h = 0.34 + (i % 2) * 0.18;
    const ca = Math.cos(a), sa = Math.sin(a);
    k.add(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(ca * 0.4, 0.0, sa * 0.4), new THREE.Vector3(ca * 0.5, h * 0.55, sa * 0.5), new THREE.Vector3(ca * 0.42, h, sa * 0.42),
      ]), 8, 0.045, 6),
      'chitin', i % 2 ? C.chBone : C.chBody,
    );
    k.add(new THREE.ConeGeometry(0.045, 0.14, 6), 'chitin', C.chBone, { p: [ca * 0.4, h + 0.05, sa * 0.4], r: [sa * 0.5, 0, -ca * 0.5] });
    k.glow(rbox(0.03, 0.12, 0.03, 0.01), C.chGlow, { p: [ca * 0.47, h * 0.4, sa * 0.47] }, 3);
  }
  const body = finalize(k, 0);
  const kr = kit();
  kr.glow(torus(0.32, 0.025, 32), 0xff2a4a, { p: [0, 0.04, 0], r: [PI / 2, 0, 0] }, 2.5);
  for (let i = 0; i < 6; i++) kr.glow(rbox(0.06, 0.02, 0.02, 0.005), 0xff6a80, { p: [Math.cos((i * PI) / 3) * 0.32, 0.05, Math.sin((i * PI) / 3) * 0.32], r: [0, -(i * PI) / 3, 0] }, 4);
  return { body, ring: finalize(kr, 0) };
}

/** Two wreck variants: a crashed supply crate, a snapped girder with a pipe. */
export function wreckModels(): Built[] {
  const a = kit();
  a.add(rbox(0.36, 0.2, 0.26, 0.02, 2), 'paint', 0x6a7a52, { p: [0, 0.08, 0], r: [0.08, 0.2, 0.12] });
  a.add(rbox(0.37, 0.04, 0.27, 0.01), 'metal', C.gunD, { p: [0, 0.17, 0.01], r: [0.08, 0.2, 0.12] });
  a.add(rbox(0.2, 0.012, 0.03, 0.004), 'hazard', 0xffffff, { p: [0.02, 0.09, 0.14], r: [0.08, 0.2, 0.12] });
  a.add(rbox(0.16, 0.1, 0.14, 0.015), 'metal', C.rmGun, { p: [0.25, 0.04, -0.12], r: [0.3, 0.9, -0.2] });
  a.glow(rbox(0.02, 0.02, 0.01, 0.004), C.redGlow, { p: [-0.1, 0.13, 0.14] }, 3);
  const b = kit();
  b.add(rbox(0.5, 0.05, 0.08, 0.01), 'metal', C.rust, { p: [0, 0.05, 0], r: [0, 0.4, 0.15] });
  b.add(rbox(0.3, 0.05, 0.08, 0.01), 'metal', C.rust, { p: [0.18, 0.1, 0.12], r: [0.2, -0.6, 0.5] });
  for (let i = 0; i < 4; i++) b.add(rbox(0.012, 0.09, 0.012, 0.003), 'metal', C.rmSteel, { p: [-0.18 + i * 0.12, 0.08, -0.05 + i * 0.045], r: [0, 0.4, 0.4] });
  b.rod([-0.3, 0.03, 0.1], [0.05, 0.06, 0.22], 0.03, 'metal', C.rmGun);
  b.add(torus(0.03, 0.008, 12), 'metal', C.gunD, { p: [0.05, 0.06, 0.22], r: [0, 1.2, 0] });
  return [finalize(a, 0), finalize(b, 0)];
}

/** Boulder: displaced, flattened icosahedron, base at y = 0. World-space shading comes from the terrain material. */
export function rockGeo(seed: number, detail = 3): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(0.2, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = g.attributes.position!;
  const v = new THREE.Vector3();
  // a few random cutting planes give chunky facets; low-frequency lumps on top
  const planes = Array.from({ length: 6 }, (_, i) => {
    const n = new THREE.Vector3(hash(i, 1, seed) - 0.5, (hash(i, 2, seed) - 0.3) * 0.8, hash(i, 3, seed) - 0.5).normalize();
    return { n, d: 0.13 + hash(i, 4, seed) * 0.05 };
  });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lump = 1 + 0.12 * Math.sin(v.x * 23 + seed) * Math.sin(v.z * 19 + seed * 2) + 0.06 * Math.sin(v.y * 41 + v.x * 17);
    v.multiplyScalar(lump);
    for (const p of planes) {
      const d = v.dot(p.n);
      if (d > p.d) v.addScaledVector(p.n, p.d - d);
    }
    v.y = Math.max(v.y * 0.75, -0.03) + 0.03;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Crystal spire: hexagonal prism with a pointed cap, base at y = 0, height 1 (scale per instance). */
export function crystalGeo(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.07, 0.09, 0.75, 6).translate(0, 0.375, 0).toNonIndexed();
  const cap = new THREE.ConeGeometry(0.07, 0.25, 6).translate(0, 0.875, 0).toNonIndexed();
  const pos = [...(body.attributes.position!.array as Float32Array), ...(cap.attributes.position!.array as Float32Array)];
  body.dispose();
  cap.dispose();
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: faceted
  return g;
}
