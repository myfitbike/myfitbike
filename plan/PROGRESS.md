# MyFitBike — progress and hand-off

Last updated: 2026-11-14

## Current phase and step

**Phases 0–6 built (simulator), including the optional real-road mode (owner said yes, 2026-11-14).**
Phase 7 is out of scope. Hardware checkpoints A–G are queued for the owner (instructions:
`spikes/CHECKPOINT_A.md` and "Checkpoint B–G" below).

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
  arches (start, climb start, KOM) with MyFitBike banner barriers, feather flags, road marking
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

### Phase 3 (verified on simulator, 2026-11-14)
- `packages/world`: world types, centripetal/uniform Catmull-Rom road splines at 5 m, validation (gradient per 10 m
  vs region limit, radius ≥ 6 m, node joins, smooth through-roads ≤ 15°, junction turns ≤ 135°, segment ranges),
  route profiles (concatenated, laps, gradient per 10 m), climb detection + Cat 4…HC scoring, gradient look-ahead,
  difficulty labels, terrain height function, illustrated map SVG (depth bands, coast, regions, lakes, towns,
  roads, landmarks, labels). 10 tests.
- Velora regions 1–3 authored (`content/world/velora/author.mjs` → `world.json`): Harbour Spin (8.0 km, flat),
  Lagoon Lap (22.7 km, flat, Lagoon Sprint), Downs Rollers (20.8 km, +240 m, two Cat 4 climbs: Greenfold Ramp,
  Stone Circle). Validator caught and I fixed kinks at bends and under-scored climbs while authoring.
- Engine route mode: true-gradient physics, 1 s look-ahead SIM with difficulty scaling, ≥0.2 % / ≤1 Hz throttle,
  laps, point-to-point finish, pacers (W/kg on the same physics), ghosts (best + last ride), altitude/grade in
  records. 8 route tests incl. climbing speed within 3 % of a hand calculation (250 W, 88 kg, 6 % → 15.3 km/h).
- API: migration 005 segment_effort (computed on save from the route profile, laps included), segment PB and
  30/90-day bests, ghost endpoint, rides per route, dev-only world save endpoint. 20 API tests.
- Screens: Routes browser (generated map crops, mini profiles, est. time at 75 % FTP), Route detail (map pins,
  stage profile, climbs, segments with PBs, past rides, ghost/pacer/workout-on-route options), ride route mode
  (stage profile strip with climb banners and pins, next-2-km close-up with per-100 m gradients, on-the-road
  list, climb card, segment timer vs PB, Cockpit preset with minimap + splits, V cycles full-screen stage
  profile / map, M toggles minimap), Home "Just Ride", world editor v1 at /dev/world (dev builds only).
- Browser: Downs Rollers ridden with pacer; crash → resume of a route ride worked; full-screen views verified.
- Not done in Phase 3 (moved): the 2-minute guided spin of plan 10.4 — added as a Phase 5 first-run item.

### Owner feedback fixes (2026-11-14)
- **Routes pages took 2–3 s to open.** Cause: every illustrated map re-traced Velora's coastline (~0.5 s per map,
  13 maps on Routes). Coastline bands are now traced once per world in one pass, and road samples are cached:
  Routes map work ~6 s → ~0.35 s, SVG output byte-identical (checked against the old code). No skeleton needed.
  Still slow after that: the real culprit was the route cards' estimated time — `steadySpeed` simulated 20 000 steps
  (1000 s) per 100 m piece, ~1.1 s for 12 routes, on every render. Now solved directly by bisection (matches the
  simulation within 0.01 m/s on 135 cases, test added). Home → Routes now has no main-thread task over 50 ms
  (was one 2.2 s task); card times unchanged.
- **Online radio (PLAN 16.24).** `apps/api/src/radio.ts` (DNS SRV server discovery with failover, User-Agent, 10 min
  cache, search/tags/countries/click), `apps/web/src/radio/*` (one shared player, hls.js lazy for HLS, Media Session),
  Settings → Radio, ride menu + HUD mute. Checked live: jazz + United Kingdom search; MP3 station played (2.0 s of
  audio in 2 s), BBC Radio 6 Music (HLS) played natively in Chrome; favourites saved; ride menu play, HUD mute, stops on
  leaving the ride. Not checked: the hls.js fallback path in a browser without native HLS; https deployment (http-only
  streams would be blocked there — would need a stream proxy).
- **Tablet and phone friendly (PLAN 16.23).** Checked with a script on 19 screens at 375 px and 16 at 768 px: nothing
  wider than the screen (AG Grid scrolls inside itself). Phone: bottom tab bar, compact top bar, settings tabs scroll
  sideways. Ride at 375 px: compact HUD + touch bar (pause, easier/harder, ERG, skip, view, camera) — tapped in the
  app: bias 1.00 → 1.01, pause overlay fits. Browser gate replaced by Bluetooth feature detection + banner (6 tests).
  Phone ride HUD slimmed after owner feedback: touch buttons in a column on the right edge; one-row power panel
  (power, speed, HR, cadence, distance) + thin zone bar + short profile strip; landscape (height ≤ 500 px) puts
  them side by side. Checked at 375×812 and 740×360.
  Not checked: a real tablet/phone (only Chrome's device emulation), touch bar on wide touch screens (emulation
  only gives touch below 768 px), iPad Safari. Devices on the LAN can't reach the dev server yet (needs HTTPS).
- **Renamed to MyFitBike (PLAN 16.22).** UI, page title, arches/banners/barriers, ZWO author, Strava name template
  (migration 008 updates the old default) and upload ids, `@myfitbike/*` packages, databases renamed in place
  (`ALTER DATABASE … RENAME`, data kept) and `apps/api/.env` URLs updated. Left as is: design export folders and
  file-name references to them, `plan/STITCH_PROMPTS.md`, `plan/OPUS_PROMPT.md`, `plan/DESIGN_INDEX.md`, applied
  migrations, browser storage keys (`vw.*`), the island name Velora.
- **Ride first, profile later (PLAN 16.21).** No blocking wizard: first launch creates a default profile and opens
  Home with a "Finish your profile" card; FTP is asked only before the first ERG workout; "est." labels in HUD and
  summary; wizard is optional "Guided setup" with "Skip for now". Fixed: an unreachable API used to look like
  "no profile" and opened setup (finishing it would have overwritten the real profile) — now a retrying
  "Reconnecting to the local API…" screen. Checked in the app: Home card, FTP question → estimate → trainer step,
  HUD "est. FTP", API stopped → reconnect screen → API started → Home by itself, card save restores the profile;
  still one profile row. Not checked: a truly empty database (would need deleting the dev profile and its rides) —
  covered by an API test that the default profile is accepted. Known gap: the summary's "estimated" note reflects
  the current profile, not the profile at ride time.
- **Imperial units.** Settings → Units and the first-run wizard offer Metric (km, kg) / Imperial (mi, lb).
  Display only: storage, physics, ride files, Strava and FIT stay metric (migration 007 widens the check). Converted:
  ride HUD (speed, distance, remaining, elevation), climb card, segment/pacer gaps (ft → mi), stage profile flags
  and climb banners, splits per mile, routes/route detail/home/real roads cards, summary, activities grid,
  sensors speed, workouts load, profile weight inputs (typed in lb, saved in kg). Tests: shared units (3),
  api units (1). Checked in the app: Alpe d'Huez reads 8.6 mi / 3504 ft; HUD 10.5 mph, 2354 ft, 8.58 mi to go.

### Phase 6b — optional real-road mode (built 2026-11-14, first cut)
- **Import** (Routes → Real roads tab): GPX (track preferred over route points), TCX, FIT course/activity
  (record message lat/long semicircles, enhanced_altitude). Plan 7.2 reject rules: < 20 points, < 500 m,
  > 300 km; gaps > 500 m warn. A half-finished import is deleted, never left behind.
- **Preparation** (`packages/world/src/realRoad.ts`, Web Worker `apps/web/src/realroad/realRoadWorker.ts`):
  equirectangular projection about the route centre, 5 m resample, elevation from Mapterhorn z13 tiles
  (AWS Terrain Tiles fallback; GPS elevation only where no tile), 50 m smoothing, ±25 % clamp. The result is a
  one-road `World` (20 m control points, climbs as segments), so the existing route profile, engine (SIM
  gradient + look-ahead), stage profile, climb card, ghosts, segment PBs and arches work unchanged.
- **Bake** (plan 7.3) with the existing `bakeWorld`, now taking a height function (elevation tiles), a far-grid
  step (≤ ~1000² cells) and a tree line (2100 m for real roads). Written to OPFS `real-<id>/` in the Velora file
  layout; the renderer reads it through a fetcher. A route ridden on another device re-bakes on first ride.
- **Stored** in Postgres (migration 006 `real_route`, `/api/real-routes`); server rebuilds the profile from the
  stored world for ghosts and segment efforts.
- **Look**: real altitudes for rock (from 1700 m) and snow (from 2600 m); base biome by latitude; water plane
  below the lowest road point (polders are not flooded). Velora's look is unchanged.
- **Checked in the app** with an Alpe d'Huez GPX (road geometry from the public OSRM demo, test only, not
  committed): 13.83 km, 1068 m gain, 717 → 1776 m, one HC climb (real climb: 13.8 km, ~1070 m), 9 tiles, 0 failed,
  import + bake ~12 s cold / 1.3 s warm, 42 chunks. Rode it on the demo trainer: 3D valley, arches, HC banner,
  map views, attribution line.
- **Deviation (smoothing):** plan says a 50 m window. Through hairpins the track packs the turn's height gain into
  its apex (Alpe d'Huez read 21 % over 100 m; real max ~13 %). Elevation tile zoom 13/14/15 made no difference.
  The window now widens to 200 m around tight turns (> 90° within ±40 m or > 135° within ±100 m): max 100 m
  gradient 15.9 %, total climb kept. One spot (km 10.9) still reads ~16 % — likely the routing geometry; noted.
- **Not built yet (plan 7.1/7.3/7.5/7.6/7.8):** OSM scenery from OpenFreeMap vector tiles (buildings, water,
  forest polygons — trees and pastures are procedural for now), MapLibre basemap for the route map (maps show the
  route on plain land), Sentinel-2 ground drape, World Tour catalogue, riding before the bake finishes (whole
  route bakes first — fine at ~12 s for 14 km; 100 km+ untested), per-region attribution lines in the UI.
- Tests: world 18 (6 new: parsing, reject rules, projection, resample, spike clamp, hairpin smoothing, one-road
  world + bake), web 62 (FIT course), api 23 (store/list/delete/ghost lookup).

### Checkpoint G (owner) — real roads
1. Export a route you know as GPX/TCX/FIT (Garmin Connect course, a route planner, or a past outdoor ride).
2. Routes → Real roads → Import. Report: distance and climbing vs what you know, any warning shown, bake time.
3. Ride it on the Flux 2: do the climbs feel like the real road? Any sudden gradient jumps (note the km)?
4. Say whether you want the next real-road pieces (OSM buildings/water/forest, MapLibre map, World Tour list).

### Phase 6 (built 2026-11-14)
- **FIT workout import** (`packages/shared/src/fitWorkout.ts`, own decoder, no Garmin SDK): file_id, workout and
  workout_step messages; time steps (ms), power targets (custom watts offset by 1000, or %FTP/zones 1–7),
  open/free steps, repeat steps (duration_type 6, repeat_until_steps_cmplt) folded into repeat blocks; header
  and file CRC checked. Workouts → Import now accepts .fit with .zwo/.erg/.mrc. 4 tests.
- **Power pedals + PowerMatch** (`apps/web/src/devices/powerMatch.ts`): when a power meter is connected and
  fresh it becomes the displayed/recorded power source; ERG targets are corrected by a slow offset
  (≤1 W/s, clamped ±60 W, only learns above 30 W on both) so pedal power meets the target. Sensors → Power
  slot has "Search for pedals". 3 tests.
- **intervals.icu sync** (`apps/api/src/intervals.ts`, Settings → Connections card): the rider pastes the API
  key once; the server stores it AES-256-GCM encrypted (same TOKEN_ENCRYPTION_KEY as Strava) and never sends it
  to the browser. "Sync planned workouts" fetches WORKOUT events for today + 14 days and converts workout_doc
  steps (steady, ramp, repeats, free ride, cadence, text cues; %FTP or watts) into library workouts
  (`intervals-<eventId>`, re-sync updates in place; non-ride events skipped). 1 API test with mocked fetch.
- Fixed in passing: Settings sidebar links were relative, so from a sub-tab they went to
  `/settings/profile/connections` (blank page). Now absolute.
- Tests: web 61, api 22, shared 22, world 11 — all pass; typecheck clean.

### Checkpoint F (owner) — numbered steps
1. Power pedals (if you have them): Sensors → Power → Search for pedals. Ride an ERG workout for 10 min and
   compare pedal power with the target; after ~1 min they should agree within a few watts.
2. FIT import: export a structured workout as .fit (Garmin Connect workout → send to device, or any planner),
   Workouts → Import → pick it; check the graph matches.
3. intervals.icu: put TOKEN_ENCRYPTION_KEY in `apps/api/.env` if not done (`openssl rand -hex 32`), restart
   `pnpm dev`, Settings → Connections → paste your API key (intervals.icu → Settings → Developer settings) →
   Sync planned workouts. Report whether the planned workouts look right.

### Phase 5 (built 2026-11-14)
- Velora regions 4–10 added (all ten regions, 28 edges, 12 routes incl. Three Peaks and Grand Tour);
  per-region scenery packs, biome looks and landmarks; gradient measured along the road.
- Progression: XP (1/min + 10/star), levels (100·n^1.5), badges, streaks, weekly goal ring in the shell.
- Training Room with plans; real Home dashboard; analytics on Activities (weekly load, calendar, records,
  FTP history); Routes World/Routes/Collections tabs; select-a-section rides; segment efforts.
- Workout builder (export ZWO), HUD layout editor, audio cues (WebAudio), downloads manager + offline
  service worker (production builds), 2-minute guided spin in first run.

### Phase 4 (built 2026-11-14; look and fps need the owner — checkpoint E)
- Bake (`pnpm --filter @myfitbike/world bake`): validates world.json (fails on errors), conforms terrain to roads,
  163 streamable 500 m chunks at 6.25 m along road corridors + 100 m far mesh (sunk under chunks), ~23.8k
  trees, pastures with sheep/cows, walls, fences, bales, rocks, bushes, wildflower verges, reeds/ducks, 225
  houses in Port Anchor, boats, 9 checkpoints with crowds. 6.2 MB in `apps/web/public/world/velora/` (budget
  15 MB/region). Deterministic from the seed.
- Renderer (`apps/web/src/world/VeloraRenderer.ts`, lazy-loaded three.js): sky + PMREM environment + haze, sun
  with soft shadow following the rider, water, biome-coloured terrain, road ribbons with markings, houses,
  landmarks (striped lighthouse, 6 turning wind turbines, stone circle), scenery with distance LOD and far-cull,
  checkpoints with varied crowds only drawn near them, road graffiti with the rider's name and country flag,
  rider from the profile avatar, translucent ghost/pacer riders, cameras 1–6 (spring-damped offset in the
  rider frame), quality presets, dynamic resolution (18 ms/2 s down, 12 ms up), WebGL context loss → 2D.
- Ride screen: 3D behind the HUD for route rides; V cycles 3D → stage profile → map; F frame stats.
  Settings → Graphics (quality, default camera).
- Bundle: initial JS 157 KB gzip (budget 250 KB); renderer 149 KB and AG Grid 338 KB are lazy.
- Measured in the app pane: 105–201 draw calls, 1.64 M triangles at the start arch with the crowd (budget 1.5 M —
  over by ~10 % at checkpoints only; open road lower), frames ~17 ms when the pane is not throttled. The pane
  throttles requestAnimationFrame to ~2 s gaps while tools run, so fps numbers from it are not trustworthy —
  checkpoint E must confirm 60 fps on the owner's Mac.
- Tech debt (deviation): rider.js, scenery.js, checkpoints.js, graffiti.js were moved from the spike as
  JavaScript (allowJs, not type-checked). Convert to TypeScript when touched next.
- 2-hour soak / memory-growth test not run yet (needs a long unattended run in a visible browser).

### Checkpoint E (owner) — numbered steps
1. `pnpm dev`, open http://localhost:5173 in Chrome, full screen on your riding monitor.
2. Routes → Harbour Spin → Start (try "Race my ghost" after one ride). Press F for the frame readout.
3. Ride all three routes for a few minutes each; try cameras 1–6 and Settings → Graphics presets.
4. Report: fps / frame time at your monitor resolution on High, any stutter at chunk boundaries, and a yes/no
   on the look (plus what looks wrong).

### Checkpoint D (owner) — numbered steps
1. Routes → Lagoon Lap → Start (with "Race my ghost" off the first time). Ride at least 5 km.
2. Routes → Downs Rollers → Start. Ride the Greenfold Ramp: the trainer should get harder about 1 s before the
   climb starts on the profile, and ease off over the top. Try H/V/M keys.
3. Report: do the gradients feel like what the profile shows? Too hard/easy → note it (Settings → Trainer →
   difficulty scales it).

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

1. Owner: hardware checkpoints A–F (steps above and in `spikes/CHECKPOINT_A.md`).
2. Turn captured BLE frames into codec fixtures; resolve any VERIFY fallout.
3. Real roads, next pieces (after checkpoint G): OSM scenery from OpenFreeMap, MapLibre map, World Tour list. Phase 7 is out of scope.
4. Tech debt: convert the JS world ports (rider/scenery/checkpoints/graffiti) to TypeScript; triangle budget
   at checkpoints; 2-hour soak test.

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
| intervals.icu API (Phase 6) | CONFIRMED | intervals.icu OpenAPI (intervals.icu/api/v1/docs) + developer forum "API access to Intervals.icu" | Basic auth user `API_KEY`, password = key; athlete id `0` = key owner; `GET /api/v1/athlete/{id}/events?oldest&newest&category=WORKOUT`; `workout_doc.steps[]` with duration (s), power {value or start/end, units %ftp/w}, ramp, reps + nested steps, freeride, cadence, text. Browser CORS allowed but we call server-side to keep the key off the client |
| FIT workout file (Phase 6) | CONFIRMED | FIT SDK Profile.xlsx (public download, Messages: workout, workout_step) | duration_time in ms; target_value 0 + custom_target_power_low/high with watts offset +1000, else %FTP; target_value 1–7 = power zone; duration_type 6 = repeat_until_steps_cmplt (duration_value = from step, target_value = repeat count). Decoder written from the profile, no SDK code |
| Mapterhorn terrain tiles (7.1) | CONFIRMED | mapterhorn.com, mapterhorn.com/data-access, tiles.mapterhorn.com/tilejson.json | `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, Terrarium, 512 px, CORS `*` (checked); attribution "© Mapterhorn" → mapterhorn.com/attribution. No published rate limit; max zoom not stated (z17 answered). WebP losslessness not stated — smoothing makes it moot |
| AWS Terrain Tiles fallback (7.1) | CONFIRMED | registry.opendata.aws/terrain-tiles; tilezen/joerd docs formats.md, attribution.md | Terrarium PNG 256 px at `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (checked 200 + CORS `*` on GET); decode `R*256 + G + B/256 − 32768`; per-source attribution |
| FIT course / record positions | CONFIRMED | FIT SDK Profile.xlsx (record 20: position_lat/long sint32 semicircles, altitude uint16 and enhanced_altitude uint32 scale 5 offset 500; course 31 field 5 name; file_id type 6 = course) | as implemented |
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
