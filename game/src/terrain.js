// terrain.js — seeded island archipelago: islands, sea, runway, clouds.
// Every number comes from one seed, so the world is identical on every run.

// Deterministic PRNG (mulberry32): same seed, same world, every load.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small deterministic value-noise for terrain detail (no Math.random anywhere).
export function noise2(x, z, seed) {
  const s = Math.sin(x * 0.013 + seed * 1.7) * Math.cos(z * 0.011 - seed * 2.3)
    + Math.sin((x + z) * 0.031 + seed) * 0.5
    + Math.sin(x * 0.057 - z * 0.043 + seed * 0.7) * 0.25;
  return s / 1.75;
}

export const SEA_LEVEL = 0;
export const WORLD_HALF = 2400; // world spans x,z in [-2400, 2400]

// Island bumps: { cx, cz, radius, height }. The main island carries the runway.
const ISLANDS = [
  { cx: 0, cz: -150, r: 1250, h: 95 },   // Banda Besar — home island, runway
  { cx: 1450, cz: -750, r: 620, h: 96 },  // Pulau Api — volcanic cone
  { cx: -1350, cz: -1150, r: 560, h: 118 },// Pulau Angin — tall ridge
  { cx: -1550, cz: 950, r: 720, h: 74 },  // Pulau Hijau — low and wide
  { cx: 1250, cz: 1350, r: 520, h: 62 },  // Pulau Karang — small atoll hill
  { cx: 350, cz: -1750, r: 460, h: 84 },  // Pulau Utara
  { cx: -650, cz: 1750, r: 420, h: 52 },  // Pulau Selatan
];

// The runway sits on Banda Besar: flat strip along the z axis.
export const RUNWAY = {
  cx: 0, cz: 420, length: 460, width: 48, alt: 6, heading: 0, // heading 0 = +z
};

function bumpHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = (x - isl.cx) / isl.r;
    const dz = (z - isl.cz) / isl.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 4) h += isl.h * Math.exp(-d2 * 1.6);
  }
  return h;
}

// True terrain height at (x, z). Blends to the flat runway strip near the runway.
export function heightAt(world, x, z) {
  let h = bumpHeight(x, z);
  h += noise2(x, z, world.seed) * 6 * Math.min(1, h / 30);
  // The airfield sits on a flat coastal plain: an ellipse around the
  // runway (400 m across, 700 m along it) is flattened to the runway
  // altitude, fading out beyond the edge. The island rises to the north
  // of it, so a go-around or a long landing stays over flat ground.
  const ex = (x - RUNWAY.cx) / 400;
  const ez = (z - RUNWAY.cz) / 700;
  const e = ex * ex + ez * ez;
  const flat = e < 1 ? 1 : Math.max(0, 1 - (Math.sqrt(e) - 1) * 4);
  if (flat > 0) h = h * (1 - flat) + RUNWAY.alt * flat;
  return Math.max(h, -4);
}

// Pre-sampled height grid the renderer draws as coloured quads.
function buildGrid(world, cell, half) {
  const n = Math.round((half * 2) / cell) + 1;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * cell;
      const z = -half + j * cell;
      heights[j * n + i] = heightAt(world, x, z);
    }
  }
  return { n, cell, half, heights };
}

export function createWorld(seed) {
  const rng = makeRng(seed);
  const world = { seed, rng, grid: null, clouds: [], beacons: [] };
  world.grid = buildGrid(world, 80, WORLD_HALF);
  // Clouds: seeded puffs drifting slowly over the sea — more of them,
  // and bigger, so the sky has depth in the screenshots.
  for (let i = 0; i < 38; i++) {
    world.clouds.push({
      x: (rng() * 2 - 1) * 2200,
      y: 200 + rng() * 160,
      z: (rng() * 2 - 1) * 2200,
      r: 80 + rng() * 130,
      drift: 1.5 + rng() * 2,
    });
  }
  // Beacon islands used by the courier mission.
  world.beacons = [
    { name: 'PULAU API', x: 1450, z: -750, y: 0 },
    { name: 'PULAU HIJAU', x: -1550, z: 950, y: 0 },
  ];
  return world;
}

// Height of the pre-sampled grid (fast path for the renderer).
export function gridHeight(world, x, z) {
  const g = world.grid;
  const fx = (x + g.half) / g.cell;
  const fz = (z + g.half) / g.cell;
  const i = Math.max(0, Math.min(g.n - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(g.n - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const tz = Math.max(0, Math.min(1, fz - j));
  const a = g.heights[j * g.n + i];
  const b = g.heights[j * g.n + i + 1];
  const c = g.heights[(j + 1) * g.n + i];
  const d = g.heights[(j + 1) * g.n + i + 1];
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
}
