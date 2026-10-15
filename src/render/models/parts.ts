// Primitive helpers: each returns an indexed, transformed, vertex-coloured geometry ready to merge.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type G = THREE.BufferGeometry;
export type V3 = readonly [number, number, number];
/** p = position, r = Euler XYZ rotation, s = scale, g = colour gain (>1 fakes emissive under Lambert). */
export interface Xf { p?: V3; r?: V3; s?: V3 | number; g?: number }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function finish(src: G, color: number, m: THREE.Matrix4, gain = 1): G {
  src.deleteAttribute('uv');
  src.deleteAttribute('normal');
  const geo = src.index ? src : mergeVertices(src);
  geo.applyMatrix4(m);
  _c.setHex(color); // sRGB hex -> linear working space, matching how three reads vertex colours
  const n = geo.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([_c.r * gain, _c.g * gain, _c.b * gain], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function xfm(xf: Xf): THREE.Matrix4 {
  const s = xf.s ?? 1;
  if (typeof s === 'number') _s.setScalar(s);
  else _s.set(...s);
  _p.set(...(xf.p ?? [0, 0, 0]));
  _q.setFromEuler(_e.set(...(xf.r ?? [0, 0, 0])));
  return _m.compose(_p, _q, _s);
}

export const box = (w: number, h: number, d: number, c: number, xf: Xf = {}) =>
  finish(new THREE.BoxGeometry(w, h, d), c, xfm(xf), xf.g);
export const cyl = (rTop: number, rBot: number, h: number, seg: number, c: number, xf: Xf = {}) =>
  finish(new THREE.CylinderGeometry(rTop, rBot, h, seg), c, xfm(xf), xf.g);
export const sphere = (r: number, c: number, xf: Xf = {}, ws = 8, hs = 6) =>
  finish(new THREE.SphereGeometry(r, ws, hs), c, xfm(xf), xf.g);
export const ico = (r: number, c: number, xf: Xf = {}) => finish(new THREE.IcosahedronGeometry(r, 0), c, xfm(xf), xf.g);
export const octa = (r: number, c: number, xf: Xf = {}) => finish(new THREE.OctahedronGeometry(r, 0), c, xfm(xf), xf.g);
export const torus = (R: number, r: number, c: number, xf: Xf = {}, seg = 8) =>
  finish(new THREE.TorusGeometry(R, r, 3, seg), c, xfm(xf), xf.g);
export const capsule = (r: number, len: number, c: number, xf: Xf = {}) =>
  finish(new THREE.CapsuleGeometry(r, len, 2, 6), c, xfm(xf), xf.g);

/** Cylinder from a to b (rB at b; defaults to r). rB = 0 makes a spike pointing at b. */
export function rod(a: V3, b: V3, r: number, c: number, seg = 4, rB = r, g = 1): G {
  const va = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(va);
  const len = d.length();
  _q.setFromUnitVectors(UP, d.clone().normalize());
  _m.compose(va.addScaledVector(d, 0.5), _q, _s.setScalar(1));
  return finish(new THREE.CylinderGeometry(rB, r, len, seg, 1, true), c, _m, g); // open-ended: rod ends sit inside bodies or the ground
}

/** Merge parts into one geometry (smooth normals only matter for shadow normalBias; materials are flat-shaded). */
export function merge(parts: G[]): G {
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('mergeGeometries failed: mismatched attributes');
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
