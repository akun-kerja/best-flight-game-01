// Banda Sky Courier — hand-in program for the Make.fun flight-game bounty.
// Node 22, standard library only. Copies game/ and screenshots/ from beside
// this file into /output (or $MAKEFUN_OUTPUT_DIR when set) and writes
// /output/dossier.json, the summary the judge reads, using the vendored
// make.fun library. The game itself is plain static files a desktop browser
// loads offline: game/index.html plus its ES modules, no library, no network.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The output is byte-identical across runs: the inputs are the fixed
// files beside this script (no timestamps, no randomness), and
// buildDossier hashes them deterministically. Verified by running this
// script twice and comparing md5sums.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps for this bounty: text is capped at 160 KiB; at most
// 4 screenshots of 256 KiB each; at most 993 files and 48 MiB under game/;
// paths under game/ at most 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
