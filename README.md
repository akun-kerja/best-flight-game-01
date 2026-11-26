# Banda Sky Courier

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun rank](https://make.fun/badge/best-flight-game-20261126-0057/akun-kerja/best-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun reward](https://make.fun/badge/best-flight-game-20261126-0057/akun-kerja/best-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A small original flight game for the [Make.fun "Make The Best Flight Game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057): fly a prop courier plane across a low-poly island archipelago at golden hour. Chase camera and cockpit camera, three missions with different goals, fuel and hull damage that make every sortie a decision.

## How to play

Open `game/index.html` in a desktop browser (keyboard required). No network, no build step.

| Key | Action |
| --- | --- |
| W / S | Climb / descend (pitch up / down) |
| A / D | Roll left / right (bank to turn) |
| Shift / Ctrl (or T / G) | Throttle up / down |
| C | Toggle chase / cockpit camera |
| 1 / 2 / 3 | Fly mission: Ring Run / Island Courier / Storm Run |
| R | Restart sortie |
| P | Pause |
| M | Mute |

## Missions

1. **Ring Run** — fly through 8 amber rings over the islands before the clock runs out.
2. **Island Courier** — deliver the cargo: reach the beacon island, then land on the runway. The landing is scored (touchdown speed, descent rate, centreline).
3. **Storm Run** — night flight in a storm: 5 rings, rain, lightning, then a scored landing.

Fuel drains with throttle; run dry and you glide. Speed matters: too slow and you stall, too fast and the airframe takes damage. Hard hits damage the hull — at 0% the sortie is over.

## Structure

- `game/index.html` — page, canvas, HUD shell
- `game/src/main.js` — game loop and state machine
- `game/src/flight.js` — flight physics (lift, stall, banked turns, damage)
- `game/src/terrain.js` — seeded island archipelago, runway, clouds
- `game/src/render.js` — Canvas 2D pseudo-3D renderer (projection + painter's sort)
- `game/src/hud.js` — instruments: ALT / SPD / HDG, compass, throttle, fuel, hull, minimap
- `game/src/missions.js` — mission definitions, ring and landing scoring
- `game/src/input.js` — keyboard state
- `game/src/audio.js` — synthesised WebAudio sound (no audio files)
- `game/src/shots.js` — deterministic screenshot poses via `?shot=`

## Screenshots

`?shot=cover` (chase view, ring + runway), `?shot=cockpit`, `?shot=storm`, `?shot=landing`.
