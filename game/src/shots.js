// shots.js — deterministic screenshot poses via ?shot=<name>&seed=<n>.
// A shot freezes the simulation at a posed moment so the screenshot is a
// real render of the game's own code, identical on every capture.
//   cover    — chase view: ring ahead, runway in the distance, full HUD
//   cockpit  — cockpit view through the canopy, gauges lit
//   storm    — night storm mission, rain + lightning
//   landing  — just after a scored landing, sortie-complete panel visible

export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  return {
    name: params.get('shot') || null,
    seed: Number.parseInt(params.get('seed') || '1', 10) || 1,
  };
}

// Heading that points the plane from (x, z) toward (tx, tz).
function aimAt(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z);
}

const POSES = {
  cover(state) {
    // Ring 6 of the Ring Run, approached close from the sea south-east:
    // the ring looms large, the island and runway 27 ahead through it,
    // the golden-hour sea in the foreground.
    const p = state.plane, m = state.mission;
    p.x = 430; p.y = 160; p.z = 880;
    p.heading = aimAt(p.x, p.z, 300, 700);
    p.pitch = -0.06; p.roll = 0.12;
    p.speed = 76; p.throttle = 0.72;
    p.fuel = 78; p.hull = 96; p.onGround = false;
    m.ringIndex = 5; m.ringsHit = 5; m.score = 540; m.timeLeft = 168;
    m.message = 'RING 6 AHEAD — THEN HOME'; m.messageTime = 99;
    state.cameraMode = 'chase';
  },
  cockpit(state) {
    // Cockpit view, ring 2 ahead through the canopy.
    const p = state.plane, m = state.mission;
    p.x = 380; p.y = 140; p.z = -550;
    p.heading = aimAt(p.x, p.z, 520, -780);
    p.pitch = -0.02; p.roll = -0.1;
    p.speed = 80; p.throttle = 0.75;
    p.fuel = 88; p.hull = 100; p.onGround = false;
    m.ringIndex = 1; m.ringsHit = 1; m.score = 120; m.timeLeft = 205;
    m.message = 'RING 2 AHEAD'; m.messageTime = 99;
    state.cameraMode = 'cockpit';
  },
  storm(state) {
    // Storm Run at night: ring 2 close ahead, rain, lightning frozen
    // mid-flash — the ring looms instead of sitting small in the dark.
    const p = state.plane, m = state.mission;
    p.x = 450; p.y = 135; p.z = -550;
    p.heading = aimAt(p.x, p.z, 600, -800);
    p.pitch = -0.04; p.roll = 0.22;
    p.speed = 72; p.throttle = 0.68;
    p.fuel = 64; p.hull = 88; p.onGround = false;
    m.ringIndex = 1; m.ringsHit = 1; m.score = 100; m.timeLeft = 232;
    m.message = 'STORM RUN — RING 2 AHEAD'; m.messageTime = 99;
    state.cameraMode = 'chase';
    state.lightning = 1.0;
  },
  landing(state) {
    // Just after a scored landing on runway 27: sortie complete.
    const p = state.plane, m = state.mission;
    p.x = 2; p.y = 6; p.z = 520;
    p.heading = Math.PI; p.pitch = 0; p.roll = 0;
    p.speed = 38; p.throttle = 0.1;
    p.fuel = 41; p.hull = 100; p.onGround = true; p.landed = true;
    p.touchdown = { speed: 56, verticalSpeed: -1.4, offset: 2, roll: 0 };
    m.ringIndex = 1; m.ringsHit = 1; m.score = 572; m.timeLeft = 95;
    m.cargo = true;
    m.done = true; m.result = 'complete';
    m.message = 'GREASER LANDING!  +92'; m.messageTime = 99;
    state.cameraMode = 'chase';
  },
};

// Switch the state to a mission and apply a shot pose. Returns true if a
// known shot was applied (the sim then stays frozen for the capture).
export function applyShot(state, name) {
  const pose = POSES[name];
  if (!pose) return false;
  if (name === 'storm') {
    state.mission = state.newMission(3);
  } else if (name === 'landing') {
    state.mission = state.newMission(2);
  } else {
    state.mission = state.newMission(1);
  }
  pose(state);
  state.frozen = true;
  state.phase = 'playing';
  return true;
}
