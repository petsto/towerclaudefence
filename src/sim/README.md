# src/sim

Pure, deterministic game simulation.

**Rule:** nothing in this directory may import `three`, touch `window`/`document`/DOM, read wall-clock time (`Date.now`, `performance.now`), or call `Math.random`. Time advances only via fixed steps of `FIXED_DT` (1/60 s); randomness comes from a seeded RNG carried in state. Same inputs + same seed = same outcome, so everything here is testable headlessly with Vitest.

Inputs arrive as commands; outputs are plain state objects that `src/render` and `src/ui` read.
