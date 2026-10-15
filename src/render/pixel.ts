// Low-res target -> integer nearest upscale with per-channel posterize + 4x4 Bayer dither (art-direction §2).
// Two uses of the same target per frame: the opaque world (terrain, ground decals) under the native-res unit sprites,
// then, re-cleared to transparent but keeping the world's depth, the OVERLAY_LAYER objects (airborne FX, HP bars) over them.
import * as THREE from 'three';

/** Camera layer of objects drawn after the unit sprites (see blitOverlay). */
export const OVERLAY_LAYER = 1;

const TARGET_H = 384; // internal height lands in ~320-480
const LEVELS = 8; // 0 disables posterize

export interface PixelPass {
  readonly target: THREE.WebGLRenderTarget;
  /** Fraction of the target's UV range actually shown on the canvas (crops the <1 texel overshoot). */
  readonly uvScale: THREE.Vector2;
  /** Resize to the canvas drawing buffer; returns the low-res target size. */
  resize(physW: number, physH: number): { w: number; h: number };
  blit(gl: THREE.WebGLRenderer): void;
  /** Composite the target (premultiplied, transparent where empty) over the canvas. */
  blitOverlay(gl: THREE.WebGLRenderer): void;
  dispose(): void;
}

export function createPixelPass(): PixelPass {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  const uvScale = new THREE.Vector2(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture },
      uvScale: { value: uvScale },
      levels: { value: LEVELS },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform vec2 uvScale; uniform float levels;
      varying vec2 vUv;
      const mat4 BAYER = mat4(0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.) / 16.;
      void main() {
        vec2 uv = vUv * uvScale;
        vec4 c = texture2D(tScene, uv);
        #ifdef OVERLAY
        // premultiplied (normal + additive blends into transparent black); additive glow can exceed its alpha
        float a = max(c.a, max(c.r, max(c.g, c.b)));
        if (a < 0.004) discard;
        c = vec4(c.rgb / a, a);
        #endif
        c = linearToOutputTexel(c);
        if (levels > 0.0) {
          ivec2 p = ivec2(uv * vec2(textureSize(tScene, 0))) % 4; // dither on the low-res texel grid
          float d = BAYER[p.x][p.y] - 0.5;
          c.rgb = floor(c.rgb * (levels - 1.0) + 0.5 + d * 0.6) / (levels - 1.0);
        }
        #ifdef OVERLAY
        gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0) * c.a, c.a);
        #else
        gl_FragColor = vec4(c.rgb, 1.0);
        #endif
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const overlay = material.clone();
  overlay.uniforms = material.uniforms; // same target, uvScale, levels
  overlay.defines = { OVERLAY: '' };
  Object.assign(overlay, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    target,
    uvScale,
    resize(physW, physH) {
      const scale = Math.max(1, Math.round(physH / TARGET_H));
      const w = Math.ceil(physW / scale);
      const h = Math.ceil(physH / scale);
      target.setSize(w, h);
      uvScale.set(physW / (w * scale), physH / (h * scale));
      return { w, h };
    },
    blit(gl) {
      quad.material = material;
      gl.setRenderTarget(null);
      gl.render(scene, cam);
    },
    blitOverlay(gl) {
      quad.material = overlay;
      gl.setRenderTarget(null);
      gl.render(scene, cam);
    },
    dispose() {
      target.dispose();
      material.dispose();
      overlay.dispose();
      quad.geometry.dispose();
    },
  };
}
