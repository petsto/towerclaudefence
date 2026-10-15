// Tremor Mine (GDD §14): a small gunmetal disc (~0.3 tile) with three prongs and a steel-blue rim, seated in the path
// recess. Baked once into the sprite atlas (static, base frame only); the amber LED blink is live FX (see fx.ts).
import { C, cyl, finalize, kit, PI, rbox, sph, torus, type Built } from './kit';

/** LED lens position (model space), for the live blink in fx.ts. */
export const MINE_LED = { x: 0, y: 0.072, z: 0.095 } as const;

export function mine(): Built {
  const k = kit();
  k.add(cyl(0.15, 0.155, 0.03, 32), 'metal', C.gunD, { p: [0, 0.015, 0] });
  k.add(torus(0.145, 0.014, 32), 'paint', C.team, { p: [0, 0.032, 0], r: [PI / 2, 0, 0] });
  k.add(cyl(0.11, 0.13, 0.03, 32), 'metal', C.gun, { p: [0, 0.045, 0] });
  k.add(sph(0.085, 24, 8).scale(1, 0.35, 1), 'metal', C.steel, { p: [0, 0.06, 0] });
  // three prongs: short tapered spikes leaning out, footed on the rim
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2 + PI / 3;
    const x = Math.cos(a), z = Math.sin(a);
    k.rod([x * 0.1, 0.05, z * 0.1], [x * 0.125, 0.12, z * 0.125], 0.014, 'metal', C.steel, 0.003, 8);
    k.add(rbox(0.035, 0.016, 0.035, 0.004), 'metal', C.gunD, { p: [x * 0.1, 0.05, z * 0.1], r: [0, -a, 0] });
  }
  // LED housing on the camera face, lens baked dim (the live blink adds the light)
  k.add(rbox(0.04, 0.02, 0.03, 0.005), 'metal', C.gunD, { p: [MINE_LED.x, MINE_LED.y - 0.012, MINE_LED.z] });
  k.glow(sph(0.012, 10, 6), C.amber, { p: [MINE_LED.x, MINE_LED.y, MINE_LED.z] }, 1.5);
  return finalize(k, 0);
}
