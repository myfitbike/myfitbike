# VeloWorld — progress and hand-off

Last updated: 2026-11-14

## Current phase and step

**Phase 0 — risk spikes, all four spikes built. STOPPED at owner checkpoint A.**
Owner instructions: `spikes/CHECKPOINT_A.md`.

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

## Finished but not verified

- **60 fps budget:** the only valid in-pane measurement was about 107 fps (avg 9.3 ms,
  p95 16.7 ms) at 2048×1536 on first load. Later readings were taken while the browser pane
  was hidden (throttled), so they are invalid. The owner confirms on the riding monitor at
  checkpoint A.
- Visual style: needs the owner's yes or no (checkpoint A).

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
| Strava API (8.1) | not started — Phase 2 | | |
| CC0 model / texture licences (7.0) | not started — Phase 0c/4 | | |
| Garmin watch HR broadcast per model (5.8) | needs owner's watch model | | |

## Open questions for the owner

1. Is the world name "Velora" and the ten-region list final?
2. Which Garmin heart-rate strap model, and which Garmin watch, if any?
3. Your weight and FTP for profile defaults (otherwise first run asks)?
4. May the `design/` folder (40 MB) be committed to git?
5. **FIT encoder licence:** Garmin's FIT JS SDK is under Garmin's own proprietary FIT
   Protocol License, not CC0/MIT. Options: (a) accept it — free to use, widely used, but not
   open-source; (b) I write a small FIT activity encoder from the public FIT protocol
   description (more work in Phase 2, about 300 lines plus round-trip tests). Recommendation: (a)
   unless you plan to publish the code under an open licence.
6. **Reconnect after reload:** stable Chrome cannot reconnect to a sensor after a tab reload
   without one click (`getDevices()` is still behind a flag). Smallest change to success
   criterion 4: recorded data still survives the reload; reconnecting takes one click on a
   "Reconnect devices" banner. Alternatively you enable
   chrome://flags/#enable-web-bluetooth-new-permissions-backend and the app reconnects by itself.
7. Key conflict (see deviations): OK to make arrow keys pick junction direction only while a
   junction prompt is showing?

## Deviations from the plan / issues found

- **Token budget (global rule 6):** 4,000 per task / 30,000 per session cannot fit this
  project. Working instead in sessions scoped to one phase or sub-phase, stopping at clean
  checkpoints, with this file as the hand-off.
- **Keys conflict (10.3 vs 7.0):** arrows mean "bias or slope" in the HUD but "choose
  direction" at free-ride junctions. Proposed smallest fix: while a junction prompt is
  visible (150 m before a junction), left/right choose direction and down means U-turn;
  otherwise arrows keep their HUD meaning.
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
