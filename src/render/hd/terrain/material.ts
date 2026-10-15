// One PBR terrain material (MeshStandardMaterial + onBeforeCompile) for the heightfield, its skirt and the rock props:
// per fragment it blends ground / path / plateau-top / rock layers in world space, so it also works on instanced props.
//   ground vs path: map mask R (CPU, ./build.ts) sharpened by the layers' heights (ORM red) -> crisp, hand-painted edges
//   rock: slope-driven on the heightfield (props: everywhere), triplanar (v = world height, so strata stay horizontal);
//         `look.propGround` swaps the props to a triplanar ground crust (volcanic: basalt columns read as barrels)
//   plateau tops (y > 0.2): ground texture tinted toward the palette cliff colour × look.top, plus a sunlit rim
//   macro tint toward groundAlt: mask G; baked AO: mask B (indirect light + a little cavity); glow region: mask A
// Lit by the scene's sun + hemisphere light like the sprite bake, with the shared room env at low intensity.
import * as THREE from 'three';
import type { MapPalette } from '../../../data/types';
import type { TerrainSets } from './textures';

const TEX_SCALE = 0.5; // texture repeats per world unit (one texture over 2 tiles)

/** Per-biome tuning: plateau-top darkness vs the cliff colour, rim highlight strength, props in ground crust. */
export interface TerrainLook { glowG: string; glowR: string; top: number; rim: number; propGround: boolean }

export function terrainMaterial(sets: TerrainSets, mask: THREE.Texture, size: { cols: number; rows: number }, p: MapPalette, look: TerrainLook, envMap: THREE.Texture | null): THREE.MeshStandardMaterial {
  const lin = (hex: string): THREE.Color => new THREE.Color(hex);
  const ratio = (a: string, b: string): THREE.Vector3 => {
    const ca = lin(a), cb = lin(b);
    return new THREE.Vector3(ca.r / Math.max(cb.r, 1e-3), ca.g / Math.max(cb.g, 1e-3), ca.b / Math.max(cb.b, 1e-3));
  };
  const uniforms = {
    tMask: { value: mask },
    tGA: { value: sets.ground.map }, tGN: { value: sets.ground.normal }, tGO: { value: sets.ground.orm },
    tPA: { value: sets.path.map }, tPN: { value: sets.path.normal }, tPO: { value: sets.path.orm },
    tRA: { value: sets.rock.map }, tRN: { value: sets.rock.normal }, tRO: { value: sets.rock.orm },
    uMapSize: { value: new THREE.Vector2(size.cols, size.rows) },
    uAlt: { value: ratio(p.groundAlt, p.ground) },
    uTop: { value: ratio(p.cliff, p.ground).multiplyScalar(look.top) },
    uRim: { value: look.rim },
    uPropGround: { value: look.propGround ? 1 : 0 },
    uGlowG: { value: lin(look.glowG).multiplyScalar(2.2) },
    uGlowR: { value: lin(look.glowR).multiplyScalar(1.8) },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMap, envMapIntensity: 0.35 });
  mat.userData.tex = Object.values(uniforms).flatMap((u) => (u.value instanceof THREE.Texture ? [u.value] : [])); // for gpuBytes
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN; varying float vLift;')
      .replace('#include <worldpos_vertex>', /* glsl */ `#include <worldpos_vertex>
        vec4 tw = vec4(transformed, 1.0);
        vec3 tn = objectNormal;
        vLift = -1.0; // heightfield: full ground AO
        #ifdef USE_INSTANCING
          tw = instanceMatrix * tw;
          tn = mat3(instanceMatrix) * tn;
          vLift = tw.y - instanceMatrix[3].y; // height above the prop's base: props escape the ground AO
        #endif
        tw = modelMatrix * tw;
        vW = tw.xyz;
        vWN = normalize(mat3(modelMatrix) * tn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vW; varying vec3 vWN; varying float vLift;
        uniform sampler2D tMask, tGA, tGN, tGO, tPA, tPN, tPO, tRA, tRN, tRO;
        uniform vec2 uMapSize; uniform vec3 uAlt, uTop, uGlowG, uGlowR; uniform float uRim, uPropGround;
        vec2 nrmXY(sampler2D t, vec2 uv) { return texture2D(t, uv).xy * 2.0 - 1.0; }`)
      .replace('#include <map_fragment>', /* glsl */ `
        vec3 wn = normalize(vWN);
        vec4 mk = texture2D(tMask, vW.xz / uMapSize);
        vec2 uvT = vW.xz * ${TEX_SCALE.toFixed(3)};
        vec4 gO = texture2D(tGO, uvT), pO = texture2D(tPO, uvT * 1.0 + 0.37);
        // height-blended path weight: the mask sets where, the textures decide the exact (crisp, irregular) edge
        float tp = mk.r;
        float wP = smoothstep(0.42, 0.58, tp + (pO.r - gO.r) * 0.45 * (1.0 - abs(tp * 2.0 - 1.0)));
        float top = smoothstep(0.18, 0.3, vW.y);
        float steep = smoothstep(0.42, 0.62, 1.0 - wn.y);
        // rock: triplanar (v = world height on the walls, so strata stay horizontal); props are rock all over
        vec2 ux = vec2(vW.z, vW.y) * ${TEX_SCALE.toFixed(3)}, uz = vec2(vW.x, vW.y) * ${TEX_SCALE.toFixed(3)}, uy = vW.xz * ${TEX_SCALE.toFixed(3)} + 0.61;
        vec3 bw = pow(abs(wn) + 1e-3, vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec3 rA = texture2D(tRA, ux).rgb * bw.x + texture2D(tRA, uy).rgb * bw.y + texture2D(tRA, uz).rgb * bw.z;
        vec4 rO = texture2D(tRO, ux) * bw.x + texture2D(tRO, uy) * bw.y + texture2D(tRO, uz) * bw.z;
        vec2 rnx = nrmXY(tRN, ux), rny = nrmXY(tRN, uy), rnz = nrmXY(tRN, uz);
        if (vLift >= 0.0 && uPropGround > 0.5) { // props in ground crust, darkened like the plateau tops
          rA = (texture2D(tGA, ux).rgb * bw.x + texture2D(tGA, uy).rgb * bw.y + texture2D(tGA, uz).rgb * bw.z) * uTop;
          rO = texture2D(tGO, ux) * bw.x + texture2D(tGO, uy) * bw.y + texture2D(tGO, uz) * bw.z;
          rnx = nrmXY(tGN, ux); rny = nrmXY(tGN, uy); rnz = nrmXY(tGN, uz);
        }
        vec3 rOff = bw.x * vec3(0.0, rnx.y, rnx.x) + bw.y * vec3(rny.x, 0.0, rny.y) + bw.z * vec3(rnz.x, rnz.y, 0.0);
        float wR = vLift < 0.0 ? steep : 1.0;
        vec3 gA = texture2D(tGA, uvT).rgb * mix(vec3(1.0), uAlt, mk.g * (1.0 - top));
        gA *= mix(vec3(1.0), uTop, top);
        vec3 alb = mix(mix(gA, texture2D(tPA, uvT + 0.37).rgb, wP * (1.0 - top)), rA, wR);
        float flatH = mix(gO.r, pO.r, wP);
        // sunlit rim where a plateau top breaks into the cliff: blocked high ground gets a crisp silhouette
        float rim = vLift < 0.0 ? top * smoothstep(0.06, 0.3, 1.0 - wn.y) * (1.0 - steep) : 0.0;
        alb *= 1.0 + uRim * rim;
        // curb grime: the path's edge band darkens
        alb *= 1.0 - 0.28 * (1.0 - abs(tp * 2.0 - 1.0)) * (1.0 - wR);
        float tAO = vLift < 0.0 ? mk.b : mix(mk.b, 1.0, smoothstep(0.0, 0.25, vLift));
        float cav = mix(0.85, 1.0, mix(flatH, rO.r, wR));
        alb *= mix(0.7, 1.0, tAO) * cav;
        diffuseColor.rgb *= alb;`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        float roughnessFactor = mix(mix(gO.g, pO.g, wP), rO.g, wR);`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
      .replace('#include <normal_fragment_maps>', /* glsl */ `
        vec2 fn = mix(nrmXY(tGN, uvT), nrmXY(tPN, uvT + 0.37), wP);
        // top projection: u = +x, v = +z; walls: tangent offsets in the wall plane
        vec3 pw = normalize(wn + (1.0 - wR) * vec3(fn.x, 0.0, fn.y) + wR * rOff);
        normal = normalize((viewMatrix * vec4(pw, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `
        totalEmissiveRadiance += uGlowG * gO.b * (1.0 - max(wP, wR)) * mk.a + uGlowR * rO.b * wR * (vLift < 0.0 ? 1.0 : 0.12);`)
      .replace('#include <aomap_fragment>', /* glsl */ `
        reflectedLight.indirectDiffuse *= tAO;
        reflectedLight.indirectSpecular *= tAO * tAO;`);
  };
  return mat;
}
