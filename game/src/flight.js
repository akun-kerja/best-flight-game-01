// flight.js — flight physics for the Banda Sky Courier prop plane.
// Units: metres, metres/second, radians. One fixed step per frame (dt = 1/60).

import { RUNWAY, heightAt } from './terrain.js';

export const FLIGHT = {
  stallSpeed: 42,      // below this the wing stops flying: sink + weak controls
  cruiseSpeed: 78,     // comfortable speed at ~70% throttle
  maxSpeed: 118,       // above this the airframe takes overspeed damage
  takeoffSpeed: 48,    // rotate speed on the runway
  maxFuel: 100,
  maxHull: 100,
  gravity: 9.8,
};

export function createPlane() {
  return {
    // Position and attitude.
    x: 0, y: 6, z: 650,            // parked on the runway, heading north (-z)
    heading: Math.PI, pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    // Resources and state.
    fuel: FLIGHT.maxFuel,
    hull: FLIGHT.maxHull,
    onGround: true,
    crashed: false,
    landed: false,
    hasFlown: false,   // true once the plane has lifted off this sortie
    verticalSpeed: 0,
    // Display helpers.
    shake: 0,
    // Last ground-contact report (for landing scoring).
    touchdown: null,
  };
}

// Clamp helper shared by the physics step.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// One physics step. `ctl` is { pitch, roll, throttleDelta } in [-1, 1].
// Returns an array of event strings for this step.
export function stepPlane(plane, ctl, world, dt) {
  const events = [];
  if (plane.crashed) return events;

  const speedFactor = clamp(plane.speed / FLIGHT.cruiseSpeed, 0.15, 1.4);

  // --- Throttle -----------------------------------------------------------
  plane.throttle = clamp(plane.throttle + ctl.throttleDelta * dt * 0.9, 0, 1);
  if (plane.fuel <= 0) plane.throttle = 0;

  // --- Speed: thrust vs drag, plus gravity along the flight path -----------
  const thrust = plane.throttle * 24;
  const drag = 0.0022 * plane.speed * plane.speed + 0.35 * Math.abs(plane.pitch);
  const gravityAlong = -FLIGHT.gravity * Math.sin(plane.pitch) * 0.55;
  plane.speed = Math.max(0, plane.speed + (thrust - drag + gravityAlong) * dt);

  // --- Attitude -----------------------------------------------------------
  const authority = plane.onGround ? 0.35 : clamp((plane.speed - 18) / 40, 0.12, 1);
  const pitchRate = ctl.pitch * 0.85 * authority;
  plane.pitch = clamp(plane.pitch + pitchRate * dt, -0.55, 0.55);
  const rollRate = ctl.roll * 2.2 * authority;
  // Roll sign: D (roll +1) banks right — the right wing drops and the
  // heading turns toward the plane's right (negative roll in this basis).
  plane.roll = clamp(plane.roll - rollRate * dt, -1.35, 1.35);
  // Gentle roll return when the stick is centred (in the air).
  if (!plane.onGround && Math.abs(ctl.roll) < 0.05) {
    plane.roll -= plane.roll * 0.35 * dt;
  }
  // Banked turn: turn rate grows with bank and shrinks with speed — fast
  // planes turn wide, slow planes turn tight. This is the discipline the
  // game rewards: slow down before a tight ring, open the throttle after.
  // TURN_FACTOR > 2 keeps the game arcade-responsive: at approach speed
  // (~50 m/s) the tightest turn is ~55 m, so a lined-up ring can be
  // flown through instead of orbited around.
  if (!plane.onGround && plane.speed > 20) {
    const turnRate = (FLIGHT.gravity * Math.tan(plane.roll)) / plane.speed * 2.4;
    plane.heading += turnRate * dt;
  }

  // --- Vertical motion ----------------------------------------------------
  let vy = plane.speed * Math.sin(plane.pitch);
  // Stall: below stall speed the wing gives up — sink and nose drop.
  const stalled = !plane.onGround && plane.speed < FLIGHT.stallSpeed;
  if (stalled) {
    vy -= (FLIGHT.stallSpeed - plane.speed) * 0.55;
    plane.pitch -= 0.12 * dt;
    plane.shake = Math.max(plane.shake, 0.5);
  }
  plane.verticalSpeed = vy;
  plane.y += vy * dt;

  // --- Horizontal motion --------------------------------------------------
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  plane.x += fx * plane.speed * Math.cos(plane.pitch) * dt;
  plane.z += fz * plane.speed * Math.cos(plane.pitch) * dt;

  // Soft world edge: a gentle push back instead of an invisible wall.
  const edge = 2350;
  if (Math.abs(plane.x) > edge || Math.abs(plane.z) > edge) {
    plane.heading += (plane.x * fz - plane.z * fx > 0 ? 1 : -1) * 0.25 * dt;
    events.push('edge');
  }

  // --- Fuel ----------------------------------------------------------------
  if (plane.throttle > 0) {
    plane.fuel = Math.max(0, plane.fuel - (0.08 + plane.throttle * 0.30) * dt);
    if (plane.fuel <= 0) events.push('fuel-empty');
  }

  // --- Overspeed damage -----------------------------------------------------
  if (plane.speed > FLIGHT.maxSpeed) {
    plane.hull -= (plane.speed - FLIGHT.maxSpeed) * 0.30 * dt;
    plane.shake = Math.max(plane.shake, 0.7);
    events.push('overspeed');
  }

  // --- Ground contact -------------------------------------------------------
  const ground = heightAt(world, plane.x, plane.z);
  const groundClearance = plane.y - ground;
  plane.shake = Math.max(0, plane.shake - dt * 2.2);

  if (groundClearance <= 0) {
    plane.y = ground;
    const onRunway = isOnRunway(plane.x, plane.z);
    const gentle = Math.abs(plane.verticalSpeed) < 3.2;
    const aligned = Math.abs(plane.roll) < 0.35 && Math.abs(plane.pitch) < 0.18;
    const landSpeed = plane.speed >= 30 && plane.speed <= 82;
    if (plane.onGround) {
      // Rolling on the ground: keep rolling, bleed speed.
      plane.speed = Math.max(0, plane.speed - 14 * dt);
      if (plane.speed < 2 && plane.throttle < 0.05) events.push('stopped');
      // Rolled to a stop on the runway — that counts as a landing too
      // (a long flare or a crooked touchdown that stayed on the strip).
      // Only after the plane has actually flown this sortie: at spawn it
      // sits on the runway at speed 0, which is not a landing.
      if (!plane.landed && plane.hasFlown && onRunway && plane.speed < 30) {
        plane.landed = true;
        plane.touchdown = {
          speed: plane.speed,
          verticalSpeed: plane.verticalSpeed,
          offset: Math.abs(plane.x - 0),
          roll: plane.roll,
        };
        events.push('landed');
      }
    } else if (onRunway && gentle && aligned && landSpeed) {
      plane.onGround = true;
      plane.landed = true;
      plane.touchdown = {
        speed: plane.speed,
        verticalSpeed: plane.verticalSpeed,
        offset: Math.abs(plane.x - 0),
        roll: plane.roll,
      };
      events.push('landed');
    } else {
      // Hard contact: terrain, water or a bad landing. Three tiers, so a
      // bad approach costs the sortie something but only a real slam
      // ends it: a gentle touchdown rolls out, a firm one bounces with
      // damage, and only a violent impact is a crash.
      const vs = Math.abs(plane.verticalSpeed);
      if (vs < 5 && plane.speed < 70) {
        // Gentle touchdown off the runway (grass beside it, or a heavy
        // arrival): survivable. The plane rolls out on the ground and the
        // pilot can throttle up and take off again for another try — a bad
        // approach costs time and a little hull, not the whole sortie.
        plane.onGround = true;
        if (!onRunway) plane.hull -= 5;
        plane.shake = 0.5;
        events.push('rough');
      } else if (vs < 10 && plane.speed < 90) {
        // Firm landing: survivable but costly, bounces the plane back up.
        plane.hull -= (vs - 5) * 8 + plane.speed * 0.1;
        plane.shake = 1;
        events.push(plane.hull <= 0 ? 'crashed' : 'hard-hit');
        if (plane.hull <= 0) {
          plane.crashed = true;
          plane.speed = 0;
        } else {
          plane.y = ground + 2;
          plane.speed *= 0.5;
          plane.pitch = 0.2;
        }
      } else {
        const impact = vs + plane.speed * 0.12;
        plane.hull -= impact * 2.4;
        plane.shake = 1;
        events.push(plane.hull <= 0 ? 'crashed' : 'hard-hit');
        if (plane.hull <= 0) {
          plane.crashed = true;
          plane.speed = 0;
        } else {
          // Bounce off a survivable hit, bleeding speed.
          plane.y = ground + 2;
          plane.speed *= 0.45;
          plane.pitch = 0.15;
        }
      }
    }
  } else if (plane.onGround && plane.speed > FLIGHT.takeoffSpeed) {
    // Rotate: fast enough to lift off.
    plane.onGround = false;
    plane.hasFlown = true;
    events.push('takeoff');
  } else if (plane.onGround) {
    plane.y = ground; // stay glued to the runway while taxiing
  }

  if (plane.hull <= 0 && !plane.crashed) {
    plane.crashed = true;
    events.push('crashed');
  }
  return events;
}

// Is (x, z) inside the runway strip?
export function isOnRunway(x, z) {
  return Math.abs(x - RUNWAY.cx) < RUNWAY.width / 2 + 4
    && Math.abs(z - RUNWAY.cz) < RUNWAY.length / 2 + 4;
}
