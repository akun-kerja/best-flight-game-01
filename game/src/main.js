// main.js — Banda Sky Courier: game loop, state machine, wiring.
// Menu -> flying (1/2/3) -> paused / complete / crashed. ?shot= poses freeze
// the sim for screenshots. Fixed timestep (1/60) so replays are stable.

import { createWorld } from './terrain.js';
import { createPlane, stepPlane, clamp } from './flight.js';
import { MISSIONS, createMissionState, stepMission } from './missions.js';
import { renderScene } from './render.js';
import { drawHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { parseShot, applyShot } from './shots.js';

const DT = 1 / 60;

function newMission(id) {
  const mission = MISSIONS.find((m) => m.id === id) || MISSIONS[0];
  return createMissionState(mission);
}

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const shot = parseShot();

  const state = {
    world: createWorld(shot.seed),
    plane: createPlane(),
    mission: newMission(1),
    cameraMode: 'chase',
    phase: 'menu', // menu | playing | paused
    frozen: false,
    time: 0,
    lightning: 0,
    lightningTimer: 5,
    w: 0,
    h: 0,
    newMission,
  };
  state.newMission = (id) => {
    state.plane = createPlane();
    return newMission(id);
  };

  const input = createInput();
  input.attach();
  const audio = createAudio();

  function resize() {
    state.w = canvas.width = window.innerWidth;
    state.h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // A shot pose overrides the menu: freeze at the posed moment.
  if (shot.name) {
    applyShot(state, shot.name);
  }

  function startMission(id) {
    state.plane = createPlane();
    state.mission = newMission(id);
    state.phase = 'playing';
    state.frozen = false;
    state.lightning = 0;
    audio.ensure();
  }

  function step(dt) {
    const plane = state.plane;
    const prevPos = { x: plane.x, y: plane.y, z: plane.z };
    const ctl = input.flightControls();
    const events = stepPlane(plane, ctl, state.world, dt);
    const missionEvents = stepMission(state.mission, plane, events, dt, prevPos);
    // Sounds for what just happened.
    if (missionEvents.includes('ring') || missionEvents.includes('cargo')) {
      audio.ring();
    }
    if (missionEvents.includes('complete') || events.includes('landed')) {
      audio.land();
    }
    if (missionEvents.includes('crashed') || events.includes('crashed')) {
      audio.crash();
    }
    // A rough or hard touchdown thuds so the pilot feels the hit.
    if (events.includes('hard-hit') || events.includes('rough')) {
      audio.thud();
    }
    // Storm lightning: random-ish strikes on a seeded timer.
    if (state.mission.mission.sky === 'storm') {
      state.lightningTimer -= dt;
      if (state.lightningTimer <= 0) {
        state.lightning = 1;
        state.lightningTimer = 4 + state.world.rng() * 5;
        audio.thunder();
      }
    }
    state.lightning = Math.max(0, state.lightning - dt * 2.4);
    audio.update(plane);
  }

  function handleKeys() {
    if (input.consume('KeyM')) {
      const muted = audio.toggleMute();
      state.mission.message = muted ? 'SOUND OFF' : 'SOUND ON';
      state.mission.messageTime = 1.5;
    }
    if (input.consume('KeyC')) {
      state.cameraMode = state.cameraMode === 'chase' ? 'cockpit' : 'chase';
    }
    if (input.consume('KeyP')) {
      if (state.phase === 'playing') state.phase = 'paused';
      else if (state.phase === 'paused') state.phase = 'playing';
    }
    if (input.consume('KeyR') && state.phase !== 'menu') {
      startMission(state.mission.mission.id);
    }
    for (const [code, id] of [['Digit1', 1], ['Digit2', 2], ['Digit3', 3]]) {
      if (input.consume(code)) startMission(id);
    }
    // First interaction unlocks audio.
    if (state.phase === 'playing' && !state.frozen) audio.ensure();
  }

  function drawMenu() {
    const { w, h } = state;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.45)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2e6c9';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('BANDA SKY COURIER', w / 2, h * 0.30);
    ctx.fillStyle = '#ffb020';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('A prop courier across a golden-hour archipelago', w / 2, h * 0.30 + 38);
    ctx.fillStyle = '#dfe6ef';
    ctx.font = '20px sans-serif';
    const lines = [
      '1 — RING RUN        thread 8 amber rings',
      '2 — ISLAND COURIER  deliver cargo, land on runway 27',
      '3 — STORM RUN       night storm, 5 rings, then land',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.46 + i * 34));
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#9fc4d4';
    ctx.fillText('W climb / S descend   •   A/D roll to turn   •   Shift/Ctrl throttle   •   C camera   •   R restart   •   P pause   •   M mute', w / 2, h * 0.62);
    ctx.fillText('Watch your fuel and hull — a sortie is a decision. Slow down for tight turns.', w / 2, h * 0.62 + 28);
    ctx.restore();
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    handleKeys();
    if (state.phase === 'playing' && !state.frozen) {
      acc += elapsed;
      while (acc >= DT) {
        step(DT);
        acc -= DT;
      }
      state.time += elapsed;
    } else if (state.phase === 'menu') {
      // Cinematic drift behind the parked plane while the menu is up.
      state.time += elapsed;
      state.plane.heading = Math.PI + Math.sin(state.time * 0.08) * 0.15;
    }
    state.lastCam = renderScene(ctx, state);
    if (state.phase === 'menu') {
      drawMenu();
    } else {
      drawHud(ctx, state, state.lastCam);
      if (state.phase === 'paused') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f2e6c9';
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('PAUSED — press P to fly', state.w / 2, state.h / 2);
        ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Expose a tiny handle for debugging and for the screenshot harness.
  window.__banda = state;
}

boot();
