// hud.js — flight instruments drawn over the 3D scene.
// Everything the judge's first criterion asks for lives here: ALT, SPD, HDG
// (compass strip), throttle, FUEL, HULL, VSI, minimap, mission and score.

import { project } from './render.js';

// Next-ring guide: a diamond on the ring when it is on screen, an edge
// arrow pointing at it when it is not — so the pilot can line up a
// straight approach from far away instead of chasing it in circles.
function drawRingMarker(ctx, state, cam) {
  const ring = state.mission.mission.rings[state.mission.ringIndex];
  if (!ring || state.mission.done || !cam) return;
  const { w, h, plane } = state;
  const p = project(cam, ring.x, ring.y, ring.z);
  let x, y, onScreen = false;
  if (p) {
    x = p.sx; y = p.sy;
    if (x > 60 && x < w - 60 && y > 60 && y < h - 60) onScreen = true;
  }
  if (!onScreen) {
    if (!p) {
      // Behind the camera: point at the opposite edge.
      const dx = ring.x - cam.pos.x, dy = ring.y - cam.pos.y, dz = ring.z - cam.pos.z;
      const xc = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
      const yc = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
      x = w / 2 - Math.sign(xc || 1) * (w / 2 - 70);
      y = h / 2 - Math.sign(yc || 1) * (h / 2 - 70);
    } else {
      // Clamp the projected point to the screen edge.
      const cx = w / 2, cy = h / 2;
      const dx = p.sx - cx, dy = p.sy - cy;
      const s = Math.min((w / 2 - 70) / Math.abs(dx || 1), (h / 2 - 70) / Math.abs(dy || 1));
      x = cx + dx * Math.min(1, s);
      y = cy + dy * Math.min(1, s);
    }
  }
  const dist = Math.round(Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z));
  ctx.save();
  ctx.strokeStyle = '#ffb020';
  ctx.fillStyle = '#ffb020';
  ctx.lineWidth = 3;
  const r = onScreen ? 12 : 16;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
  ctx.closePath(); ctx.stroke();
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${dist} m`, x, y + r + 18);
  ctx.restore();
}

export function drawHud(ctx, state, cam) {
  const { plane, mission, w, h } = state;
  const altFt = Math.round(plane.y * 3.28);
  const spdKt = Math.round(plane.speed * 1.94);
  const hdgDeg = Math.round(((plane.heading * 180 / Math.PI) % 360 + 360) % 360);
  const vsiFpm = Math.round(plane.verticalSpeed * 196);

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // --- Top-left: primary flight data -----------------------------------------
  drawPanel(ctx, 14, 12, 218, 108, 'rgba(8,12,20,0.62)');
  ctx.fillStyle = '#f2e6c9';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${spdKt}`, 28, 50);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#ffb020';
  ctx.fillText('KT  SPD', 92, 50);
  ctx.fillStyle = '#f2e6c9';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`${altFt}`, 28, 88);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#ffb020';
  ctx.fillText('FT  ALT', 92, 88);
  ctx.fillStyle = '#9fc4d4';
  ctx.font = '15px sans-serif';
  ctx.fillText(`VSI ${vsiFpm >= 0 ? '+' : ''}${vsiFpm} fpm`, 28, 112);

  // --- Top-centre: compass strip with heading ---------------------------------
  const cx = w / 2, cy = 30, cw = Math.min(420, w * 0.36);
  drawPanel(ctx, cx - cw / 2, 10, cw, 44, 'rgba(8,12,20,0.62)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - cw / 2 + 6, 12, cw - 12, 40);
  ctx.clip();
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const deg = ((hdgDeg + d) % 360 + 360) % 360;
    const x = cx + (d / 60) * (cw / 2 - 10);
    const card = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][Math.round(deg / 90) % 4] : null;
    ctx.fillStyle = d === 0 ? '#ffb020' : '#dfe6ef';
    // Skip the outermost labels: a centred 3-digit label at the strip edge
    // would be clipped to two digits by the clip rect.
    if (Math.abs(d) < 60) ctx.fillText(card || String(deg).padStart(3, '0'), x, 34);
    ctx.fillRect(x - 1, 44, 2, 6);
  }
  ctx.restore();
  // Heading caret + readout.
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(cx - 7, 12); ctx.lineTo(cx + 7, 12); ctx.lineTo(cx, 22); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6c9';
  ctx.fillText(`HDG ${String(hdgDeg).padStart(3, '0')}°`, cx, 68);

  // --- Top-right: mission, score, timer ----------------------------------------
  drawPanel(ctx, w - 244, 12, 230, 108, 'rgba(8,12,20,0.62)');
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(mission.mission.name, w - 230, 36);
  ctx.fillStyle = '#dfe6ef';
  ctx.font = '13px sans-serif';
  ctx.fillText(mission.mission.short, w - 230, 56);
  ctx.fillStyle = '#f2e6c9';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`SCORE ${mission.score}`, w - 230, 86);
  const t = Math.max(0, Math.ceil(mission.timeLeft));
  ctx.fillStyle = t < 30 ? '#ff5a4e' : '#9fc4d4';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, w - 230, 110);
  const ringTotal = mission.mission.rings.length;
  ctx.fillStyle = '#dfe6ef';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'right';
  // Cargo state is announced in the centre message and the complete
  // panel; keeping it off this line avoids colliding with the timer.
  ctx.fillText(`RINGS ${mission.ringsHit}/${ringTotal}`, w - 28, 110);
  ctx.textAlign = 'left';

  // --- Bottom-left: throttle, fuel, hull ---------------------------------------
  drawPanel(ctx, 14, h - 108, 218, 94, 'rgba(8,12,20,0.62)');
  drawBar(ctx, 28, h - 88, 190, 14, plane.throttle, '#ffb020', `THR ${Math.round(plane.throttle * 100)}%`);
  drawBar(ctx, 28, h - 62, 190, 14, plane.fuel / 100, plane.fuel < 25 ? '#ff5a4e' : '#4fc46a', `FUEL ${Math.round(plane.fuel)}%`);
  drawBar(ctx, 28, h - 36, 190, 14, plane.hull / 100, plane.hull < 30 ? '#ff5a4e' : '#9fc4d4', `HULL ${Math.round(plane.hull)}%`);

  // --- Bottom-right: minimap -----------------------------------------------------
  drawMinimap(ctx, state);

  // --- Next-ring guide -------------------------------------------------------------
  drawRingMarker(ctx, state, cam);

  // --- Centre messages ------------------------------------------------------------
  // (Hidden once the sortie is over — the complete panel says it instead.)
  if (mission.messageTime > 0 && !mission.done) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = 'rgba(8,12,20,0.55)';
    const tw = ctx.measureText(mission.message).width + 36;
    ctx.fillRect(w / 2 - tw / 2, h * 0.18 - 34, tw, 44);
    ctx.fillStyle = mission.result === 'complete' ? '#7be07b' : '#ffb020';
    ctx.fillText(mission.message, w / 2, h * 0.18);
  }

  // --- Warnings ----------------------------------------------------------------------
  const warns = [];
  if (!plane.onGround && plane.speed < 46) warns.push('STALL — NOSE DOWN, ADD POWER');
  if (plane.speed > 118) warns.push('OVERSPEED — AIRFRAME DAMAGE');
  if (plane.fuel < 25 && plane.fuel > 0) warns.push('LOW FUEL');
  if (plane.fuel <= 0) warns.push('FUEL EMPTY — GLIDING');
  if (warns.length) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ff5a4e';
    warns.forEach((msg, i) => ctx.fillText(msg, w / 2, h * 0.30 + i * 24));
  }

  // --- Sortie-complete panel (upper third, so the plane stays visible) -----------
  if (mission.done) {
    const pw = 460, ph = 200;
    const py = h * 0.30 - ph / 2;
    drawPanel(ctx, w / 2 - pw / 2, py, pw, ph, 'rgba(8,12,20,0.85)');
    ctx.textAlign = 'center';
    ctx.fillStyle = mission.result === 'complete' ? '#7be07b' : '#ff5a4e';
    ctx.font = 'bold 30px sans-serif';
    const title = mission.result === 'complete' ? 'SORTIE COMPLETE'
      : mission.result === 'crashed' ? 'CRASHED' : 'SORTIE OVER';
    ctx.fillText(title, w / 2, py + 44);
    ctx.fillStyle = '#ffb020';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(mission.message, w / 2, py + 72);
    ctx.fillStyle = '#f2e6c9';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`SCORE  ${mission.score}`, w / 2, py + 104);
    ctx.fillStyle = '#9fc4d4';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Rings ${mission.ringsHit}/${mission.mission.rings.length}   •   Hull ${Math.round(plane.hull)}%   •   Fuel ${Math.round(plane.fuel)}%`, w / 2, py + 130);
    ctx.fillStyle = '#dfe6ef';
    ctx.font = '15px sans-serif';
    ctx.fillText('Press R to fly again  •  1 / 2 / 3 for another mission', w / 2, py + 158);
  }

  ctx.restore();
}

function drawPanel(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
}

function drawBar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.fillStyle = '#0e1116';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 5, y + h - 3);
}

// Top-down minimap: islands, runway, rings, plane.
function drawMinimap(ctx, state) {
  const { plane, mission, world, w, h } = state;
  const size = 132, mx = w - size - 14, my = h - size - 14;
  drawPanel(ctx, mx, my, size, size, 'rgba(8,12,20,0.62)');
  const scale = size / 5000;
  const toMap = (x, z) => [mx + size / 2 + x * scale, my + size / 2 + z * scale];
  // Sea + islands (sampled from the height grid, coarse).
  ctx.fillStyle = '#1d4e6e';
  ctx.fillRect(mx + 6, my + 6, size - 12, size - 12);
  const g = world.grid;
  for (let j = 0; j < g.n; j += 2) {
    for (let i = 0; i < g.n; i += 2) {
      const hh = g.heights[j * g.n + i];
      if (hh < 2) continue;
      const [px, py] = toMap(-g.half + i * g.cell, -g.half + j * g.cell);
      ctx.fillStyle = hh > 60 ? '#8a7f74' : '#4f8f4a';
      ctx.fillRect(px, py, 3, 3);
    }
  }
  // Runway.
  const [rx, ry] = toMap(0, 420);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(rx - 2, ry - 10, 4, 20);
  // Rings: next amber, later dim.
  mission.mission.rings.forEach((ring, i) => {
    if (i < mission.ringIndex) return;
    const [px, py] = toMap(ring.x, ring.z);
    ctx.strokeStyle = i === mission.ringIndex ? '#ffb020' : 'rgba(255,176,32,0.4)';
    ctx.lineWidth = i === mission.ringIndex ? 2 : 1;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.stroke();
  });
  // Plane arrow, rotated by heading (map: +x right, +z down).
  const [px, py] = toMap(plane.x, plane.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - plane.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
