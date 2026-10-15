// World space: 1 unit = 1 tile, +Y up, sim (x, y) maps to world (x, 0, y). Origin = footprint centre on the ground.
//
// createTowerModel(defId, level): THREE.Group. Child 'turret' (Group) is the yaw pivot (yaw 0 faces +X). Fits a 0.9×0.9
//   footprint. Hull meshes use a shared MeshLambertMaterial (vertexColors, flatShading); glow meshes a shared MeshBasicMaterial.
//   Geometries and materials are shared/cached across instances: never dispose them per tower.
// createEnemyGeometry(defId): merged, vertex-coloured, cached geometry for an InstancedMesh with
//   MeshLambertMaterial({ vertexColors: true, flatShading: true }). Faces +X, origin at feet. Glow parts are baked as
//   over-bright vertex colours (>1). Shared: never dispose per enemy.
export { createTowerModel } from './towers';
export { createEnemyGeometry } from './enemies';
