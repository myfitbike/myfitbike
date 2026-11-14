# VeloWorld — progress and hand-off

Last updated: 2026-11-14

## Current phase and step

**Phase 0 — risk spikes.** 0a + 0d (Bluetooth spike) built. 0b + 0c (world slice) in progress.
Next stop: **owner checkpoint A**.

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

## Finished but not verified

- BLE spike against real hardware (needs the owner — checkpoint A). The self-tests encode
  my reading of the specs; they become real fixtures only once captured frames exist.

## Next

1. World slice spike `spikes/world/` (0b, then 0c look check, frame-time readout).
2. Owner checkpoint A instructions.
3. Phase 1 after checkpoint A passes.

## VERIFY log

| Item | Status | Source | Result |
|---|---|---|---|
| FE-C over BLE UUIDs and frame layout (5.2, 5.4) | in progress | — | — |
| FTMS field layouts / opcodes (5.3) | in progress | — | — |
| `getDevices()` reconnect without gesture (risk table) | in progress | — | — |
| Garmin FIT JS SDK encoder (D12) | in progress | — | — |
| Flux 2 FTMS control, limits (5.7) | in progress | — | — |
| Strava API (8.1) | not started — Phase 2 | | |
| CC0 model / texture licences (7.0) | not started — Phase 0c/4 | | |
| Garmin watch HR broadcast per model (5.8) | needs owner's watch model | | |

## Open questions for the owner

1. Is the world name "Velora" and the ten-region list final?
2. Which Garmin heart-rate strap model, and which Garmin watch, if any?
3. Your weight and FTP for profile defaults (otherwise first run asks)?
4. May the `design/` folder (40 MB) be committed to git?
5. Key conflict (see deviations): OK to make arrow keys pick junction direction only while a
   junction prompt is showing?

## Deviations from the plan / issues found

- **Token budget (global rule 6):** 4,000 per task / 30,000 per session cannot fit this
  project. Working instead in sessions scoped to one phase or sub-phase, stopping at clean
  checkpoints, with this file as the hand-off.
- **Keys conflict (10.3 vs 7.0):** arrows mean "bias or slope" in the HUD but "choose
  direction" at free-ride junctions. Proposed smallest fix: while a junction prompt is
  visible (150 m before a junction), left/right choose direction and down means U-turn;
  otherwise arrows keep their HUD meaning.
- **Pairing slots (5.8 vs 10.2 vs 10.5 F):** 5.8 says five slots incl. greyed Speed; 10.5 F
  (latest) says four tiles. Follow the E3 `veloworld_sensors` design for layout and keep the
  Speed slot as a greyed, collapsed row with the direct-drive note (behaviour from 5.8).
- **Reconnect after tab reload (success criterion 4):** Web Bluetooth may require a user
  click to reconnect after a reload unless `getDevices()` is enabled. Recording survives the
  reload regardless (OPFS write-ahead log); only reconnect may need one click. Pending VERIFY.
