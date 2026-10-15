// ponytail: placeholder contract — the models agent replaces the bodies, keeping these signatures.
// World space: 1 unit = 1 tile, +Y up, sim (x, y) maps to world (x, 0, y). Origin = footprint centre on the ground.
import * as THREE from 'three';
import type { EnemyId, TowerId } from '../../data/types';

/** Tower model. Must contain a child named 'turret' that the renderer rotates around Y (yaw 0 faces +X). Fits a 0.9×0.9 footprint. */
export function createTowerModel(_defId: TowerId, _level: 1 | 2 | 3): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), new THREE.MeshLambertMaterial({ color: 0x4a6f9a }));
  base.position.y = 0.15;
  const turret = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xffb030 }));
  turret.name = 'turret';
  turret.position.y = 0.4;
  g.add(base, turret);
  return g;
}

/** Merged, vertex-coloured enemy geometry for an InstancedMesh with MeshLambertMaterial({ vertexColors: true }). Faces +X, origin at feet. */
export function createEnemyGeometry(_defId: EnemyId): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 0.2, 0);
  const colors = new Float32Array(geo.attributes.position!.count * 3).fill(0.6);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
