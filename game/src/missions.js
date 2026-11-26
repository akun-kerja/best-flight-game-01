// missions.js — the three sorties: what to fly, how it is scored.
// Ring positions are fixed world coordinates over the islands, so every
// attempt flies the same course (fair for the judge's replays).

export const RING_RADIUS = 36;

// Ring Run: 8 amber rings in a loop over the archipelago.
export const RING_RUN_RINGS = [
  { x: 0, y: 165, z: -250, r: RING_RADIUS },
  { x: 520, y: 120, z: -780, r: RING_RADIUS },
  { x: 1050, y: 150, z: -900, r: RING_RADIUS },
  { x: 1450, y: 170, z: -750, r: RING_RADIUS }, // over Pulau Api
  { x: 900, y: 130, z: 100, r: RING_RADIUS },
  { x: 300, y: 105, z: 700, r: RING_RADIUS },
  { x: -700, y: 120, z: 950, r: RING_RADIUS },
  { x: 0, y: 90, z: 300, r: RING_RADIUS },   // over the runway, on final
];

// Storm Run: 5 rings at night, lower and tighter.
export const STORM_RINGS = [
  { x: 0, y: 170, z: -300, r: 32 },
  { x: 600, y: 130, z: -800, r: 32 },
  { x: 1200, y: 150, z: -700, r: 32 },
  { x: 700, y: 120, z: 150, r: 32 },
  { x: -350, y: 110, z: 950, r: 32 },
];

export const MISSIONS = [
  {
    id: 1,
    key: 'ring',
    name: 'RING RUN',
    short: 'Fly all 8 amber rings',
    brief: 'Take off, thread 8 amber rings over the islands, beat the clock.',
    rings: RING_RUN_RINGS,
    timeLimit: 240,
    needsLanding: false,
    sky: 'golden',
  },
  {
    id: 2,
    key: 'courier',
    name: 'ISLAND COURIER',
    short: 'Deliver cargo, land on the runway',
    brief: 'Fly to Pulau Api beacon, pick up the cargo, then land on runway 27. The landing is scored.',
    rings: [{ x: 1450, y: 150, z: -750, r: 30 }],
    timeLimit: 360,
    needsLanding: true,
    sky: 'golden',
  },
  {
    id: 3,
    key: 'storm',
    name: 'STORM RUN',
    short: 'Night storm: 5 rings, then land',
    brief: 'Night flight in a storm. Thread 5 lit rings, then bring her home in the rain.',
    rings: STORM_RINGS,
    timeLimit: 300,
    needsLanding: true,
    sky: 'storm',
  },
];

export function createMissionState(mission) {
  // Ring facings: the direction of travel through each ring (from the
  // previous ring, or from the runway for the first). A ring is passed by
  // flying through its disc, not by touching its exact centre.
  const facings = mission.rings.map((ring, i) => {
    const prev = i === 0 ? { x: 0, y: 6, z: 650 } : mission.rings[i - 1];
    const dx = ring.x - prev.x, dy = ring.y - prev.y, dz = ring.z - prev.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / l, y: dy / l, z: dz / l };
  });
  return {
    mission,
    facings,
    ringIndex: 0,
    ringsHit: 0,
    timeLeft: mission.timeLimit,
    score: 0,
    cargo: false,          // courier: picked up at the beacon ring
    done: false,
    result: null,          // 'complete' | 'crashed' | 'timeout' | 'fuel'
    message: mission.brief,
    messageTime: 0,
  };
}

// Has the plane flown through the current ring this step? A ring is a
// hoop: the plane's path segment must cross the ring's disc plane within
// the ring radius. (Falling back to near-centre distance for a step that
// starts inside the disc.)
export function ringPassed(plane, ring, facing, prevPos) {
  if (!prevPos) return false;
  const fx = facing.x, fy = facing.y, fz = facing.z;
  const d0 = (prevPos.x - ring.x) * fx + (prevPos.y - ring.y) * fy + (prevPos.z - ring.z) * fz;
  const d1 = (plane.x - ring.x) * fx + (plane.y - ring.y) * fy + (plane.z - ring.z) * fz;
  if (d0 < 0 && d1 >= 0) {
    const t = -d0 / (d1 - d0);
    const cx = prevPos.x + (plane.x - prevPos.x) * t;
    const cy = prevPos.y + (plane.y - prevPos.y) * t;
    const cz = prevPos.z + (plane.z - prevPos.z) * t;
    const radial = Math.hypot(cx - ring.x, cy - ring.y, cz - ring.z);
    if (radial < ring.r) return true;
  }
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < ring.r * 0.85;
}

// Score a landing: touchdown speed near 55, gentle descent, on centreline.
export function scoreLanding(touchdown) {
  const speedScore = Math.max(0, 40 - Math.abs(touchdown.speed - 55) * 0.9);
  const descentScore = Math.max(0, 30 - Math.abs(touchdown.verticalSpeed) * 9);
  const centreScore = Math.max(0, 30 - touchdown.offset * 1.4);
  const total = Math.round(speedScore + descentScore + centreScore);
  const label = total >= 85 ? 'GREASER LANDING!'
    : total >= 60 ? 'GOOD LANDING'
    : total >= 35 ? 'ROUGH LANDING' : 'HARD LANDING';
  return { total, label, speedScore, descentScore, centreScore };
}

// Advance the mission clock and check ring/landing progress.
// Returns events: 'ring', 'cargo', 'complete', 'timeout'.
// `prevPos` is the plane's position before this step (for ring crossing).
export function stepMission(ms, plane, events, dt, prevPos) {
  const out = [];
  if (ms.done) return out;
  ms.timeLeft -= dt;
  if (ms.timeLeft <= 0) {
    ms.done = true;
    ms.result = 'timeout';
    ms.message = 'TIME UP — sortie over';
    out.push('timeout');
    return out;
  }

  // Next ring.
  const ring = ms.mission.rings[ms.ringIndex];
  if (ring && ringPassed(plane, ring, ms.facings[ms.ringIndex], prevPos)) {
    ms.ringsHit++;
    ms.score += 100;
    ms.ringIndex++;
    if (ms.mission.key === 'courier' && !ms.cargo) {
      ms.cargo = true;
      ms.message = 'CARGO ABOARD — return and land on runway 27';
      out.push('cargo');
    } else {
      ms.message = `RING ${ms.ringsHit}/${ms.mission.rings.length}  +100`;
      out.push('ring');
    }
    ms.messageTime = 3;
  }

  // Landing completes courier and storm sorties.
  if (events.includes('landed') && ms.mission.needsLanding
    && ms.ringIndex >= ms.mission.rings.length) {
    const landing = scoreLanding(plane.touchdown);
    ms.score += landing.total + Math.round(ms.timeLeft) * 2;
    ms.done = true;
    ms.result = 'complete';
    ms.message = `${landing.label}  +${landing.total}`;
    ms.messageTime = 6;
    out.push('complete');
  }

  // Ring Run completes on the last ring.
  if (!ms.mission.needsLanding && ms.ringIndex >= ms.mission.rings.length) {
    ms.score += Math.round(ms.timeLeft) * 2;
    ms.done = true;
    ms.result = 'complete';
    ms.message = `ALL RINGS CLEAR — time bonus +${Math.round(ms.timeLeft) * 2}`;
    ms.messageTime = 6;
    out.push('complete');
  }

  if (events.includes('crashed')) {
    ms.done = true;
    ms.result = 'crashed';
    ms.message = 'CRASHED — sortie lost';
    ms.messageTime = 6;
    out.push('crashed');
  }
  if (events.includes('fuel-empty') && !ms.done) {
    ms.message = 'FUEL EMPTY — gliding, find the runway';
    ms.messageTime = 4;
  }
  if (ms.messageTime > 0) ms.messageTime -= dt;
  return out;
}
