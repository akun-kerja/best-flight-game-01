// render.js — Canvas 2D pseudo-3D renderer for Banda Sky Courier.
// Projects 3D world points to the screen and draws far-to-near (painter's
// algorithm), so no WebGL or library is needed. One consistent golden-hour
// palette for the whole scene.

import { RUNWAY, SEA_LEVEL, gridHeight, noise2 } from './terrain.js';

// Camera: position, orthonormal basis (fwd, right, up), focal length.
export function makeCamera(plane, mode, w, h, time) {
  const fov = 62 * Math.PI / 180;
  const focal = (h / 2) / Math.tan(fov / 2);
  const cam = { focal, cx: w / 2, cy: h / 2, pos: { x: 0, y: 0, z: 0 } };
  const fx = Math.sin(plane.heading) * Math.cos(plane.pitch);
  const fy = Math.sin(plane.pitch);
  const fz = Math.cos(plane.heading) * Math.cos(plane.pitch);
  const fwd = norm3(fx, fy, fz);
  const right = norm3(-Math.cos(plane.heading), 0, Math.sin(plane.heading));
  const up = cross3(right, fwd);

  if (mode === 'cockpit') {
    cam.pos = {
      x: plane.x + fwd.x * 2.6,
      y: plane.y + fwd.y * 2.6 + 0.9,
      z: plane.z + fwd.z * 2.6,
    };
  } else {
    // Chase: behind and above, looking slightly ahead of the plane.
    // The camera rolls a little with the plane so turns feel banked.
    const back = 18, above = 5.5;
    cam.pos = {
      x: plane.x - fwd.x * back + up.x * above,
      y: plane.y - fwd.y * back + up.y * above,
      z: plane.z - fwd.z * back + up.z * above,
    };
    const look = {
      x: plane.x + fwd.x * 12, y: plane.y + fwd.y * 12 + 1, z: plane.z + fwd.z * 12,
    };
    const lf = norm3(look.x - cam.pos.x, look.y - cam.pos.y, look.z - cam.pos.z);
    const lr = cross3(lf, { x: 0, y: 1, z: 0 });
    cam.fwd = lf; cam.right = lr; cam.up = cross3(lr, lf);
    applyShake(cam, plane, time);
    return cam;
  }
  cam.fwd = fwd; cam.right = right; cam.up = up;
  applyShake(cam, plane, time);
  return cam;
}

function applyShake(cam, plane, time) {
  if (plane.shake > 0.02) {
    const s = plane.shake * 3;
    cam.cx += Math.sin(time * 47) * s;
    cam.cy += Math.cos(time * 39) * s;
  }
}

export function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

// Cinematic menu camera: slow orbit above the home island, looking out
// over the runway, the sea and the island chain.
export function makeMenuCamera(w, h, time) {
  const fov = 62 * Math.PI / 180;
  const focal = (h / 2) / Math.tan(fov / 2);
  const a = time * 0.05;
  const pos = { x: Math.sin(a) * 320, y: 95, z: 200 + Math.cos(a) * 320 };
  const look = { x: 0, y: 55, z: -100 };
  const fwd = norm3(look.x - pos.x, look.y - pos.y, look.z - pos.z);
  const right = cross3(fwd, { x: 0, y: 1, z: 0 });
  const up = cross3(right, fwd);
  return { focal, cx: w / 2, cy: h / 2, pos, fwd, right, up };
}

export function cross3(a, b) {
  return norm3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

// Project a world point. Returns null when behind the camera.
export function project(cam, x, y, z) {
  const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
  const zc = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (zc < 0.6) return null;
  const xc = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const yc = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return {
    sx: cam.cx + (xc / zc) * cam.focal,
    sy: cam.cy - (yc / zc) * cam.focal,
    zc,
  };
}

// Same projection, but a point behind the near plane is clamped onto it
// instead of returning null. Used ONLY for the terrain: a quad that
// straddles the camera still covers the bottom of the frame instead of
// leaving a hole where the sky/sea background shows through (that made
// a landed plane look as if it were floating over water).
function projectClamped(cam, x, y, z) {
  const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
  const zc = Math.max(0.6, dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z);
  const xc = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const yc = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return {
    sx: cam.cx + (xc / zc) * cam.focal,
    sy: cam.cy - (yc / zc) * cam.focal,
    zc,
  };
}

const SKIES = {
  golden: { top: '#16365f', mid: '#c96a3e', low: '#ffc46b', sun: '#fff0b8', seaTop: '#e8965a', seaBot: '#1d4e6e', cloud: 'rgba(255,242,221,0.92)' },
  storm: { top: '#070b1c', mid: '#141a33', low: '#2c3350', sun: '#cdd6f4', seaTop: '#232a45', seaBot: '#0a1226', cloud: 'rgba(74,79,102,0.95)' },
};

export function drawSkySea(ctx, cam, sky, w, h, time) {
  const pal = SKIES[sky];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.top);
  g.addColorStop(0.30, sky === 'storm' ? pal.mid : '#3d6a9e');
  g.addColorStop(0.45, pal.mid);
  g.addColorStop(0.58, pal.low);
  g.addColorStop(0.621, pal.seaTop);
  g.addColorStop(1, pal.seaBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Low sun (golden) or pale moon (storm) fixed to the west.
  const sunP = project(cam, cam.pos.x - 6000, 260, cam.pos.z - 1200);
  if (sunP) {
    const r = sky === 'storm' ? 26 : 56;
    const glow = ctx.createRadialGradient(sunP.sx, sunP.sy, 2, sunP.sx, sunP.sy, r * 5);
    glow.addColorStop(0, sky === 'storm' ? 'rgba(205,214,244,0.5)' : 'rgba(255,240,184,0.9)');
    glow.addColorStop(0.4, 'rgba(255,190,110,0.35)');
    glow.addColorStop(1, 'rgba(255,240,184,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sunP.sx, sunP.sy, r * 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.sun;
    ctx.beginPath(); ctx.arc(sunP.sx, sunP.sy, r, 0, Math.PI * 2); ctx.fill();
  }

  // Sea shimmer: horizontal light streaks toward the sun, wider and
  // brighter near the horizon so the water reads as sunlit, not flat.
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffd9a0';
  for (let i = 0; i < 8; i++) {
    const yy = h * (0.66 + i * 0.045);
    const ww = w * (0.62 - i * 0.06);
    ctx.fillRect((w - ww) / 2, yy, ww, 2);
  }
  ctx.restore();
}

// --- Terrain colour by height, with simple slope shading -------------------
// Patches of dry grass and jungle break the flat green so the islands
// read as varied land, not a single colour; steep slopes are bare rock.
function terrainColor(h, slope, sky, vary) {
  let base;
  if (h < 1.2) base = [216, 192, 138];       // sand
  else if (h < 24) base = vary > 0.72 ? [188, 170, 95] : [127, 174, 90]; // dry grass patches / low grass
  else if (h < 62) base = vary < 0.28 ? [58, 118, 58] : [79, 143, 74];    // jungle patches / deep green
  else if (h < 120) base = [138, 127, 116]; // rock
  else base = [232, 232, 232];               // snow (only the highest peaks)
  if (slope > 30 && h >= 24) base = [132, 120, 108]; // cliffs
  const shade = (0.78 + Math.min(0.34, slope * 1.1)) * (0.82 + vary * 0.36);
  const night = sky === 'storm' ? 0.34 : 1;
  const r = Math.round(base[0] * shade * night);
  const g = Math.round(base[1] * shade * night);
  const b = Math.round(base[2] * shade * night);
  return `rgb(${r},${g},${b})`;
}

// Draw the heightfield as projected quads, far to near.
export function drawTerrain(ctx, cam, world, sky) {
  const g = world.grid;
  const items = [];
  const n = g.n, cell = g.cell, half = g.half;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const x0 = -half + i * cell, z0 = -half + j * cell;
      const h00 = g.heights[j * n + i];
      const h10 = g.heights[j * n + i + 1];
      const h01 = g.heights[(j + 1) * n + i];
      const h11 = g.heights[(j + 1) * n + i + 1];
      // Skip quads entirely behind the camera (clamping would smear them
      // across the whole frame); quads straddling the camera keep their
      // clamped corners so the ground still covers the bottom of the view.
      const behind = (x, y, z) => {
        const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
        return dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z < 0.6;
      };
      if (behind(x0, h00, z0) && behind(x0 + cell, h10, z0)
        && behind(x0, h01, z0 + cell) && behind(x0 + cell, h11, z0 + cell)) continue;
      const p00 = projectClamped(cam, x0, h00, z0);
      const p10 = projectClamped(cam, x0 + cell, h10, z0);
      const p01 = projectClamped(cam, x0, h01, z0 + cell);
      const p11 = projectClamped(cam, x0 + cell, h11, z0 + cell);
      const pts = [p00, p10, p11, p01];
      // Skip quads entirely off-screen.
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, depth = 0;
      for (const p of pts) {
        if (p.sx < minX) minX = p.sx;
        if (p.sx > maxX) maxX = p.sx;
        if (p.sy < minY) minY = p.sy;
        if (p.sy > maxY) maxY = p.sy;
        depth += p.zc;
      }
      if (maxX < -50 || minX > ctx.canvas.width + 50
        || maxY < -50 || minY > ctx.canvas.height + 50) continue;
      const hAvg = (h00 + h10 + h01 + h11) / 4;
      const slope = Math.abs(h10 - h00) + Math.abs(h01 - h00);
      const vary = 0.5 + 0.5 * noise2(x0, z0, 7);
      items.push({ depth: depth / pts.length, pts, color: terrainColor(hAvg, slope, sky, vary) });
    }
  }
  items.sort((a, b) => b.depth - a.depth);
  for (const it of items) {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.moveTo(it.pts[0].sx, it.pts[0].sy);
    for (let k = 1; k < it.pts.length; k++) ctx.lineTo(it.pts[k].sx, it.pts[k].sy);
    ctx.closePath();
    ctx.fill();
  }
}

// --- Runway -----------------------------------------------------------------
// Drawn in short segments along its length so the part ahead of the camera
// still renders when the near threshold is behind it.
export function drawRunway(ctx, cam, sky) {
  const L = RUNWAY.length / 2, Wd = RUNWAY.width / 2;
  const y = RUNWAY.alt + 0.4;
  const segLen = 40;
  for (let d = -L; d < L; d += segLen) {
    const c = [
      project(cam, RUNWAY.cx - Wd, y, RUNWAY.cz + d),
      project(cam, RUNWAY.cx + Wd, y, RUNWAY.cz + d),
      project(cam, RUNWAY.cx + Wd, y, RUNWAY.cz + d + segLen),
      project(cam, RUNWAY.cx - Wd, y, RUNWAY.cz + d + segLen),
    ].filter(Boolean);
    if (c.length < 3) continue;
    ctx.fillStyle = sky === 'storm' ? '#23262e' : '#3a3f46';
    ctx.beginPath();
    ctx.moveTo(c[0].sx, c[0].sy);
    for (let k = 1; k < c.length; k++) ctx.lineTo(c[k].sx, c[k].sy);
    ctx.closePath(); ctx.fill();
  }
  // Centreline dashes.
  ctx.fillStyle = '#f5f5f5';
  for (let d = -L + 20; d < L - 10; d += 40) {
    const a = project(cam, RUNWAY.cx - 1.5, y + 0.2, RUNWAY.cz + d);
    const b = project(cam, RUNWAY.cx + 1.5, y + 0.2, RUNWAY.cz + d);
    const cc = project(cam, RUNWAY.cx - 1.5, y + 0.2, RUNWAY.cz + d + 18);
    const dd = project(cam, RUNWAY.cx + 1.5, y + 0.2, RUNWAY.cz + d + 18);
    if (!a || !b || !cc || !dd) continue;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(dd.sx, dd.sy); ctx.lineTo(cc.sx, cc.sy);
    ctx.closePath(); ctx.fill();
  }
  // Runway number at the near threshold.
  const num = project(cam, RUNWAY.cx, y + 0.5, RUNWAY.cz + L - 28);
  if (num && num.zc < 900) {
    const size = Math.max(10, Math.min(64, 26000 / num.zc));
    ctx.fillStyle = '#f5f5f5';
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('27', num.sx, num.sy);
  }
  // Edge lights.
  ctx.fillStyle = sky === 'storm' ? '#ffd76a' : '#e8f2ff';
  for (let d = -L + 10; d <= L - 10; d += 46) {
    for (const s of [-1, 1]) {
      const p = project(cam, RUNWAY.cx + s * (Wd - 2), y + 0.6, RUNWAY.cz + d);
      if (!p || p.zc > 1200) continue;
      const r = Math.max(1, 900 / p.zc);
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// --- Rings -------------------------------------------------------------------
function drawRing(ctx, cam, ring, isNext, time, sky) {
  // The ring faces the plane, so it always reads as a target.
  const dx = ring.x, dy = ring.y, dz = ring.z;
  const toRing = norm3(dx - cam.pos.x, dy - cam.pos.y, dz - cam.pos.z);
  const right = cross3(toRing, { x: 0, y: 1, z: 0 });
  const up = cross3(right, toRing);
  const N = 22;
  const pts = [];
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * 2;
    const px = ring.x + (right.x * Math.cos(a) + up.x * Math.sin(a)) * ring.r;
    const py = ring.y + (right.y * Math.cos(a) + up.y * Math.sin(a)) * ring.r;
    const pz = ring.z + (right.z * Math.cos(a) + up.z * Math.sin(a)) * ring.r;
    const p = project(cam, px, py, pz);
    if (p) pts.push(p);
  }
  if (pts.length < 8) return;
  const centre = project(cam, ring.x, ring.y, ring.z);
  const width = centre ? Math.max(2, Math.min(14, 2600 / centre.zc)) : 4;
  const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 4) : 0.55;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = isNext ? `rgba(255,176,32,${pulse})` : 'rgba(255,176,32,0.35)';
  ctx.lineWidth = width * 3.2;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].sx, pts[k].sy);
  ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
  // No distance tag here: the HUD's ring marker already carries the
  // "RING n/8 — NNN m" label, and a second number above the ring only
  // confused the read.
}

export function drawRings(ctx, cam, rings, nextIndex, time, sky) {
  rings.forEach((ring, i) => {
    if (i < nextIndex) return; // passed rings disappear
    drawRing(ctx, cam, ring, i === nextIndex, time, sky);
  });
}

// --- Clouds ------------------------------------------------------------------
export function drawClouds(ctx, cam, world, sky, time) {
  const pal = sky === 'storm' ? '74,79,102' : '255,242,221';
  for (const c of world.clouds) {
    const p = project(cam, c.x, c.y, c.z);
    if (!p || p.zc > 4200) continue;
    const s = (c.r / p.zc) * cam.focal;
    if (s < 4) continue;
    ctx.fillStyle = `rgba(${pal},${sky === 'storm' ? 0.9 : 0.85})`;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, s, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.sx - s * 0.45, p.sy + s * 0.08, s * 0.6, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.sx + s * 0.45, p.sy + s * 0.08, s * 0.6, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// --- The plane (chase view) ---------------------------------------------------
// Low-poly courier plane built from polygons in plane-local space:
// +z forward, +y up, +x right. Colours: cream fuselage, teal wings,
// amber stripe — original livery, not copied from any real aircraft.
const PLANE_POLYS = (() => {
  const polys = [];
  const cream = '#f2e6c9', creamDark = '#d9c9a3';
  const teal = '#2e7f86', tealDark = '#226066';
  const amber = '#f5a623', dark = '#3a3f46';
  // Fuselage: rings of 4 points (top, right, bottom, left) along the body.
  const sections = [
    { z: 4.0, r: 0.22 }, { z: 2.2, r: 0.55 }, { z: 0.2, r: 0.62 },
    { z: -1.8, r: 0.5 }, { z: -3.4, r: 0.18 },
  ];
  for (let s = 0; s < sections.length - 1; s++) {
    const a = sections[s], b = sections[s + 1];
    const ring = (sec, side) => {
      if (side === 0) return [0, sec.r * 0.9, sec.z];
      if (side === 1) return [sec.r, 0, sec.z];
      if (side === 2) return [0, -sec.r * 0.9, sec.z];
      return [-sec.r, 0, sec.z];
    };
    for (let side = 0; side < 4; side++) {
      const p1 = ring(a, side), p2 = ring(a, (side + 1) % 4);
      const p3 = ring(b, (side + 1) % 4), p4 = ring(b, side);
      polys.push({ pts: [p1, p2, p3, p4], color: side === 0 ? cream : side === 2 ? creamDark : cream });
    }
  }
  // Amber cheatline stripe along the fuselage sides.
  polys.push({ pts: [[0.58, 0.18, 2.0], [0.58, 0.18, -1.6], [0.5, -0.05, -1.6], [0.5, -0.05, 2.0]], color: amber });
  polys.push({ pts: [[-0.58, 0.18, 2.0], [-0.5, -0.05, 2.0], [-0.5, -0.05, -1.6], [-0.58, 0.18, -1.6]], color: amber });
  // Main wing (slight dihedral), tailplane, fin.
  polys.push({ pts: [[-5.2, 0.28, 0.9], [5.2, 0.28, 0.9], [5.2, 0.28, -0.7], [-5.2, 0.28, -0.7]], color: teal });
  polys.push({ pts: [[-5.2, 0.28, 0.9], [-4.4, 0.34, 0.9], [-4.4, 0.34, -0.7], [-5.2, 0.28, -0.7]], color: tealDark });
  polys.push({ pts: [[5.2, 0.28, 0.9], [4.4, 0.34, 0.9], [4.4, 0.34, -0.7], [5.2, 0.28, -0.7]], color: tealDark });
  polys.push({ pts: [[-1.9, 0.35, -2.6], [1.9, 0.35, -2.6], [1.9, 0.35, -3.3], [-1.9, 0.35, -3.3]], color: teal });
  polys.push({ pts: [[0, 0.4, -2.5], [0, 1.7, -3.2], [0, 1.7, -3.5], [0, 0.4, -3.4]], color: tealDark });
  // Canopy.
  polys.push({ pts: [[-0.42, 0.55, 2.0], [0.42, 0.55, 2.0], [0.42, 0.62, 0.6], [-0.42, 0.62, 0.6]], color: '#9fc4d4' });
  // Cabin windows: three small dark panes on each side of the fuselage.
  const win = '#20262e';
  for (const s of [-1, 1]) {
    for (const zc of [1.7, 1.05, 0.4]) {
      polys.push({ pts: [[s * 0.60, 0.12, zc + 0.22], [s * 0.60, 0.12, zc - 0.22], [s * 0.60, 0.42, zc - 0.22], [s * 0.60, 0.42, zc + 0.22]], color: win });
    }
  }
  // Tail stripe: amber band across the rear fuselage.
  polys.push({ pts: [[0.5, 0.30, -2.4], [0.5, 0.30, -2.9], [0.42, -0.28, -2.9], [0.42, -0.28, -2.4]], color: amber });
  polys.push({ pts: [[-0.5, 0.30, -2.4], [-0.42, -0.28, -2.4], [-0.42, -0.28, -2.9], [-0.5, 0.30, -2.9]], color: amber });
  // Spinner cone at the nose (octagon facing forward, amber).
  const spin = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    spin.push([Math.cos(a) * 0.22, Math.sin(a) * 0.22, 4.02]);
  }
  polys.push({ pts: spin, color: amber });
  // Fixed gear legs + wheels.
  polys.push({ pts: [[-0.5, -0.5, 1.4], [-0.5, -1.15, 1.4], [-0.42, -1.15, 1.4], [-0.42, -0.5, 1.4]], color: dark });
  polys.push({ pts: [[0.5, -0.5, 1.4], [0.42, -0.5, 1.4], [0.42, -1.15, 1.4], [0.5, -1.15, 1.4]], color: dark });
  return polys;
})();

function planeBasis(plane) {
  const fwd = norm3(
    Math.sin(plane.heading) * Math.cos(plane.pitch),
    Math.sin(plane.pitch),
    Math.cos(plane.heading) * Math.cos(plane.pitch),
  );
  let right = norm3(-Math.cos(plane.heading), 0, Math.sin(plane.heading));
  // Roll the basis around the forward axis.
  const cr = Math.cos(plane.roll), sr = Math.sin(plane.roll);
  const up0 = cross3(right, fwd);
  const rightR = {
    x: right.x * cr + up0.x * sr,
    y: right.y * cr + up0.y * sr,
    z: right.z * cr + up0.z * sr,
  };
  const upR = cross3(rightR, fwd);
  return { fwd, right: rightR, up: upR };
}

export function drawPlane(ctx, cam, plane, time) {
  const { fwd, right, up } = planeBasis(plane);
  const items = [];
  for (const poly of PLANE_POLYS) {
    const pts = [];
    let depth = 0;
    for (const [lx, ly, lz] of poly.pts) {
      const wx = plane.x + right.x * lx + up.x * ly + fwd.x * lz;
      const wy = plane.y + right.y * lx + up.y * ly + fwd.y * lz;
      const wz = plane.z + right.z * lx + up.z * ly + fwd.z * lz;
      const p = project(cam, wx, wy, wz);
      if (!p) break;
      pts.push(p);
      depth += p.zc;
    }
    if (pts.length === poly.pts.length) items.push({ depth: depth / pts.length, pts, color: poly.color });
  }
  items.sort((a, b) => b.depth - a.depth);
  for (const it of items) {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.moveTo(it.pts[0].sx, it.pts[0].sy);
    for (let k = 1; k < it.pts.length; k++) ctx.lineTo(it.pts[k].sx, it.pts[k].sy);
    ctx.closePath(); ctx.fill();
  }
  // Spinning prop: translucent disc at the nose.
  const propC = project(cam, plane.x + fwd.x * 4.15, plane.y + fwd.y * 4.15, plane.z + fwd.z * 4.15);
  if (propC && plane.throttle > 0.05) {
    const pr = Math.max(3, (1.25 / propC.zc) * cam.focal);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#c8c8c8';
    ctx.beginPath(); ctx.arc(propC.sx, propC.sy, pr, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = Math.max(1, pr * 0.06);
    const a = time * 30;
    ctx.beginPath();
    ctx.moveTo(propC.sx - Math.cos(a) * pr, propC.sy - Math.sin(a) * pr);
    ctx.lineTo(propC.sx + Math.cos(a) * pr, propC.sy + Math.sin(a) * pr);
    ctx.moveTo(propC.sx - Math.cos(a + 1.57) * pr, propC.sy - Math.sin(a + 1.57) * pr);
    ctx.lineTo(propC.sx + Math.cos(a + 1.57) * pr, propC.sy + Math.sin(a + 1.57) * pr);
    ctx.stroke();
    ctx.restore();
  }
  // Wingtip navigation lights: red port (left), green starboard (right).
  for (const [lx, color] of [[-5.2, '#ff4d4d'], [5.2, '#4dff88']]) {
    const wx = plane.x + right.x * lx + up.x * 0.28 + fwd.x * 0.1;
    const wy = plane.y + right.y * lx + up.y * 0.28 + fwd.y * 0.1;
    const wz = plane.z + right.z * lx + up.z * 0.28 + fwd.z * 0.1;
    const lp = project(cam, wx, wy, wz);
    if (!lp) continue;
    const lr = Math.max(2, (0.14 / lp.zc) * cam.focal);
    const glow = ctx.createRadialGradient(lp.sx, lp.sy, 0.5, lp.sx, lp.sy, lr * 4);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(lp.sx, lp.sy, lr * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lp.sx, lp.sy, lr, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Cockpit view ------------------------------------------------------------
// Instrument panel + canopy frame drawn over the forward view.
export function drawCockpit(ctx, plane, w, h, time) {
  const panelH = Math.round(h * 0.30);
  const g = ctx.createLinearGradient(0, h - panelH, 0, h);
  g.addColorStop(0, '#20242c');
  g.addColorStop(1, '#0e1116');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h - panelH * 0.55);
  ctx.quadraticCurveTo(w / 2, h - panelH, w, h - panelH * 0.55);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath(); ctx.fill();

  const cy = h - panelH * 0.42;
  const r = Math.min(52, panelH * 0.34);
  const gauges = [
    { x: w * 0.30, label: 'SPD', value: plane.speed, max: 130, unit: 'kt' },
    { x: w * 0.50, label: 'ALT', value: plane.y * 3.28, max: 900, unit: 'ft' },
    { x: w * 0.70, label: 'VSI', value: plane.verticalSpeed * 196, max: 1200, unit: 'fpm' },
  ];
  for (const gd of gauges) {
    ctx.save();
    ctx.translate(gd.x, cy);
    ctx.fillStyle = '#10131a';
    ctx.strokeStyle = '#5a6270';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Ticks.
    ctx.strokeStyle = '#8a93a3';
    ctx.lineWidth = 2;
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
      ctx.lineTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2));
      ctx.stroke();
    }
    // Needle.
    const frac = Math.max(-1, Math.min(1, gd.value / gd.max));
    const na = Math.PI * 0.75 + ((frac + 1) / 2) * Math.PI * 1.5;
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(na) * (r - 10), Math.sin(na) * (r - 10));
    ctx.stroke();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dfe6ef';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gd.label, 0, r + 18);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#9aa5b5';
    ctx.fillText(`${Math.round(gd.value)} ${gd.unit}`, 0, r + 34);
    ctx.restore();
  }

  // Prop blur arc at the top centre.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#c8c8c8';
  ctx.beginPath();
  ctx.ellipse(w / 2, -h * 0.05, w * 0.16, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Canopy frame struts.
  ctx.strokeStyle = '#14171d';
  ctx.lineWidth = Math.max(8, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(w * 0.06, h * 0.42); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w, 0); ctx.lineTo(w * 0.94, h * 0.42); ctx.stroke();
}

// --- Rain (storm) --------------------------------------------------------------
export function drawRain(ctx, w, h, time, intensity) {
  ctx.save();
  ctx.strokeStyle = 'rgba(180,200,235,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90 * intensity; i++) {
    const x = ((i * 137.5 + time * 900) % (w + 40)) - 20;
    const y = ((i * 89.3 + time * 1400) % (h + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + 22);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Main scene entry ------------------------------------------------------------
export function renderScene(ctx, state) {
  const { world, plane, mission, cameraMode, time, w, h } = state;
  const sky = mission.mission.sky;
  const cam = state.phase === 'menu'
    ? makeMenuCamera(w, h, time)
    : makeCamera(plane, cameraMode, w, h, time);
  drawSkySea(ctx, cam, sky, w, h, time);
  drawTerrain(ctx, cam, world, sky);
  drawRunway(ctx, cam, sky);
  drawRings(ctx, cam, mission.mission.rings, mission.ringIndex, time, sky);
  drawClouds(ctx, cam, world, sky, time);
  if (cameraMode === 'chase') drawPlane(ctx, cam, plane, time);
  else drawCockpit(ctx, plane, w, h, time);
  if (sky === 'storm') {
    drawRain(ctx, w, h, time, 1);
    // Lightning flash.
    if (state.lightning > 0) {
      ctx.fillStyle = `rgba(220,230,255,${state.lightning * 0.28})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
  return cam;
}
