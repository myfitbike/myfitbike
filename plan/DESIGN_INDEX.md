# Design index — plan screens → Stitch design folders

Written 2026-11-14. Maps every screen in `plan/PLAN.md` (sections 10.2, 10.3, 10.5, 7.0) to its
design in `design/`. Visuals follow the designs; behaviour follows the plan.

Export folder shorthand (folder names contain spaces; quote paths):

| Key | Folder |
|---|---|
| E1 | `design/stitch_veloworld_cycling_design_system/` |
| E2 | `design/stitch_veloworld_cycling_design_system 2/` |
| E3 | `design/stitch_veloworld_cycling_design_system 3/` |

`veloworld/DESIGN.md` (the design system) is byte-identical in all three exports
(md5 80dcb4f6…). Its tokens replace the hex values in plan 10.1 where they differ.

## Duplicates

Three screens appear in both E1 and E2. Both `code.html` and `screen.png` are
**byte-identical** in each pair (same md5 and size), so there is no difference to choose
between. E1's copies are the most recently modified (08:18:48 vs 08:18:34), so E1 is
recorded as canonical.

| Screen | Canonical | Also in |
|---|---|---|
| Workout on route | E1 `veloworld_in_ride_workout_on_route` | E2 (identical) |
| Stage profile (full-screen 2D) | E1 `veloworld_in_ride_stage_profile_view` | E2 (identical) |
| Map navigation (full-screen 2D) | E1 `veloworld_in_ride_map_navigation_view` | E2 (identical) |

## Screen map

| Plan screen | Plan ref | Design folder | Phase | Notes |
|---|---|---|---|---|
| Design system / component sheet | 10.1 | E3 `veloworld_component_sheet` + `veloworld/DESIGN.md` | 1 | Source for primitives (buttons, pods, toggles, inputs, zone bar, profile strip) |
| App shell: left rail + top status bar | 10.5 E | E3 `veloworld_home_dashboard` (shell part) | 1 | Rail: Home, Routes, Workouts, Training, Activity, Search, Settings. Status bar: profile, level/XP, weekly goal, four sensor chips |
| Home | 10.2 #1, 10.5 E | E3 `veloworld_home_dashboard` | 1 (shell) / 2–5 (content) | Hero cards, quick-start tiles (Just Ride, Start Power, Start Slope), route rows, Velora teaser, weekly summary. Route cards show real places (Stelvio, Formentor, Ventoux) — replace with Velora routes |
| Pairing / Sensors | 10.2 #2, 10.5 F, 5.8 | E3 `veloworld_sensors` | 1 | Live value row, device tiles, Demo trainer, checklist |
| First-run wizard | 10.4 | E3 `veloworld_welcome_setup` | 1 | Stepper: browser check → profile → pairing → guided spin |
| Routes browser (Routes tab) | 10.2 #3, 10.5 G | E3 `veloworld_routes_browser` | 3 | Card grid with mini profile |
| Collections | 10.5 G | E3 `veloworld_collections` | 5 | |
| Route detail | 10.5 G | E3 `veloworld_route_detail_solace_summit` | 3 | Map pins, filled profile, Start, Select a section, Download, Favourite, past activities tab |
| Workout library | 10.2 #4, 10.5 H | E2 `veloworld_workouts_library` | 2 | |
| Workout detail | 10.2 #4 | E2 `veloworld_workout_detail_sweet_spot_3x12` | 2 | |
| Workout builder | 10.2 #5 | E2 `veloworld_workout_builder` | 5 | |
| Training Room | 10.5 H | E2 `veloworld_training_room` | 5 | Tabs: Challenges, Tests, Training plans |
| Ride HUD — Broadcast preset (default) | 10.5 A | E2 `veloworld_in_ride_broadcast_hud` | 2 | |
| Ride HUD — Broadcast, climb-start variant | 10.3 climb card | E2 `veloworld_in_ride_broadcast_hud_climb_start_variant` | 3 | Climb card 300 m before categorised climb |
| Ride HUD — Cockpit preset | 10.5 A | E2 `veloworld_in_ride_hud_cockpit_layout` | 3 | Includes minimap and on-the-road list |
| Ride HUD — Focus preset | 10.5 A | E2 `veloworld_in_ride_hud_focus_workout_layout` | 2 | |
| Workout on route | 6.4, 10.5 B | E1 `veloworld_in_ride_workout_on_route` | 3 | See duplicates |
| Stage profile (full-screen 2D) | 7.5 | E1 `veloworld_in_ride_stage_profile_view` | 3 | See duplicates. Also used for pure workouts (power profile) in Phase 2 |
| Map view (full-screen 2D) | 7.5 | E1 `veloworld_in_ride_map_navigation_view` | 3 | Illustrated Velora map, not MapLibre |
| Ride menu (slide-in) | 10.5 D | E1 `veloworld_in_ride_menu_drawer` | 2 | |
| Pause overlay | 10.2 #7 | E1 `veloworld_in_ride_paused_overlay` | 2 | |
| Ride summary | 10.2 #8 | E1 `veloworld_ride_summary` | 2 | Add Strava upload state, FIT export |
| Activities / history | 10.2 #9 | E1 `veloworld_activities_ride_log` | 2 (list) / 5 (analytics) | Ride list uses AG Grid |
| Settings — Trainer and Graphics | 10.2 #10 | E1 `veloworld_settings_trainer_graphics` | 1–4 | Graphics: no "world mode" / Google key (7.7 not built) |
| Settings — HUD customiser | 10.5 J | E1 `veloworld_settings_hud_customizer` | 5 | Preset picker, slot dropdowns, live preview |

## Plan screens with no design (to design in the same system)

Built from DESIGN.md tokens and the component sheet. Each will get a short visual note in
this file when built.

| Screen | Plan ref | Phase | Approach |
|---|---|---|---|
| Unsupported-browser blocking notice | D1 | 1 | Full-screen Layer-3 modal on the canvas gradient: logo, one line, "Open in Chrome or Edge on macOS" |
| World screen (World tab) | 10.5 G, 7.0 | 5 | Full-bleed illustrated map generated from `world.json` (SVG); region labels, route lines, landmark icons; side glass panel listing routes in the hovered region. E3 `stylized_fantasy_…_velora…` is a painted placeholder only — the real map is generated by the world build |
| HUD banners: interval countdown, cue text, trainer disconnected, gear hint ("shift to an easier gear"), auto-pause | 10.3 | 2 | Top-centre Layer-2 pill; severity colour from status tokens (danger for disconnect, warning for gear hint) |
| Junction prompt (free ride) | 7.0 riding rules | 3 | Bottom-centre glass pod with three arrow chips, active choice amber |
| Crash-recovery dialog ("Resume ride" / "Save and finish") | 6.5 | 2 | Layer-3 modal |
| Workout import dialog (ZWO / ERG / MRC / FIT) | 10.2 #4 | 2 / 6 | Layer-3 modal with drop zone |
| Settings — Profile, Units, Audio, Data and connections (Strava, intervals.icu), About and attributions | 10.2 #10, 8.1 | 1–6 | Same layout as E1 settings screens (tab list left, glass form panels right) |
| Downloads manager | 10.5 J | 5 | Settings tab; AG Grid of region packs with size and delete |
| Achievements, weekly goals | 10.5 I, J | 5 | Glass cards with progress rings |
| FTP test result | 6.4 | 2 | Summary variant with FTP old → new and "apply" button |
| World editor (dev only) | 7.0 | 3 | Utilitarian: top-down canvas, right inspector panel, bottom elevation strip with gradient colouring. Not rider-facing; minimal polish |
| Stage profile "next 2 km" close-up zoom | 7.5 | 3 | Variant of the E1 stage profile with per-100 m gradient labels |
| Select-a-section handles on route profile | 10.5 G | 5 | Amber drag handles on the route-detail profile |

## Placeholder imagery (must not ship)

| Folder | What it is | Replacement |
|---|---|---|
| E2 `cinematic_3d_video_game_cycling_simulation_viewpoint_third_person_perspective` | Ride-screen backdrop | Live three.js canvas |
| E3 `cinematic_epic_alpine_mountain_road_…`, `dramatic_scenic_mountain_road_pass_in_dolomites_…`, `epic_seaside_cliff_highway_coastal_road_in_mallorca_…`, `french_alps_mont_ventoux_moonscape_…` | Hero / card photos of real places | Renders of Velora from the app's own world build (Phase 4+); illustrated/gradient placeholders before that |
| E3 `stylized_fantasy_cyclotourism_illustrated_island_map_called_velora_…` | Painted map concept | Map generated from `world.json` |
| Photos and names inside `code.html` (e.g. "Julian Vance", KICKR / Spider PM device names, real pass names) | Placeholder data | Real profile, device and route data |

## Fonts

Barlow Condensed (italic, live numbers) and Inter — both SIL Open Font License 1.1.
Self-hosted under `apps/web/public/fonts/`, recorded in `content/ATTRIBUTIONS.md`.
