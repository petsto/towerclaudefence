// Shared HD unit materials, one per MatId. Each lit PBR material gets the PMREM room environment itself: setting
// scene.environment instead would also light the terrain's MeshLambertMaterial and wash it out.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { MatId } from './kit';
import { chitin, hardSurface, type TexSet } from './textures';

const ENV_I = 1.2;

export function makeMaterials(gl: THREE.WebGLRenderer): Record<MatId, THREE.Material> {
  const pmrem = new THREE.PMREMGenerator(gl);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const std = (t: TexSet, metalness = 1): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, normalMap: t.normal, roughness: 1, metalness,
      vertexColors: true, envMap, envMapIntensity: ENV_I,
    });
  const ch = chitin(7);
  return {
    metal: std(hardSurface('metal', 3), 0.5),
    paint: std(hardSurface('paint', 5)),
    hazard: std(hardSurface('hazard', 9)),
    chitin: new THREE.MeshPhysicalMaterial({
      map: ch.map, normalMap: ch.normal, roughnessMap: ch.orm, roughness: 1, metalness: 0,
      clearcoat: 0.7, clearcoatRoughness: 0.15, vertexColors: true, envMap, envMapIntensity: 0.6 * ENV_I,
    }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}
