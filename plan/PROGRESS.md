# VeloWorld — progress and hand-off

Last updated: 2026-11-14

## Current phase and step

**Phase 2 — workouts in 2D: built and verified on the simulator.** Owner said (2026-11-14) to continue
through all phases without waiting; hardware checkpoints A, B and C are queued for the owner
(instructions: `spikes/CHECKPOINT_A.md`, "Checkpoint B" and "Checkpoint C" below). Next: Phase 3.

## Finished and verified

- Read all of `plan/PLAN.md`, `plan/STITCH_PROMPTS.md`, `design/*/veloworld/DESIGN.md`.
- `plan/DESIGN_INDEX.md`: every plan screen mapped to a design folder. Duplicates across
  exports E1/E2 are byte-identical; E1 recorded as canonical (newest mtime).
- Git repository initialised with `.gitignore` (`design/` excluded until the owner agrees).
- Local PostgreSQL 18 (Homebrew) already running on `localhost:5432`, so nothing to install
  and no Homebrew-vs-Docker question.
- `spikes/ble/index.html` loads in Chrome from `http://localhost:5180/ble/index.html`, secure
  context true, built-in parser self-test 8/8 PASS (IBD field walk incl. uint24 distance,
  HR with RR intervals, crank cadence across 16-bit wrap, FE-C frame bytes and checksum,
  FE-C page 0x19 decode). No console errors.

- World slice `spikes/world/`: `make-world.mjs` writes `world.json` (5 km loop, 1 km climb,
  one junction with a spur). `build.mjs` splines roads at 5 m, validates them (gradient per
  10 m against the region limit, min radius 6 m, node joins, kinks at route joints), builds the
  natural terrain from island blob, stamps and noise, conforms it to the roads (flat 9 m,
  blend to 30 m), reports cut and fill, scatters 9,000 trees and 46 houses with a seed, and
  bakes route gradient profiles. Bake takes about 0.25 s. `node --test`: 4/4 pass
  (byte-identical rebuilds, steep road fails, broken route fails, climb measures 6 %).
- World slice renders in Chrome: sky, sun and soft shadows, haze, PBR environment light,
  water, field-tinted terrain, road with markings, trees, houses, lighthouse, placeholder rider,
  spring-damped chase camera (3 modes), keyboard power with plan 6.1 physics, junction
  prompt, HUD at 4 Hz, frame-time readout. 17 draw calls, 1.40 M triangles. No console errors.

- Cyclist (`spikes/world/rider.js`): procedural road bike (real geometry: 1.0 m wheelbase,
  73° angles, spoked wheels, cranks, chainring, drops) and rider with two-bone IK legs on
  pedals turning at cadence, IK arms on the hoods, pedal-synced hip bob, helmet, glasses, kit.
  No third-party assets. Camera 4 = side view. Visible pane: 120 fps (display cap), avg 8.3 ms,
  p95 8.7 ms, 67 draw calls, 1.42 M triangles at 1450×1546. No console errors.
- Steering removed from the slice (PLAN 16.7): no junction prompt; the bike follows the road.

- World slice additions (owner feedback, 2026-11-14): scenery catalogue placed beside the road
  (lake along the north road with reeds and ducks, sheep and cows in roadside pastures, hay
  bales, dry-stone walls, post-and-rail fences, rocks, bushes, wildflower verges, boats,
  clouds, birds); realistic layered trees with wind sway and distance LOD; Grand-Tour checkpoint
  arches (start, climb start, KOM) with VeloWorld banner barriers, feather flags, road marking
  and a cheering crowd that gets livelier as you approach; coloured, sectioned HUD with HR,
  slope wedge, zone bar; always-on gradient profile strip; auto-pause/resume; HUD sizes
  (Z key); avatar options (male/female, all kit colours, via URL params for now); side camera
  fixed (offset smoothing in rider frame, render interpolation between 20 Hz steps).

### Phase 1 (verified on simulator, 2026-11-14)
- pnpm monorepo: `apps/web` (Vite 8, React 19, TS, Tailwind 4), `apps/api` (Hono + pg), `packages/shared`, `content/`.
- Design tokens from DESIGN.md in `apps/web/src/design/theme.css` (Tailwind @theme, default palette removed so
  only named tokens exist); self-hosted Inter + Barlow Condensed (@fontsource, OFL); Material Symbols compiled
  to an inline-SVG subset (Apache-2.0); primitives (Button, IconButton, Card, Label, Metric, Chip, Dot, Toggle,
  TextField, SectionHeader).
- App shell (88 px icon rail + status bar with four live sensor chips), routing, browser gate (Chrome/Edge on
  macOS, secure context) with tests, toasts.
- API: SQL migrations (001 init, 002 profile country), /health, /profile, /settings, /devices; 9 tests against
  the real Postgres test database.
- Device layer: FTMS, FE-C, HR, CSC, CPS codecs; serialized command queue (3 s timeout, 2 attempts);
  FtmsTrainer (control-point indications, "control not permitted" re-request, Flux 2 grade clamp), FecTrainer,
  SimulatedTrainer (ERG lag, stall below 40 rpm, grade-dependent effort, zero power when stopped);
  DeviceManager (five slots, crank-sensor priority with 5 s fallback, reconnect backoff 1/2/4/8 s with
  re-sent target, auto-reconnect via getDevices when the Chrome flag is on); telemetry bus outside React.
  34 web unit tests.
- Screens: first-run wizard (profile, country, avatar quick editor, FTP or "schedule ramp test", HR, Coggan
  zones, quick-connect), Sensors (live values at 4 Hz via refs, five slots, active trainer + calibrate, demo
  trainer with controls, Bluetooth status, checklist naming the Edge 550 and HRM straps), Settings (Profile with
  full avatar editor, Units, Trainer, HUD incl. size and profile strip, About with attributions), Home (honest:
  quick-start modes marked with their phase).
- Browser check at 1440×900: wizard completed end to end with the demo trainer; profile saved to Postgres;
  Sensors shows live watts/speed/cadence from the simulator. No console errors besides the expected 404 for
  "no profile yet".

### Phase 2 (verified on simulator, 2026-11-14)
- Shared: workout model + deterministic timeline (`flatten/targetAt`), stress estimate, star rule; ride metrics
  (NP, IF, TSS, kJ, zones, best efforts, FTP from ramp / 20 min); own FIT activity encoder (verified by decoding
  with the independent MIT `fit-file-parser` in tests: records, lap, session sport cycling / virtual_activity,
  timestamps, CRC); physics `stepSpeed/steadySpeed`. 18 shared tests.
- Ride engine core (`apps/web/src/engine/core.ts`), run by a Web Worker at 20 Hz: ERG target 1 s early, ramps once
  per second, 3 s countdowns, cues, bias 70–130 %, skip, extend, ERG off = slope mode, slope and HR targets,
  stall release <40 rpm with 3 s ramp back, gear hint, auto-pause/resume in every mode, stars, ramp-test end
  detection, Start Power, Start Slope (pulled forward from Phase 3: only needs gradient control). 11 integration
  tests drive whole workouts against the simulated trainer at 60x speed.
- RideController: telemetry → worker, commands → trainer, OPFS write-ahead log every second, API batches every
  5 s (retried; API outage shows a "saving locally" note), wake lock, save (<1 min discarded), discard, crash
  recovery dialog (Resume ride / Save and finish / Discard) — verified live: a crashed ride was offered back.
- API: migration 003 (workout, ride, ride_sample, best_effort), idempotent sample batches, finish → summary,
  /rides/recording, FIT download. Migration 004 + Strava module (see below). 19 API tests.
- Content: 42 built-in workouts incl. 4 FTP tests, 3 four-week plans (`content/workouts/build.mjs` → JSON).
- Import ZWO / ERG / MRC, export ZWO (round-trip test).
- Screens: Workouts library (Power control, Slope control, categories, filters, search, block-graph cards, import),
  Workout detail, Ride (Broadcast and Focus presets, step list, always-on profile strip, banners, slide-in menu,
  pause overlay, HUD size, keys), Summary (stats, chart, zones, best efforts, FIT export, FTP-test apply, Strava
  button), Activities (AG Grid, lazy-loaded), Settings → Connections (Strava).
- Browser at 1440×900: Sweet Spot 4x10 ridden on the demo trainer, Tab skip worked, saved, summary showed
  avg 152 W / NP 167 / IF 0.84, FIT downloaded (valid header), ride listed in Activities.
- Bug found and fixed in the browser: React StrictMode started two rides (two workers) → stuck "Paused" banner.
  RideController.start is now guarded.

### Checkpoint C (owner) — numbered steps
1. Strava (optional, before riding): create a personal API app at https://www.strava.com/settings/api with
   Authorization Callback Domain `localhost`. Put Client ID / Secret in `apps/api/.env`, and
   `TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)`. Restart `pnpm dev`. Settings → Connections → Connect with Strava.
2. Pair the Flux 2 (Sensors). Workouts → pick e.g. "Sweet Spot 4x10" (58 min) → Start in ERG.
3. Ride it. Check power settles on each target within a few seconds, the countdown appears before each step,
   and stopping pedalling pauses the ride (resume by pedalling).
4. Halfway, reload the browser tab once. The "Unfinished ride found" dialog should offer Resume — use it.
5. At the end, Save ride. On the summary click Export FIT, then import that file at
   https://connect.garmin.com (Import Data). Click "Upload to Strava" if connected.
6. Report: did ERG hold, did resume after reload keep the data, did Garmin Connect and Strava accept the file.

### Checkpoint B (owner, when back) — numbered steps
1. `cd myfitbike && pnpm install && pnpm dev` (starts API on :8787 and web on :5173).
2. Open http://localhost:5173 in Chrome. Complete the welcome screen with your real details.
3. Go to Sensors. Click Search on the trainer tile, pick the Flux 2. Pedal: watts, speed, cadence must move.
4. Search the cadence sensor and the HRM. Cadence should switch to "Crank sensor"; heart rate shows.
5. Unplug the trainer for 10 s and plug it back in. A "disconnected — reconnecting" toast, then
   "reconnected" within ~15 s, and values resume.
6. Report: did all values show, did reconnect work, anything red.

## Finished but not verified

- **60 fps budget:** the only valid in-pane measurement was about 107 fps (avg 9.3 ms,
  p95 16.7 ms) at 2048×1536 on first load. Later readings were taken while the browser pane
  was hidden (throttled), so they are invalid. The owner confirms on the riding monitor at
  checkpoint A.
- Visual style: needs the owner's yes or no (checkpoint A).
- **Triangle budget at checkpoints:** 1.75 M triangles in view at a checkpoint (budget 1.5 M);
  open road is 1.2–1.4 M. Fix in Phase 4: crowd only built/drawn near a checkpoint, tighter
  near-tree LOD radius on lower presets.

- BLE spike against real hardware (self-test now 9/9 incl. resistance-size case) (needs the owner — checkpoint A). The self-tests encode
  my reading of the specs; they become real fixtures only once captured frames exist.

## Next

1. Wait for checkpoint A results (frame log, protocol, resistance, fps, style yes/no).
2. Turn captured frames into codec fixtures; resolve any VERIFY fallout.
3. Phase 1: pnpm monorepo (apps/web, apps/api, packages/shared, content), Tailwind tokens from
   DESIGN.md, self-hosted fonts, shell, API + migrations on the local Postgres 18, devices
   with simulator, Sensors screen, first-run wizard.

## VERIFY log

| Item | Status | Source | Result |
|---|---|---|---|
| FE-C over BLE UUIDs, direction, framing (5.2, 5.4) | CONFIRMED (framing: ANT spec D00000652; UUIDs/direction: secondary, Auuki + pycycling, Tacx doc gated) | developer.garmin.com/tacx-trainer/overview; ANT-UserGuide.pdf | fec2 notify, fec3 write; A4 len 4E/4F ch, XOR checksum. **Flux 2 on firmware >= 5.0.0 has NO FE-C over BLE** — FTMS is the only control path on current firmware. Plan already has FTMS first; FE-C stays as fallback for old firmware |
| FE-C page layouts 0x10/0x19/0x30/0x31/0x33/0x37 | UNVERIFIABLE vs primary (thisisant login-gated); matches Auuki and pycycling | github.com/dvmarinoff/Auuki src/ant/fec.js | Spike encodes these layouts |
| FTMS Indoor Bike Data, Control Point, Feature, Machine Status, Power Range (5.3) | CONFIRMED with one correction | FTMS v1.0; GATT Spec Supplement 2026-09-09 §3.139 | **Resistance level (bit5) is uint8 in the current GSS, sint16 in old XML**: parser picks size by frame length (self-test added). Opcode 0x04 payload uint8 0.1 as plan says |
| CSC 0x2A5B, HR 0x2A37 incl. RR (5.8) | CONFIRMED | GSS §3.71, §3.126 | as plan |
| `getDevices()` reconnect after reload without a click (risk table) | **CONTRADICTED** | chromestatus 4797798639730688 (dev trial, behind flag, target M169); Chromium content_features.cc | Off by default in stable Chrome. After a tab reload the rider must click once to reconnect. Owner decision needed (see questions) |
| Garmin FIT JS SDK encoder (D12) | CONFIRMED capability; **licence is NOT permissive** | npm @garmin/fitsdk 21.221.0; github.com/garmin/fit-javascript-sdk | Encoder writes activity files. Licence: Garmin FIT Protocol License Agreement (proprietary). Owner decision needed (see questions) |
| Flux 2 limits and FTMS control (5.7) | CONFIRMED | garmin.com/en-US/p/690887; Garmin developer matrix | 2000 W max, 16 % max incline, FTMS control supported. Read target-setting bits 3 (ERG) and 13 (SIM) at runtime |
| Strava API (8.1) | CONFIRMED with two refinements | developers.strava.com docs/authentication, docs/uploads, docs/rate-limits, reference, guidelines; strava.com/legal/api (2026 agreement) | activity:write scope; localhost callback allowed; tokens 6 h; refresh may rotate the refresh token (stored every time). **Disconnect uses the new `oauth/revoke` (Basic auth)** — legacy deauthorize ends 2027-06-01. Uploads send `sport_type=VirtualRide` plus FIT sub_sport virtual_activity (docs do not promise the mapping). New apps: 1 athlete (single player) — fine for personal use. Official "Connect with Strava" button asset not yet added (text button for now; owner can drop the asset in) |
| CC0 model / texture licences (7.0) | not started — Phase 0c/4 | | |
| epix Gen 2 HR broadcast over Bluetooth; HRM 200 / HRM 600 connection limits (5.8) | not started — Phase 1 | | |

## Owner answers (2026-11-14) — recorded in PLAN.md section 16

1. Velora and the ten regions: yes, with freedom to change/add/remove.
2. Kit: epix Gen 2 watch, Edge 550, HRM 200, HRM 600.
3. Profile values entered by the user in first run.
4. `design/` committed.
5. Open source → own FIT encoder (no Garmin FIT SDK); permissive licences only.
6. Reconnect: automatic via `getDevices()` when the Chrome flag is on, else one-click banner.
7. Ride simulator: no steering, no junction prompt; bike turns by itself.

## Open questions for the owner

- Checkpoint A, B and C hardware results still outstanding (see steps in this file and `spikes/CHECKPOINT_A.md`).
- Strava credentials (only when you want uploads): steps in Checkpoint C.
- Project licence for the open-source release (suggest MIT). Not blocking.

## Deviations from the plan / issues found

- **Token budget (global rule 6):** 4,000 per task / 30,000 per session cannot fit this
  project. Working instead in sessions scoped to one phase or sub-phase, stopping at clean
  checkpoints, with this file as the hand-off.
- **Keys conflict resolved by the owner:** no steering at all (PLAN 16.7).
- **World data model extensions (spike only):** `regions[].maxGradePct` (needed for step-3
  validation) and `town { center, radius }` (scatter zone). Propose keeping both in the real
  model in Phase 3.
- **Spike textures and models are generated in code** (no third-party assets yet), so there is
  nothing to attribute so far. three.js (MIT) is the only dependency.
- **Pairing slots (5.8 vs 10.2 vs 10.5 F):** 5.8 says five slots incl. greyed Speed; 10.5 F
  (latest) says four tiles. Follow the E3 `veloworld_sensors` design for layout and keep the
  Speed slot as a greyed, collapsed row with the direct-drive note (behaviour from 5.8).
- **Reconnect after tab reload (success criterion 4):** Web Bluetooth may require a user
  click to reconnect after a reload unless `getDevices()` is enabled. Recording survives the
  reload regardless (OPFS write-ahead log); only reconnect may need one click. Pending VERIFY.
