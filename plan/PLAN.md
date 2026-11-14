# Solo Indoor Cycling App for Tacx Flux 2 — Implementation Plan

Status: PLAN ONLY, nothing implemented. Written 2026-11-14 for a later implementation pass.
Working name: **MyFitBike** (rename freely).

How to read this: sections 1–3 fix scope and decisions, 4–9 are the technical design, 10 is the
UX spec, 11 is the phased build order with acceptance gates, 12–14 cover testing, risks and
open questions. Anything marked **VERIFY** was not confirmed during research and must be
checked in Phase 0 before code depends on it.

---

## 1. Goal and scope

A web app, run first on a Mac, that pairs with a Garmin Tacx Flux 2 over Bluetooth, controls
its resistance, and gives a Zwift/Rouvy/Tacx-class riding experience for one rider.

In scope
- Pair trainer plus optional heart-rate strap; live power, cadence, speed, HR.
- Trainer control: ERG (target power), SIM (road gradient), manual resistance/slope.
- Structured workouts: built-in library, import, builder, FTP tests.
- Route rides in our own imaginary 3D world with every kind of terrain (section 7.0), with a
  2D map and a Tour-de-France-style stage profile showing the rider (and ghost/pacer)
  moving along the terrain.
- About 30 named routes over one shared road network, from flat spins to an alpine climb.
- Later and optional (Phase 6): riding real roads from an imported GPS track.
- Full HUD, settings, ride history, FIT export.

Out of scope for now
- Multiplayer, live opponents, chat, events, racing. Solo only. The only "other riders" are
  ghosts of your own past rides and constant-power pacers.
- Mobile/tablet layouts, Safari, Firefox.
- Virtual shifting, steering, ANT+.

Success criteria for the whole project
1. From cold start to pedalling a previously prepared route in under 10 seconds.
2. Ride view holds 60 fps at 1440p on an Apple Silicon Mac at the default quality preset.
3. Gradient changes on screen are felt at the pedals within about 1 second.
4. A 2-hour ride survives a Bluetooth drop, a network outage and a tab reload without
   losing recorded data.
5. Exported FIT file uploads cleanly to Strava and Garmin Connect.

---

## 2. What the reference apps do (research summary)

Research was done from product pages, support docs and reviews, not from hands-on use.
On 2026-11-14 the owner supplied 20 real screenshots of Rouvy, Tacx and Zwift, saved in
`plan/reference/` (index in section 10.5). Section 10.5 records what they show and what
changed in this plan because of them. Use them for layout patterns and information
hierarchy only: our colours, typography, logos, names and artwork must be original.

| App | Modes | Ride view | HUD notes |
|---|---|---|---|
| Zwift | Free ride, structured workouts (ERG), training plans, routes in fictional worlds, FTP tests | Fully 3D game world | Large centre power number; power tile with 5 fields, 4 configurable; minimap with route profile underneath; rider list on the right; workout block list on the left with star per completed block; level/XP bar; 2026 added a customizable workout HUD |
| Rouvy | Route rides, workouts on top of a route, pacing partners, route creator | Real video with 3D riders overlaid ("AR") | Widgets can be toggled and resized; route profile; gear indicator; cleaner ride screen in recent redesign |
| Tacx Training | Films (video), GPS rides shown as 3D map with gradient, structured workouts by slope / power / FTP, opponents | Video or 3D map | Simple data bar plus profile; workouts sync from Garmin Connect |

What we take from each
- Zwift: HUD information hierarchy, workout block list, game-feel progression.
- Rouvy: ride any real road, workout-on-route, customizable widgets, pacers.
- Tacx: GPS track to 3D ride with real gradient, slope-based workouts.

Open-source prior art to read for protocol details (do not copy code without checking license):
Auuki / Flux by dvmarinoff (AGPL-3.0, Web Bluetooth FTMS + Tacx FE-C over BLE),
GlobeRide (Cesium + FTMS SIM/ERG + GPX), bfree (Next.js + Web Bluetooth),
h4l/zwift-workout-file-reference (ZWO tag reference).

---

## 3. Key decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Browser | Chrome or Edge on macOS only | Web Bluetooth does not exist in Safari or Firefox. Show a blocking "use Chrome" page elsewhere |
| D2 | Frontend | Vite + React + TypeScript + Tailwind | House default stack |
| D3 | 3D engine | three.js directly (no react-three-fiber in the hot path) | Full control of the frame loop; React must never re-render per frame |
| D4 | World | **Final, 2026-11-14: our own imaginary world, "Velora" (section 7.0).** Authored as data, generated and baked at build time, shipped with the app. The following earlier decision now applies only to the optional real-road mode in Phase 6: the world is generated from open elevation and OpenStreetMap data and pre-baked per route. The owner wanted photoreal but declined a Google Cloud account with a payment card, and no other free photoreal world exists (section 7.7). The stylized world is therefore pushed as far toward realism as free data allows (section 7.8) | Free, no accounts or keys, cacheable, works offline mid-ride. Keep the world behind a `WorldProvider` interface so a photoreal provider can be added later without touching the ride engine |
| D5 | 2D map | Illustrated world map generated from the world data (SVG plus canvas). MapLibre GL JS with OpenFreeMap tiles only for the Phase 6 real-road mode | Own world has no real geography to show |
| D6 | Trainer protocol | FTMS first, Tacx FE-C-over-BLE as fallback, Cycling Power as read-only last resort | FTMS is the standard; Flux 2 firmware support must be confirmed in Phase 0 |
| D7 | Backend | Small local Node API (Hono) | Needed for Postgres, Strava OAuth secret, and server-side route baking helpers |
| D8 | Database | PostgreSQL only | House rule. Browser storage (OPFS / Cache Storage) is used only as an asset cache and a crash-recovery buffer, never as the system of record. See conflict note below |
| D9 | State | Zustand store for UI state; a plain mutable "telemetry bus" outside React for per-sample data | Keeps HUD updates cheap |
| D10 | Speed model | Our own physics from power, not the trainer's reported speed | Trainer speed reflects flywheel speed and gearing, which is meaningless on a virtual hill |
| D11 | Ride clock | Runs in a Web Worker | Main-thread timers are throttled when the tab is hidden |
| D12 | Activity file | FIT via Garmin's official JavaScript FIT SDK, TCX as fallback | **VERIFY** the JS SDK encoder covers activity files |

Conflict surfaced (Rule 7): "PostgreSQL only" versus "must not lose a ride when the network or
API is down". Resolution chosen: Postgres stays the only database. The browser keeps an
append-only sample log in an OPFS file during a ride and replays it to the API on reconnect.
That file is a write-ahead buffer, deleted once the server acknowledges the ride.
**Confirmed by the owner on 2026-11-14: local server plus PostgreSQL.**

---

## 4. Architecture

```
Browser (Chrome)
├── UI layer            React + Tailwind      screens, HUD widgets, settings
├── Ride engine         Web Worker            clock, physics, workout player, recorder
├── Device layer        main thread           Web Bluetooth, protocol codecs, command queue
├── World renderer      three.js on canvas    terrain, road, avatar, sky, cameras
├── 2D views            MapLibre + canvas     map, stage profile, workout graph
└── Local caches        OPFS / Cache Storage  baked route bundles, sample write-ahead log

Local API (Node + Hono)
├── /profile /rides /routes /workouts         CRUD against Postgres
├── /bake                                     optional server-side route baking
└── /oauth/strava                             token exchange, upload

PostgreSQL                                    system of record
```

Rules that keep it fast
1. Three loops, never mixed:
   - Render loop: requestAnimationFrame, reads interpolated state, draws. No allocation.
   - Simulation loop: worker, fixed 20 Hz step, owns position, speed, workout state.
   - Device loop: event driven by Bluetooth notifications; outgoing commands at 1 Hz at most.
2. React renders only on coarse events (screen change, widget config, 1 Hz and 4 Hz HUD ticks).
3. Worker posts one compact state snapshot per step; the renderer interpolates between the
   last two snapshots so motion is smooth at any frame rate.
4. Everything heavy (GPX parsing, mesh building, FIT encoding) happens in workers.

Repository layout
```
apps/web/src/
  app/            routing, shell, providers
  screens/        home, pair, routes, workouts, ride, summary, history, settings
  hud/            widgets, layout engine
  devices/        ble/, ftms/, fec/, cps/, hrs/, simulator/, DeviceManager.ts
  engine/         worker entry, clock, physics, workoutPlayer, routeFollower, recorder
  world/          renderer, terrain, road, scenery, avatar, cameras, bake/
  views2d/        StageProfile, RouteMap, WorkoutGraph
  formats/        gpx, tcx, fit, zwo, erg-mrc
  design/         tokens, primitives
apps/api/src/     routes, db, bake, strava
packages/shared/  types shared by web and api
content/          built-in workouts (JSON), World Tour catalogue
plan/             this file
```

---

## 5. Device layer

### 5.1 Web Bluetooth rules
- `requestDevice` only works from a click. Pairing screen has explicit "Search" buttons.
- Every service must be listed in `optionalServices` at request time or it is unreadable later.
- Only one app can be connected to the trainer over Bluetooth. Pairing screen must tell the
  user to close Tacx Training, Zwift, Rouvy and Garmin apps, and to disconnect any Edge/watch
  that is controlling the trainer (this causes "another device overrules" reports).
- GATT allows one operation at a time. All writes go through a single serialized queue with
  per-command timeout (3 s) and retry (2 attempts).
- Reconnect: keep the `BluetoothDevice` object; on `gattserverdisconnected` call
  `device.gatt.connect()` with backoff 1, 2, 4, 8 s. After reconnect: re-subscribe, request
  control again, re-send the current target. Ride auto-pauses after 5 s without data.
- Web Bluetooth needs a secure context: `localhost` in development, HTTPS when hosted.

### 5.2 Services and characteristics
| Purpose | Service | Characteristic | Use |
|---|---|---|---|
| Fitness Machine (FTMS) | 0x1826 | 0x2ACC Feature (read) | capability bits |
| | | 0x2AD2 Indoor Bike Data (notify) | speed, cadence, power |
| | | 0x2AD6 Supported Resistance Range, 0x2AD8 Supported Power Range (read) | clamp targets |
| | | 0x2AD9 Control Point (write + indicate) | commands |
| | | 0x2ADA Machine Status (notify) | target changed, control lost, reset |
| Tacx FE-C over BLE | 6e40fec1-b5a3-f393-e0a9-e50e24dcca9e | ...fec2 (notify), ...fec3 (write) **VERIFY** | ANT+ FE-C pages wrapped in BLE |
| Cycling Power | 0x1818 | 0x2A63 Measurement (notify) | power, crank revs for cadence |
| Heart Rate | 0x180D | 0x2A37 (notify) | bpm |
| Device Info, Battery | 0x180A, 0x180F | | display only |

### 5.3 FTMS details
Indoor Bike Data: little-endian, 16-bit flags then fields in flag order.
- bit0 = 0 means instantaneous speed present (uint16, 0.01 km/h)
- bit1 average speed, bit2 cadence (uint16, 0.5 rpm), bit3 average cadence
- bit4 total distance (uint24 m), bit5 resistance level (sint16)
- bit6 instantaneous power (sint16 W), bit7 average power
- bit8 energy (uint16, uint16, uint8), bit9 heart rate (uint8), bit10 MET, bit11 elapsed, bit12 remaining
The parser must walk every flagged field in order even if unused, or offsets drift.

Control Point opcodes
| Op | Meaning | Payload |
|---|---|---|
| 0x00 | Request control | none. Must succeed before anything else |
| 0x01 | Reset | none |
| 0x04 | Set target resistance level | uint8, 0.1 units |
| 0x05 | Set target power (ERG) | sint16 W |
| 0x07 | Start / resume | none |
| 0x08 | Stop / pause | uint8: 1 stop, 2 pause |
| 0x11 | Set indoor bike simulation | wind sint16 (0.001 m/s), grade sint16 (0.01 %), Crr uint8 (0.0001), CwA uint8 (0.01 kg/m) |
| 0x13 | Spin-down control | uint8: 1 start, 2 ignore |
Each write is answered by an indication `0x80, opcode, result` where result 1 = success,
2 = not supported, 3 = invalid parameter, 4 = failed, 5 = control not permitted. The queue
resolves a command only on its indication. On result 5, re-request control once then retry.

### 5.4 FE-C over BLE fallback
Messages are ANT frames: `A4 09 4F 05 <8-byte page> <xor checksum>`.
Pages: 0x30 basic resistance, 0x31 target power (0.25 W units), 0x33 track resistance
(grade in 0.01 % with -200 % offset, Crr in 5e-5 units), 0x37 user configuration (weights).
Incoming: 0x10 general data (speed), 0x19 trainer data (power, cadence).
**VERIFY** every byte against Garmin's Tacx developer documentation before coding.

### 5.5 Abstraction
```ts
interface Trainer {
  readonly caps: { erg: boolean; sim: boolean; resistance: boolean; spinDown: boolean;
                   powerRange: [number, number]; maxGradePct: number };
  onSample(cb: (s: { t: number; powerW: number; cadenceRpm?: number; speedKph?: number }) => void): void;
  setTargetPower(w: number): Promise<void>;
  setSimulation(p: { gradePct: number; crr: number; cwa: number; windMs: number }): Promise<void>;
  setResistance(pct: number): Promise<void>;
  startSpinDown?(): Promise<void>;
  disconnect(): Promise<void>;
}
```
Implementations: `FtmsTrainer`, `FecTrainer`, `PowerOnlyTrainer` (no control),
`SimulatedTrainer`. `DeviceManager` picks the best one from the services found.

### 5.6 Simulated trainer (required, build first)
A fake `Trainer` driven by keyboard (up/down = power, left/right = cadence) or a scripted
power profile. It responds to ERG and gradient like a real one, including lag. All development,
automated tests and demos run on it, so the app can be built and verified without the bike.

### 5.7 Flux 2 specifics
- Limits: about 2000 W max, 16 % max simulated incline, no powered downhill. Clamp gradient
  sent to [-10 %, 16 %]; show the true gradient on the HUD regardless.
- ERG has a power floor that rises with flywheel speed. If actual power stays more than 15 %
  above target for 10 s, show "shift to an easier gear".
- If cadence drops below 40 rpm in ERG for 3 s, release the target to avoid the stall spiral,
  then ramp back over 3 s when cadence recovers.
- Calibration: offer spin-down through FTMS if the feature bit is set; otherwise link to the
  Tacx utility app.

### 5.8 Garmin ecosystem (owner's kit and what the app does with it)
Owner has: Tacx Flux 2, a Garmin HRM chest strap with Bluetooth, and Garmin speed and
cadence sensors on the bike. Items marked VERIFY come from general knowledge, not from
documents read during research.

| Garmin product | Bluetooth profile | Use in the app |
|---|---|---|
| HRM straps (HRM-Dual, HRM-Pro / Pro Plus, HRM-Fit, HRM 200, HRM 600) | Heart Rate 0x180D | Heart rate. Also read the beat-to-beat intervals in the same message and store them, for heart-rate variability later. Straps allow only 2 to 3 Bluetooth connections (HRM-Pro Plus: 3), so a phone app holding one can block pairing: say so on the pairing screen |
| Cadence Sensor 2 (crank) | Cycling Speed and Cadence 0x1816, measurement 0x2A5B | **Preferred cadence source.** The Flux 2 only estimates cadence from pedalling pulses; a crank sensor is more accurate, especially at low power. Cadence = change in crank revolutions over change in event time (1/1024 s units, 16-bit wrap) |
| Speed Sensor 2 (hub) | same service, wheel revolutions | **Not useful on the Flux 2**: it is a direct-drive trainer, the rear wheel is removed and the front wheel does not turn. Pairing is allowed but the value is ignored; virtual speed always comes from the physics model. Explain this in the pairing screen so it does not look like a fault |
| Rally / Vector power pedals | Cycling Power 0x1818 | Optional power source instead of the trainer's own power ("power match": ERG target is corrected by the difference between pedal and trainer power, slowly, at most 1 W per second). Phase 6 |
| Garmin watches | Heart Rate 0x180D when "broadcast heart rate" is on | Alternative heart-rate source. Many models broadcast over ANT+ only; newer ones also over Bluetooth. **VERIFY** per model |
| Edge bike computers | ANT+ FE-C controller | Not used. An Edge paired to the trainer as a controller will fight the app for control; the pairing checklist says to remove the trainer from the Edge's sensors during rides |
| Garmin Connect | no personal upload API | Export FIT and import it on the Garmin Connect website. The developer upload API is for approved businesses. **VERIFY** whether imported third-party rides count toward Training Status. Also import Garmin Connect workouts exported as FIT workout files |
| Tacx Utility app | | Firmware updates and calibration; link to it from Settings → Trainer |
| Index scale, Varia radar and lights, inReach, NEO motion plates, Tacx mat / desk / sweat cover | none usable | No integration. Weight is typed into the profile |

Design consequences
- Pairing screen has five slots: Controllable trainer, Power source, Cadence, Heart rate,
  Speed (optional, greyed with the direct-drive note).
- Source priority per metric, configurable: power = trainer (or pedals if paired);
  cadence = crank sensor, then pedals, then trainer; heart rate = strap, then watch.
- If the preferred source stops sending for 5 s, fall back to the next and show a toast.
- All of these are standard Bluetooth profiles, so non-Garmin sensors work too.
- `optionalServices` at pairing must include 0x1826, 0x1818, 0x1816, 0x180D, 0x180A,
  0x180F and the Tacx FE-C service.

---

## 6. Ride engine

### 6.1 Physics (free ride and route modes)
Per 50 ms step, with rider power P from the trainer:
```
F_gravity = m * g * sin(atan(grade))
F_rolling = m * g * cos(atan(grade)) * Crr
F_aero    = 0.5 * rho * CdA * (v + wind)^2
a         = (P * eff / max(v, 0.5) - F_gravity - F_rolling - F_aero) / m
v         = max(0, v + a * dt);   distance += v * dt
```
Defaults: m = rider + bike weight from profile, Crr 0.004, CdA 0.32, eff 0.975,
rho from route altitude. Downhill speed capped at 90 km/h. Power input is the raw sample
(no smoothing) so the model stays honest; only the displayed number is smoothed.

### 6.2 Gradient control
- Source of truth is the smoothed route profile (section 7.2), never the 3D mesh.
- Look ahead: send the gradient at `position + v * 1.0 s` so the trainer's response time lines
  up with what is on screen.
- Send only when the value changes by 0.2 % or more, at most once per second.
- "Trainer difficulty" 0–100 % scales the gradient sent (default 100 % uphill, 50 % downhill).
  Speed is always computed from the true gradient.

### 6.3 Workout player
Internal model (all formats convert to this):
```ts
type Step =
  | { kind: 'steady'; durS: number; target: Target; cadence?: number; text?: Cue[] }
  | { kind: 'ramp';   durS: number; from: Target; to: Target; cadence?: number; text?: Cue[] }
  | { kind: 'free';   durS: number; text?: Cue[] }
  | { kind: 'repeat'; times: number; steps: Step[] };
type Target = { type: 'ftpPct' | 'watts' | 'slopePct' | 'hrPct'; value: number };
```
- Player flattens to a timeline at load; elapsed time maps to a target deterministically.
- ERG target sent at step boundaries; ramps send a new value each second.
- Start each interval with a 3 s countdown beep and send the target 1 s early.
- Controls: pause, skip step, extend step, bias plus or minus 1 % per press (range 70–130 %),
  ERG on/off toggle (off = slope mode so the rider controls power with gears).
- Slope-target steps use simulation mode; heart-rate targets use a slow controller that nudges
  ERG power by 5 W every 15 s.
- Compliance: a step earns its star if average power is within 5 % of target.

### 6.4 Training modes (the full list)
| Mode | Control | View |
|---|---|---|
| Free ride | manual slope or resistance, plus and minus keys | default loop route, 3D |
| Route ride | SIM from route gradient | 3D, 2D map, stage profile |
| Structured workout | ERG / slope / HR per step | workout graph, optionally over a route |
| Workout on route | ERG for effort, route only for scenery and distance | 3D plus workout panel |
| FTP ramp test | ERG steps of 20 W per minute to failure; FTP = 75 % of best 1-minute power | workout graph |
| FTP 20-minute test | free power for 20 min; FTP = 95 % of average | workout graph |
| Climb challenge | SIM on a single climb with summit countdown | stage profile emphasised |
| Pacer ride | SIM, with a constant-watts-per-kg pacer on the road | 3D plus gap widget |
| Ghost ride | SIM against your own best previous ride of the same route | 3D plus gap widget |
| Recovery / endurance timer | ERG at fixed percent of FTP for a set time | minimal HUD |
| Video ride (Phase 7) | SIM from GPX, video playback rate tied to speed | local video file |

Built-in workout library (authored by us as JSON, about 40 to start): recovery, endurance
(Z2 60/90/120 min), tempo, sweet spot (2x20, 3x15, 4x10), threshold (2x20, 3x12, over-unders),
VO2max (5x5, 6x4, 30/30s, 40/20s), anaerobic (Tabata, 10x1 min), sprints, cadence drills,
single-leg drills, pyramid, climbing simulations (slope targets), openers, both FTP tests.
Three starter plans (4-week base, build, FTP booster) as ordered lists of those workouts.

### 6.5 Recording
- One record per second: time, power, cadence, HR, speed, distance, lat, lon, altitude,
  gradient, target power, step index.
- Written three places: memory, OPFS append log (every second), API batch (every 5 s).
- Auto-pause when power is 0 and speed below 1 km/h for 3 s (routes only, never in workouts).
- Derived on finish: normalized power, intensity factor, training stress, work in kJ,
  time in zones, best efforts for 5 s / 1 / 5 / 20 / 60 min, elevation gain.
- On app start, if an unacknowledged OPFS log exists, offer "Resume ride" or "Save and finish".

---

## 7. World and graphics

**Direction change, 2026-11-14 (owner): build our own imaginary world, the way Zwift does,
with every kind of terrain.** Section 7.0 is now the primary design. Sections 7.4 (renderer)
and 7.5 (2D views) apply to it unchanged. Sections 7.1 to 7.3, 7.6 and 7.8 describe riding
real roads from map data; that is now a later, optional mode (Phase 6) and must not be
built before the own world is finished. Section 7.7 stays not-built.

### 7.0 Our own world: "Velora" (working name)

References: `plan/reference/22.webp`, `23.webp` (a fictional island map with many terrains)
and `24.webp` (minimap in the HUD). They show the *idea* only. Velora must be original: its
own coastline, place names, road layout, routes, landmarks and map artwork. Do not trace,
rename or re-create any part of another game's world.

**Why this is better for us**
- No map servers, keys, licences or network during a ride: the world ships with the app.
- Roads are designed for riding first, so gradients are smooth and deliberate, and the
  trainer feels exactly what the screen shows.
- One world means the art can be polished once and looks good everywhere.
- Performance is predictable because we control every chunk.

**Design principle: roads first, terrain second.** Each road is a 3D spline whose elevation
profile is designed on purpose (see the region table). Terrain is then generated and cut or
filled to meet the roads. Routes are just ordered lists of road sections over one shared
network, so new routes cost nothing to add.

**World size (version 1):** one main island about 24 km by 16 km plus two small islands,
about 140 km of road, 10 regions, about 30 routes. Built region by region.

**Regions** (names and numbers are design targets, to be tuned in the editor)
| # | Region | Terrain and mood | Riding character | Signature landmark |
|---|---|---|---|---|
| 1 | Port Anchor | Harbour town, seafront promenade, hub and start pier | Flat, 0 to 2 %; the default start | Striped lighthouse |
| 2 | Saltmarsh Flats | Tidal lagoon, causeways, reed beds | Pan-flat 12 km loop, two sprint segments, crosswind option | Row of wind turbines |
| 3 | Greenfold Downs | Rolling farmland, hedgerows, orchards | Punchy hills 400 m to 1.5 km at 3 to 8 % | Hilltop stone circle |
| 4 | Stonebridge | Walled old town on a hill | Cobbled ramps 300 to 800 m at 9 to 14 %, a town circuit | Clock tower and arched bridge |
| 5 | Tealeaf Terraces | Terraced tea hills, mist, waterfalls | Steady climb 7 km at 5 %, sweeping descent | Hillside tea estate |
| 6 | Emberfall Canyon | Red desert, mesas, slot canyon | Long false flats, mesa climb 5 km at 6 %, one gravel sector | Natural rock arch |
| 7 | Whisperwood | Giant-tree rainforest, ferns, river gorge | Twisting, constantly undulating, shaded | Canopy footbridge overhead |
| 8 | Mount Solace | Alpine valley to snow summit | The big one: 13.5 km at 7.8 %, 18 hairpins, max 12 % | Summit observatory |
| 9 | Glasswater Fjord | Steep-sided fjord, tunnels, cold light | Shore road, 6 km at 6 % to a viewpoint, 2 tunnels | Suspension bridge |
| 10 | Cinder Isle | Volcanic island by causeway, black sand, steam vents | Crater-rim loop, 4 km at 5 % climb | Crater lake |
Every region connects to at least two others so loops of any length can be composed.

**Routes (examples; distance and ascent are computed from the network, never typed in)**
| Route | Regions | Target | Purpose |
|---|---|---|---|
| Harbour Spin | 1 | 6 km, flat | Warm-up, recovery, first ride |
| Lagoon Lap | 1, 2 | 15 km, flat | Sprints, steady endurance |
| Downs Rollers | 1, 3 | 22 km, about 300 m | Tempo with punchy hills |
| Cobble Crown | 3, 4 | 12 km, about 250 m | Short steep efforts |
| Tea Trail | 3, 5 | 28 km, about 500 m | Steady climbing |
| Red Mesa | 6 | 35 km, about 450 m | Long sustained riding |
| Forest Ribbon | 7 | 18 km, about 280 m | Rolling, technical feel |
| Solace Summit | 8 | 13.5 km, about 1,050 m | Climb challenge |
| Fjord Run | 9 | 24 km, about 420 m | Mixed |
| Cinder Rim | 1, 10 | 20 km, about 300 m | Medium climb with a view |
| Three Peaks | 5, 8, 9 | 85 km, about 2,100 m | Big day |
| Grand Tour of Velora | all | about 130 km | The epic |
Each route can be ridden forward or reversed. Each has sprint and climb segments with
arches and personal-best timing (section 10.5 B, C).

**World data model** (`content/world/velora/`)
```ts
type World = {
  seed: number; size: [number, number];                 // metres
  islands: Blob[];                                      // coastline as smooth unions of blobs
  heightStamps: Stamp[];                                // mountain, ridge, plateau, canyon, crater
  regions: { id: string; name: string; biome: Biome; polygon: Vec2[] }[];
  nodes: { id: string; pos: Vec3 }[];                   // junctions
  edges: { id: string; from: string; to: string;        // road sections
           points: Vec3[];                              // spline control points with elevation
           surface: 'asphalt' | 'cobble' | 'gravel' | 'boardwalk';
           width: number; structure?: 'bridge' | 'tunnel' | 'causeway' }[];
  routes: { id: string; name: string; edges: { id: string; reverse: boolean }[]; loop: boolean }[];
  segments: { id: string; kind: 'sprint' | 'climb'; edge: string; from: number; to: number }[];
  landmarks: { id: string; kind: string; pos: Vec3; rot: number }[];
};
```
This file is the single source of truth for gradients, maps, routes and the 3D bake.

**Build pipeline** (Node script, deterministic from the seed, run at build time)
1. Coastline from the island blobs; sea depth bands for the map.
2. Base height: height stamps plus layered noise whose roughness depends on the region.
3. Validate roads: gradient per 10 m within each region's limits, no kinks at junctions,
   minimum hairpin radius 6 m, loops close exactly. Fail the build on any violation.
4. Conform terrain to roads: cut and fill within 30 m of the road; embankments; a tunnel
   where the cut would exceed 15 m; a bridge where the fill would exceed 12 m or over water.
5. Erosion pass away from roads for natural valleys and ridges.
6. Biome painting and scatter rules per region: ground materials, trees, rocks, crops,
   buildings, fences, street furniture. All placement is seeded so it never changes
   between builds.
7. Chunk and compress exactly as in 7.3 (500 m chunks, near and far detail), one pack per
   region. Port Anchor ships with the app; other packs download once on first visit and are
   then cached. Budget: 15 MB per region pack, 150 MB for the whole world.
8. Emit derived files: per-route gradient profiles, the illustrated world map (SVG), route
   thumbnails, minimap tiles.

**World editor (developer tool, not shown to riders)**
A page in the app, available only in development, to edit `world.json` visually: top-down
view, drag road control points, live elevation-profile strip under the selected road with
gradient colouring and limit warnings, paint region polygons, place stamps and landmarks,
preview in 3D, save. Without this, tuning 140 km of road by hand-editing numbers is not
practical. Build the editor before authoring regions 2 to 10.

**Art approach** (the implementer cannot hand-model, so everything is procedural or CC0)
- Look: clean, colourful, slightly stylised realism. Realistic lighting, sky, haze and
  materials from 7.8 still apply; satellite imagery does not.
- Each region gets its own palette, sky tint, fog colour, tree set and ground materials so
  crossing a region border is obvious.
- Parametric generators in code for: houses and town blocks, lighthouse, wind turbines,
  bridges, tunnels portals, arches and banners, fences, walls, guard rails, signs.
- CC0 model packs for trees, rocks, props and the rider. **VERIFY** each licence and list it
  on the About screen.
- Ambient life at low cost: birds, drifting clouds, boats in the harbour, turning turbines,
  steam vents, waterfalls as animated planes. No traffic or pedestrians on the road.
- Optional time of day and weather per ride (clear, overcast, golden hour, night with road
  lights), which only change lighting and sky.

**Riding rules in the world**
- Following a route: turns are taken automatically; a small arrow shows the next turn.
- Free ride: at each junction a prompt offers the available directions (left, straight,
  right) 150 m before; arrow keys choose; default is straight on. U-turn with the down key.
- Start points: Port Anchor pier by default; routes that start elsewhere begin with a short
  lead-in or start directly at that region's arch.
- Gradient sent to the trainer comes straight from the road spline, sampled every 5 m with
  the look-ahead from 6.2. No smoothing is needed because the roads are designed smooth.

**Maps**
- Illustrated world map in a flat, layered style: sea depth bands, coast, region colours,
  snow, roads, landmarks, region labels. Generated from the world data, so it is always
  correct. Used for the World screen, route previews and the minimap.
- Minimap in the HUD: heading-up crop of that map with the rider arrow, the route ahead
  highlighted, and the route profile along its bottom edge (reference 24).
- MapLibre is not needed for the own world.

**Expansion path:** new regions or a second island are added as new packs without touching
the app; version the world file and keep old ride records valid by storing the world
version and edge ids with each ride.

### 7.1 Data sources (all free)
| Need | Source | Notes |
|---|---|---|
| Elevation | Mapterhorn (PMTiles, Terrarium encoding) with AWS Terrain Tiles as fallback | keyless; attribution required |
| Roads, buildings, water, landcover | OpenFreeMap vector tiles (OpenMapTiles schema) | keyless; OSM attribution |
| Ground texture | Procedural from landcover + slope + altitude; optional Sentinel-2 cloudless drape | **VERIFY** Sentinel-2 cloudless license per year of mosaic |
| Photoreal option | Google Photorealistic 3D Tiles via NASA 3DTilesRendererJS | user's own key and billing; 1,000 free sessions a month; may not be cached |
| 2D basemap | MapLibre + OpenFreeMap styles | |
| Routes | user GPX / TCX / FIT; own Strava routes; World Tour catalogue | see 7.6 |

Do not scrape Komoot, Bikemap, Strava segments or any commercial app's routes or videos.

### 7.2 Route preparation (runs once per route, in a worker)
1. Parse file to points (lat, lon, optional elevation).
2. Resample to one point every 5 m along the path.
3. Elevation: sample the DEM at each point (ignore noisy GPS elevation unless DEM is missing),
   then smooth with a 50 m window and clamp gradient to plus or minus 25 %.
4. Recompute gradient per 10 m. This array is the single source for trainer control, the
   profile views and the stats.
5. Detect climbs (500 m or longer, 3 % or steeper average) and categorise by length times
   gradient into categories 4, 3, 2, 1 and HC for the stage profile.
6. Build a smooth 3D centreline spline for the camera and road.
Reject or warn: fewer than 20 points, shorter than 500 m, gaps over 500 m, routes over 300 km.

### 7.3 Route baking (the latency strategy)
Nothing is fetched from the network during a ride. After preparation, "bake" the route into a
bundle and store it in OPFS:
- Split the route into 500 m chunks. For each chunk build:
  - near terrain: 1 km wide corridor, about 10 m grid
  - far terrain: 8 km wide, about 80 m grid, low detail, for skylines and mountains
  - road ribbon: 6 m wide mesh on the centreline with lane markings and shoulders
  - terrain is flattened to the road height within 8 m of the centreline and blended out to
    25 m, so the road never floats or sinks into the ground
  - scenery: building footprints extruded to OSM height or 2 to 3 floors; tree instances
    scattered in wood and forest polygons; water as flat planes; guard rails on steep drop-offs
- Geometry stored quantized (16-bit positions) and compressed. Target 150 to 400 KB per km.
- Show a progress bar with the map filling in; a 40 km route should bake in under 60 s.
  Riding may start after the first 3 km are baked; the rest continues in the background and
  the rider cannot outrun it at cycling speeds.
- World Tour routes ship pre-baked from the API, so they start immediately.

### 7.4 Renderer
- three.js, WebGL2, single canvas, one directional sun light plus hemisphere light, one
  cascaded shadow map for near objects only, distance fog matched to the sky colour to hide
  the edge of the world.
- Streaming: keep chunks from 1 km behind to 6 km ahead loaded; load and dispose in idle time,
  at most one chunk upload per frame to avoid hitches.
- Trees and props are instanced; buildings are merged per chunk. Budget: under 300 draw calls,
  under 1.5 million triangles in view, under 500 MB GPU memory.
- Sky: gradient dome with sun position from a time-of-day setting; optional weather presets.
- Avatar: rigged low-poly rider and bike (glTF). Pedalling animation speed follows cadence,
  wheel rotation follows speed, the rider stands when power is above 150 % of FTP or cadence
  is below 60 on gradients over 8 %. Use a CC0 or purchased model; **VERIFY** license.
- Cameras: chase (default), close chase, first person, side, helicopter, top-down. Keys 1 to 6.
  Camera position is spring-damped so chunk boundaries and gradient changes never jerk.
- Quality presets: Low, Medium, High, Ultra control resolution scale, shadow quality, tree
  density, view distance and post-processing. Dynamic resolution drops the scale in 10 % steps
  if the frame time exceeds 18 ms for 2 seconds and recovers when below 12 ms.
- If WebGL context is lost, fall back to the 2D stage-profile view without stopping the ride.

### 7.5 2D views
These exist alongside the 3D view in every route and workout mode, switchable with the V key
and available as picture-in-picture widgets.

**Stage profile (Tour de France broadcast style)**
- Full-width side-on elevation silhouette of the whole route, filled, with gradient colouring
  per segment: green under 3 %, yellow 3 to 6, orange 6 to 9, red 9 to 12, dark red above.
- Rider icon moves along the terrain line; ghost and pacer icons too, with time gaps labelled.
- Climb banners with category, length, average gradient, and summit markers; distance flags
  every 5 or 10 km; start and finish arches; sprint and summit points.
- Two zoom levels: whole stage, and "next 2 km" close-up with gradient numbers per 100 m.
- Lower strip shows power and heart rate traces already ridden, aligned to distance.
- Rendered on a 2D canvas, static silhouette cached as a bitmap, only markers redrawn.
- In a pure workout with no route, the same component shows the workout's power profile with
  the rider marker moving along it; in workout-on-route it can show either.

**Route map**
- MapLibre top-down map with the route line, ridden portion highlighted, rider arrow, optional
  hill shading from the same elevation tiles, north-up or heading-up.
- Used as the minimap widget and as a full-screen view.

### 7.6 World Tour catalogue
- A curated list of about 30 routes to start, each created by us with an open routing engine
  on OpenStreetMap data (ODbL), then prepared, baked and stored with a hero image and text.
- Suggested first set: Alpe d'Huez, Mont Ventoux, Col du Tourmalet, Col du Galibier,
  Passo dello Stelvio, Passo Pordoi, Sa Calobra, Mount Teide, Trollstigen, Grossglockner,
  Box Hill and Richmond Park, Central Park loop, Champs-Élysées circuit, Going-to-the-Sun Road,
  Haleakala, Pacific Coast Highway (Big Sur section), Chapman's Peak, Great Ocean Road,
  Wuling Pass (Taiwan), Mount Fuji Subaru Line, Khardung La, Munnar hills, Cabot Trail section,
  Lake Como loop, Amalfi Coast, Flanders cobbled climbs, Mallorca Cap Formentor.
- Browsed on a 3D globe and as filterable cards: distance, climb, difficulty, region, type.
- Later: draw-your-own route by clicking a map, using a free routing service.

### 7.7 Photoreal world — NOT BEING BUILT (kept as a record)

Decision 2026-11-14: the owner chose stylized only, because the only workable photoreal
source needs a Google Cloud account with a payment card. Do not implement anything in this
section. It stays so the option can be reopened later. Section 7.8 is what gets built.

Is there a free photoreal world? Findings:
| Option | Photoreal? | Cost | Catch |
|---|---|---|---|
| Google Photorealistic 3D Tiles | Yes: a textured 3D mesh of the real world from aerial photos, global, most detailed in cities | First 1,000 sessions per month free, then about $6 per 1,000. Needs a Google Cloud account with a payment card on file | Terms forbid caching, pre-fetching and offline use, so it streams live. Built from the air, so at road level trees, cars and walls look melted. **VERIFY** that one ride counts as one billable session |
| Google Street View tiles | Yes, true road-level photos | 100,000 free tile requests per month | Discrete panoramas every 10 m or so, so motion is a slideshow, not smooth. Terms restrict storage. Patchy on small roads |
| Mapillary street photos | Yes, where covered | Free API, open-licensed images | Coverage and quality vary wildly; not smooth |
| Real ride video (what Rouvy and Tacx use) | Yes, the best | Free only if you film it yourself | No free licensed library with matching GPS tracks was found. Commercial apps' videos may not be reused |
| Open government 3D meshes (some cities and countries) | Yes | Free | Tiny coverage, each in a different format |
| Stylized world from open data | No | Free, cacheable | Game look, not photo look |
There is no free, cacheable, road-level photoreal world. The closest is Google's 3D tiles,
which are free at personal-use volume.

Chosen design
1. **Photoreal mode = Google Photorealistic 3D Tiles** rendered with NASA's
   3DTilesRendererJS inside the same three.js scene. The owner enters their own API key in
   Settings; the key is stored server-side and never committed.
2. Our own layer is drawn on top: road ribbon, rider, ghosts, arches, signs. The road ribbon
   follows the route profile and is blended onto the Google mesh (small vertical offset plus
   polygon offset) so the smeared road surface underneath is hidden.
3. Making road level look good:
   - default camera sits higher and further back (about 6 m up, 12 m behind) in photoreal
     mode; first-person camera is disabled there;
   - request higher detail only inside a 300 m radius, lower beyond;
   - light atmospheric haze and depth-of-field soften distant mesh errors;
   - no artificial sun or shadows on the Google mesh (its lighting is baked in the photos);
     our rider gets a soft blob shadow only.
4. Latency without caching: load tiles ahead of the rider along the route (look-ahead 800 m,
   in memory, for the current session only, which the terms allow) and never block the frame
   on a tile. Honour the cache headers Google sends.
5. Fallback: the stylized bake of the same route is always prepared. If tiles stop arriving
   for 5 s, the key is missing, the monthly free cap is near (configurable limit, default
   900 sessions), or the area fails the quality check, the ride cross-fades to the stylized
   world and a toast explains why. The ride itself never stops.
6. Per-route quality flag: each catalogue route is marked "photoreal good", "photoreal
   poor" or "no coverage" after a visual check, and World Tour favours the good ones.
7. Required attribution (Google logo and data credits) is shown on the ride screen.
8. Trainer gradient still comes from the route profile, never from the Google mesh.

True road-level photoreal later (Phase 7): video rides from the owner's own action-camera
footage plus its GPS track, with playback speed tied to rider speed.

Phase 0 decides it: spike 0c renders three routes in Google tiles from the chase camera
(an alpine climb, a city loop, and one Indian route) and the owner judges the screenshots.
If road level is not acceptable, photoreal becomes the helicopter and overview camera only
and stylized remains the default riding view.

### 7.8 Making the stylized world look as real as free data allows
Goal: "believable real place", not "cartoon". Everything here is free and cacheable.
- **Real shapes:** terrain from real elevation data and real road geometry, so skylines,
  valleys and hairpins match the actual place. This is what makes a climb recognisable.
- **Real ground colour:** drape Sentinel-2 cloudless satellite imagery (about 10 m per
  pixel) on the far terrain and blend it into the near terrain as a colour tint, so fields,
  forest, rock and snow sit where they really are. Near the road, where 10 m imagery would
  be a blur, switch to tiling detail textures (grass, scree, rock, asphalt) chosen by
  landcover and slope. **VERIFY** the imagery licence for the mosaic year used.
- **Physically based materials** with CC0 texture sets (for example from Poly Haven or
  ambientCG): asphalt with wear and painted lines, gravel shoulders, rock, grass.
- **Sky and light:** physically based sky with sun position from the route's latitude and a
  time-of-day setting, image-based ambient light, soft shadows near the rider, distance
  haze tinted by the sky, optional volumetric-looking cloud layer.
- **Vegetation:** several CC0 tree and shrub models per climate band (alpine conifer,
  temperate broadleaf, Mediterranean, tropical), chosen by latitude, altitude and
  landcover, instanced, with wind sway in the shader.
- **Buildings:** real footprints and heights from OpenStreetMap, with regional roof shapes
  and a small set of facade materials instead of plain boxes.
- **Road furniture:** guard rails, kilometre posts, hairpin numbers, tunnels and bridges
  from OpenStreetMap tags, summit signs with the real name and altitude.
- **Post-processing** on Medium and above: tone mapping, mild bloom, ambient occlusion,
  subtle depth of field and motion blur at speed.
- Art gate at the end of Phase 4: side-by-side with a photo of the same spot on three
  routes; the owner signs off or lists what looks wrong.

True photoreal without any account remains possible later through video rides (Phase 7)
using the owner's own action-camera footage and its GPS track.

---

## 8. Data model (PostgreSQL)

```
profile(id, name, weight_kg, bike_weight_kg, ftp_w, max_hr, resting_hr, units, created_at)
zone_set(id, profile_id, kind power|hr, bounds jsonb)
device(id, profile_id, ble_name, kind, last_seen, settings jsonb)
route(id, source upload|catalog|strava, name, distance_m, ascent_m, bbox, profile jsonb,
      geometry jsonb, bake_version, bake_status, created_at)
workout(id, source builtin|import|custom, name, category, duration_s, tss_estimate,
        steps jsonb, tags text[])
plan(id, name, weeks jsonb)
ride(id, profile_id, started_at, ended_at, mode, route_id, workout_id, status,
     summary jsonb, fit_path)
ride_sample(ride_id, t_s, power_w, cadence, hr, speed_mps, distance_m, lat, lon, alt_m,
            grade_pct, target_w, step_idx)      -- primary key (ride_id, t_s)
best_effort(ride_id, duration_s, power_w)
settings(profile_id, key, value jsonb)
```
```
strava_account(profile_id, athlete_id, access_token_enc, refresh_token_enc, expires_at,
               auto_upload bool, name_template, connected_at)
strava_upload(ride_id, status queued|uploading|done|failed, strava_activity_id,
              attempts, last_error, updated_at)
```

### 8.1 Strava integration (opt-in; added 2026-11-14 at the owner's request)
Off by default. Nothing is ever sent to Strava until the owner connects it in Settings.
API details below are from general knowledge; **VERIFY** against Strava's current
developer documentation when implementing.

Setup (one time)
- The owner registers a free personal API application on Strava and puts the client id
  and secret in the API server's `.env` (never committed, never sent to the browser).
- Callback address is the local API: `http://localhost:<port>/oauth/strava/callback`.

Settings → Data and connections → Strava
- "Connect with Strava" button (uses Strava's required button artwork). Opens Strava's
  consent page asking only for permission to upload activities (`activity:write`).
- Once connected: athlete name and photo, and these options:
  - Upload rides: **Ask after each ride** (default) / Automatically / Never.
  - Activity name template, default "{route or workout name} — MyFitBike".
  - Include heart rate: on by default.
  - "Disconnect": revokes access at Strava and deletes the stored tokens.
- Status line showing the last upload and any that are waiting or failed, with Retry.

Behaviour
- Summary screen shows "Upload to Strava" (or "Uploaded ✓ View on Strava" when done).
- Upload sends the ride's FIT file as an indoor virtual ride, with the ride id as the
  external id so a retry can never create a duplicate.
- Uploads run in a server-side queue: retry with backoff on network errors or rate limits,
  refresh the access token when it has expired, give up after 5 attempts and show why.
  A failed upload never blocks saving the ride.
- Never uploaded: rides on the Demo trainer, discarded rides, rides under 1 minute.
- Velora rides carry no GPS positions, so Strava shows data without a map.
- Tokens are encrypted at rest with a key from `.env`.

Not included: reading Strava routes, segments or other athletes' data.

Single local profile, no authentication while it runs on localhost. Hosting it publicly
requires adding login first; do not deploy the API to the internet without it.

---

## 9. Performance and latency budgets

| Item | Budget |
|---|---|
| App shell interactive | under 2 s, initial JS under 250 KB gzipped; three.js, MapLibre and the world code are lazy-loaded |
| Start of a baked route | under 5 s to first rendered frame |
| Frame time | 16.7 ms at default preset; never above 33 ms for more than 3 consecutive frames |
| Bluetooth sample to HUD | under 100 ms |
| Gradient change to trainer command | under 1 s, with 1 s look-ahead |
| ERG target at step boundary | sent 1 s early, confirmed within 500 ms |
| HUD numeric refresh | 4 Hz for power, 1 Hz for the rest |
| Memory | under 1.5 GB tab memory after 2 hours; no growth trend |
| Sample durability | at most 1 s of data lost on crash |

Supporting measures: Screen Wake Lock during rides; warn when the tab is hidden; service
worker caches the app shell so it opens with no network; preload the next chunk during idle;
display power as a 3 s average with an option for 1 s or instant.

---

## 10. UX specification

### 10.1 Visual language
Theme direction set by the owner on 2026-11-14 from a gym-app screenshot
(`plan/reference/21.png`): calm, soft and atmospheric rather than neon or flat black.
- Background: deep blue-slate (#262C3A to #1E2633) with two large blurred glows at about
  25 % opacity, plum (#6B3A5C) top-right and teal (#1F6F86) lower-right. Implement as one
  fixed CSS layer of radial gradients; do not animate it and do not use a blur filter on
  it, so it costs nothing per frame.
- Surfaces and buttons: frosted glass (white at 10 %, 16 % on hover, 22 % selected) with
  bold uppercase white labels and 8 px radius. Chips are thin-outline pills.
- Accent: amber (#F2C14E), used sparingly for the primary action, highlights and callouts.
  The rider's own marker is white with an amber ring so it never clashes with data colours.
- Text: white, with grey-blue (#A9B1BE) secondary labels above bold items.
- Data colours keep full saturation: the seven power zones (grey, blue, green, yellow,
  orange, red, purple) and the gradient scale. They are the only saturated colours.
- Ride HUD panels use dark slate at 55 % with blur instead of white frost, because white
  frost washes out over bright scenery. Limit blurred panels on the ride screen to those
  visible; backdrop blur over a moving 3D canvas is costly, so the Low quality preset
  replaces blur with a solid 75 % slate fill.
- All colours live as design tokens in the Tailwind theme, so the theme can be swapped or a
  second theme added in Settings later without touching components.
- Large tabular numerals readable from 2 m. Motion: 150 to 250 ms eased transitions, no
  animation on live numbers. Everything operable by keyboard, since hands are on the bars.
- Check contrast: white and amber text on frosted surfaces must reach 4.5:1 against the
  darkest and lightest parts of the background glow.

### 10.2 Screens
1. **Home** – big cards: Just Ride, Workouts, World Tour, My Routes, History. Shows trainer
   connection chip, this week's totals and a "continue plan" card.
2. **Pairing** – four tiles (Controllable trainer, Power, Cadence, Heart rate), each with
   Search, status, live value and signal. Auto-fills power and cadence from the trainer.
   "Use simulator" link. Checklist of common problems.
3. **Route browser** – globe plus card grid, filters, route detail with stage profile, stats,
   estimated time at the rider's FTP, bake status, Ride button.
4. **Workout library** – categories, duration and intensity filters, each card shows the
   coloured block graph; detail page with description; import and builder buttons.
5. **Workout builder** – drag blocks on a timeline, edit duration and target, repeat groups,
   text cues, live stress estimate, export to ZWO.
6. **Ride screen** – see 10.3.
7. **Pause menu** – resume, end and save, discard, camera, quick settings.
8. **Summary** – map and profile, charts, zones, best efforts, stars earned, export FIT,
   upload to Strava.
9. **History** – list and calendar, weekly load chart, personal records, FTP history.
10. **Settings** – Profile (weight, FTP, heart rate, zones), Units, Trainer (difficulty, ERG
    smoothing, power averaging, spin-down), Graphics (preset, resolution, shadows, view
    distance, time of day, world mode, Google key), HUD (widget picker and layout), Audio,
    Data (export, import, connected services), About and attributions.

### 10.3 Ride HUD
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Time 0:42:10]        ┌ 245 W ┐ [152 bpm] [88 rpm]            ┌─ minimap ─┐ │
│ [Dist 18.4 km]        │ 3.4/kg│ [31.2 km/h]                   │           │ │
│ [Climb 412 m]         └───────┘ [grade +6.2 %]                └───────────┘ │
│                                                                              │
│ ┌ workout ───┐                                             ┌ gap ─────────┐  │
│ │ ▶ 4 min 105%│              3D WORLD / VIDEO / 2D         │ ghost  -0:12 │  │
│ │   2 min 55% │                                            │ pacer  +0:05 │  │
│ │ target 260 W│                                            └──────────────┘  │
│ │ 2:13 left   │                                                              │
│ └─────────────┘                                                              │
│ ┌ stage profile strip: coloured elevation, rider marker, next climb banner ┐ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ [pause] [camera] [view] [ERG on] [bias -/+] [difficulty] [screenshot] [end]  │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Widgets: power (with configurable sub-fields: 3 s, average, normalized, w/kg, zone),
  heart rate, cadence, speed, gradient, time, distance, elevation, minimap, stage profile,
  workout panel, gap panel, next-climb card, power-zone bar, lap table.
- Layout is editable: toggle, drag, resize; three saved layouts (Minimal, Standard, Data).
- Climb card appears 300 m before a categorised climb and stays to the summit with distance
  and metres remaining.
- Banners: interval countdown, cue text, trainer disconnected, gear hint, auto-pause.
- Keys: space pause, arrows bias or slope, 1 to 6 camera, V view cycle, H hide HUD, M map,
  tab skip step, S screenshot, escape menu.
- HUD is DOM over the canvas. Numbers update through refs, not React state. Graph widgets
  draw on small 2D canvases.

### 10.4 First-run flow
Browser check, then profile (weight, FTP or "I don't know" which schedules a ramp test),
then pairing, then a 2-minute guided spin on the default loop that confirms resistance control
works ("you should feel this hill now").

### 10.5 Screenshot findings (supersedes 10.2 and 10.3 where they differ)

Reference index (`plan/reference/`)
| File | App and screen |
|---|---|
| 1 | Rouvy ride, older HUD: power box, gradient wedge, nearby list, full-width profile |
| 2, 4 | Rouvy ride, current HUD: bottom-anchored data, climb segment panel, ghost markers |
| 3 | Rouvy workout on route: step list, workout graph, slide-in menu |
| 5 | Rouvy main menu drawer |
| 6 | Rouvy home and workouts hub |
| 7, 8 | Tacx home and connection setup (phone) |
| 9 | Tacx workout screen (phone) |
| 10, 13 | Tacx New Ride: movies, playlists, workouts |
| 11 | Tacx route detail: map, profile, start / subcourse |
| 12 | Tacx workout library and tests |
| 14 | Tacx Training Room: challenges, tests, plans |
| 15, 16, 18 | Zwift ride HUD: power tile, top bar, minimap, splits, ride stats, segment timer |
| 17 | Zwift HUD settings with slot dropdowns and live preview |
| 19 | Zwift pause settings |
| 20 | Zwift paired devices |

**A. Three HUD presets, chosen in Settings → HUD (this is how the references are "saved in settings")**
Each preset is a saved widget layout; the user can start from one and customise it.
| Preset | Modelled on | Layout |
|---|---|---|
| Broadcast (default) | Rouvy current (2, 3, 4) | Data anchored bottom-left: very large italic watts with bolt icon and average beside it, zone bar underneath, then speed / heart rate with zone chip / cadence in a row. Route profile bottom-centre. Upcoming-gradient close-up bottom-right. Time and menu top-right. Top of screen kept clear for scenery |
| Cockpit | Zwift (15, 16, 18) | Power tile top-left with zone bar and 4 configurable slots. Speed / distance / elevation / time bar top-centre with route progress and lap. Minimap with profile top-right. Splits and ride stats on the left, on-the-road list on the right. Action bar bottom-centre |
| Focus | Tacx (9) | Large tiles only: power and heart rate each with a 7-colour zone bar and marker, then calories / cadence / speed / distance, step progress with Skip, workout timeline with FTP line. No 3D chrome; meant for workouts |

**B. Widgets added to the catalogue in 10.3**
- Gradient wedge: small triangle whose slope and colour follow the current gradient, with the
  percentage inside (1).
- Upcoming gradient close-up: the next 500 m to 1 km as a coloured ramp with current percent
  and climb name (2, 4).
- Paired "done → remaining" readouts: elapsed → estimated finish time, distance → remaining,
  ascent → remaining (1, 3, 4).
- Workout step list: zone-colour chip, duration, target watts, target cadence; the active
  step is enlarged with a countdown bar; header shows "step 3 / 12" (3).
- Workout graph: zone-coloured blocks with the actual power trace drawn over them and a
  rider marker at the current time (3).
- Zone bar with marker for power and for heart rate (9).
- Splits panel (per lap or per 5 km: time, speed, heart rate, power) and Ride stats panel
  (best 5 s / 1 / 5 / 20 / 60 min, weighted power, average speed) (15, 16).
- Segment panel: climb name, length, ascent, live timer versus personal best and 30/90-day
  best, estimated finish (4, 18).
- On-the-road list (solo replacement for the nearby-riders list): your ghosts from earlier
  rides and pacers at fixed watts per kilo, each with gap in metres or seconds (1, 2, 15).
- Profile strip pins: ghosts and pacers shown as pins on the full-width profile (1).

**C. In-world elements (3D)**
Start and finish arches, roadside flags and barriers at start, finish and summits; painted
START / FINISH road markings; translucent ghost riders labelled "Personal best" and
"Last ride"; "close the gap" indicator when a ghost is within 10 s ahead (1, 4, 18).
All signage carries our own branding.

**D. Ride menu**
A slide-in panel from the right, not a full-screen pause: Sensors, Settings, Customise
interface, Pause / End ride. The world stays visible and the ride keeps running unless
Pause is pressed (3). Round icon buttons top-right for map, menu and exit (1).

**E. App shell**
- Left icon rail: Home, Routes, Workouts, Training Room, Activities, Search, Settings (5, 6, 10).
- Top status bar: profile, level and XP bar, weekly goal progress, and four sensor status
  icons (trainer, power, cadence, heart rate) with a coloured dot each; clicking opens
  pairing (6, 7).
- Home: two hero cards (recommended plan, recommended workout with its bar graph), then
  quick-start tiles, then rows of route and workout cards (6, 7).
- Quick-start tiles: **Start Power** (free ERG at a chosen wattage) and **Start Slope**
  (free ride at a chosen gradient), each two clicks from launch (6, 7, 13).

**F. Pairing screen**
Live value row at the top (watts, speed, cadence, heart rate) that fills as devices connect;
large tiles for Power source, Resistance, Cadence, Heart rate, each blue when connected and
accent-coloured when searching; trainer card with capability icons (Bluetooth, power, speed,
cadence, controllable); a "Demo trainer" entry that starts the simulator; "Just look around"
to enter without devices (8, 20).

**G. Routes**
- Since the move to our own world (7.0): tabs are World (illustrated map with regions and
  routes), Routes (list), Collections, Search. "My Routes (GPS)" appears only if the Phase 6
  real-road mode is built. Collections group Velora routes: Flat and fast, Climbs,
  Rolling, Short and sharp, Epics (10).
- Collections (playlists): King of the Mountains, Italian Lakes, Scandinavia, Asian climbs
  and similar, each with total distance, ascent and ride count (10).
- Route cards: photo, distance, ascent, difficulty label (Easy / Moderate / Hard / Extreme)
  and a mini profile along the bottom edge (7, 10).
- Route detail: map with start and finish pins, filled elevation profile, description,
  buttons Start, **Select a section** (drag handles on the profile to ride only part of a
  route), Download, Favourite, and a tab listing past activities on this route (11).

**H. Workouts and Training Room**
- Workout cards show the block graph as the thumbnail, with duration, stress score and
  intensity (6, 12, 13).
- Categories as tiles: Power control, Slope control, Getting started, FTP tests, Sweet spot
  and tempo, Threshold, VO2 max, Sprints (6).
- Tests section with four tests: ramp test without known FTP, ramp test by percent of FTP,
  20-minute test, 60-minute test (12).
- Training Room tabs: Challenges, Tests, Training plans (14).
- Solo challenges: multi-stage (for example "ride 7 alpine climbs in 21 days") and monthly
  badges (distance, ascent, number of rides). Progress is computed from ride history.

**I. Progression (light, solo)**
Experience points per minute ridden and per workout star, levels, badges, weekly goal
(hours or stress score), streaks. Shown in the top bar and on the summary screen (4, 6).
No coins, shop or avatar unlocks in the first version.

**J. Settings additions**
- HUD tab: preset picker; per-widget slot dropdowns with a live preview beside them (17).
- In-ride quick settings: interface volume, world volume, resolution, trainer difficulty
  slider, power display 3 s or instant, units (19).
- Downloads: list of baked routes with size and delete (5).
- Menu also offers Ride statistics, Achievements, Weekly goals, and "Start tutorial ride" (5).

Deliberately not adopted: friends, chat, events, group rides, live leaderboards, coins.

Design hand-off: batch prompts for Google Stitch are in `plan/STITCH_PROMPTS.md`.

---

## 11. Build phases

Each phase ends with a demo and its gate must pass before the next starts.

**Phase 0 – Risk spikes (throwaway code)**
- 0a One HTML page: connect the Flux 2, list services, log Indoor Bike Data, request control,
  set 150 W, set 5 % grade, read control-point responses. Record notification rate and lag.
- 0b World slice: write a tiny world file (one 5 km loop with a flat, a 1 km hill at 6 %,
  one junction), run the build pipeline of 7.0 on it, and ride it in three.js.
- 0c Look check: the 0b slice with materials, sky, haze, trees and a few houses; confirm
  it holds 60 fps and the owner likes the style before more world is authored.
- 0d Pair the Garmin HRM and the crank cadence sensor in the same page as the trainer;
  confirm all three stay connected together.
- Gate: FTMS (or FE-C) control confirmed on the real trainer with captured byte logs saved as
  test fixtures; 60 fps on the bake demo; every VERIFY item resolved or re-planned.

**Phase 1 – Foundation**
- Monorepo, tooling, design tokens and primitives, app shell and routing, Postgres schema and
  API skeleton, profile and settings, device layer with simulator, pairing screen.
- Gate: pair real trainer and simulator; live values on the pairing screen; reconnect after
  power-cycling the trainer; unit tests for all codecs against Phase 0 fixtures.

**Phase 2 – Workouts in 2D (first usable product)**
- Ride engine worker, workout player, ERG control, HUD v1, workout graph view, recorder with
  write-ahead log, summary, FIT export, built-in library, ZWO / ERG / MRC import, FTP tests.
- Strava integration (section 8.1): connect in Settings, opt-in upload after a ride. Moved
  here from Phase 6 because it builds directly on the FIT export.
- Gate: complete a 60-minute workout on the real trainer; FIT file accepted by Strava and
  Garmin Connect; the ride appears on Strava through the in-app upload; kill the tab mid-ride and resume without data loss.

**Phase 3 – Routes in 2D**
- World data model, validation and the road network for regions 1 to 3 (elevation only, no
  3D yet), world editor v1, route following and junction choice, physics, SIM control with
  look-ahead, stage profile view, illustrated map and minimap, segments, ghost and pacer,
  free ride.
- Gate: ride Lagoon Lap and Downs Rollers in the 2D views; gradient felt matches the
  profile; speed on a designed climb at known power within 3 % of an independent calculator.

**Phase 4 – 3D world**
- Bake pipeline, chunk streaming, terrain, road, scenery, sky, avatar, cameras, quality
  presets, dynamic resolution, view switching, picture-in-picture 2D widgets.
- Full build pipeline of 7.0 and the 3D art for regions 1 to 3 (Port Anchor, Saltmarsh
  Flats, Greenfold Downs): materials, sky and lighting, vegetation, parametric buildings,
  landmarks, road furniture, post-processing.
- Gate: budgets in section 9 met on every route in regions 1 to 3, including the town;
  2-hour soak with no memory growth; owner signs off the look.

**Phase 5 – Rest of the world and polish**
- Regions 4 to 10 authored and built, one at a time, each with its routes and segments
  (suggested order: Mount Solace, Stonebridge, Tealeaf Terraces, Whisperwood, Glasswater
  Fjord, Emberfall Canyon, Cinder Isle). World screen, workout builder, HUD layout editor,
  history and analytics, audio cues, first-run flow, training plans.
- From 10.5: collections, select-a-section, Training Room challenges and badges, levels and
  weekly goals, in-world arches and ghost holograms, downloads manager.
- Earlier phases pick up their 10.5 items: app shell, status bar, pairing layout and Demo
  trainer in Phase 1; Broadcast and Focus presets, step list, workout graph with trace and
  Start Power in Phase 2; Cockpit preset, segment panel, splits, on-the-road list and Start
  Slope in Phase 3.
- Gate: a new user goes from first launch to riding Solace Summit in under 3 minutes; the
  Grand Tour of Velora can be ridden end to end with no visible seams between regions.

**Phase 6 – Integrations**
- intervals.icu workout sync, FIT workout import from Garmin Connect, power
  pedals as power source.
- Optional real-road mode: GPX / TCX / FIT import and the pipeline of sections 7.1 to 7.3,
  7.6 and 7.8. Only if the owner still wants it once Velora is complete.
- Note for uploads: rides in Velora have no real coordinates. Export them as indoor
  ("virtual ride") activities without GPS positions.

**Phase 7 – Optional**
- Video rides with user-supplied video plus GPX, draw-your-own route, Electron wrapper for a
  native Mac app (Electron supports Web Bluetooth; Tauri on Mac does not).

---

## 12. Testing

- Unit: FTMS and FE-C codecs against captured frames; physics steady-state speeds; workout
  timeline determinism; GPX smoothing and climb detection on fixture routes; FIT round trip.
- Integration: engine plus simulated trainer running a full workout at 60x speed, asserting
  commands sent, samples recorded, summary numbers.
- End-to-end (Playwright, Chrome): pairing with simulator, run workout, run route, summary,
  export. Web Bluetooth itself cannot be automated; it is covered by the manual checklist.
- Fault injection: Bluetooth drop mid-interval, control lost (status 5), API down for 10 min,
  tab hidden for 5 min, WebGL context loss, bake interrupted, corrupted GPX.
- Performance: scripted fly-through capturing frame times and memory per commit; fail on
  regression beyond 10 %.
- Manual hardware checklist per release on the real Flux 2: ERG accuracy at 100 / 200 / 300 W,
  gradient steps 0 to 10 %, reconnect, 60-minute ride.

Tests must state the reason for the behaviour (for example "ERG releases under 40 rpm so the
rider can restart after stalling"), not just the number.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Flux 2 firmware lacks full FTMS control | no trainer control | FE-C over BLE fallback; Phase 0 gate; update firmware with Tacx utility |
| Another device holds the trainer connection | cannot pair | explicit checklist on pairing screen; detect "control not permitted" |
| Web Bluetooth permission lost on reload | re-pair needed every session | one-click reconnect; try `getDevices()` where available |
| Tab throttling in background | ride clock drifts | worker clock, wake lock, time from sample timestamps not tick counts |
| Open tile servers slow or rate limited | bake fails | retry with backoff, polite concurrency (4), fallback source, API-side cache |
| Stylized world looks cheap | fails the "very graphical" goal | invest in lighting, fog, sky, trees and road detail first; art review at Phase 4 gate; photoreal mode as option |
| Road and terrain mismatch (floating roads, tunnels, bridges) | visual glitches | terrain conforming; treat OSM tunnels and bridges specially: hide terrain above, add deck below |
| GPS elevation noise | wild resistance swings | DEM resample, smoothing, gradient clamp, change threshold |
| Licensing of data, models, fonts, routes | legal exposure if ever shared | attribution screen; only ODbL / CC0 / CC BY sources; no scraping |
| Scope size | never finishes | phases are independently useful; Phase 2 alone replaces a workout app |

---

## 14. Open questions for the owner

1. RESOLVED 2026-11-14: local server plus PostgreSQL is accepted.
2. RESOLVED: stylized only, made as realistic as free data allows (D4, sections 7.7, 7.8).
   The owner declined the Google Cloud account that photoreal would need.
3. RESOLVED: stage profile plus top-down map is the right reading.
4. RESOLVED: personal for now, sharing later. Keep `profile_id` on every table and keep
   all data access behind the API so login and hosting can be added without a rewrite. Use
   only data whose licence also allows later sharing, except Google tiles, whose terms must
   be re-read before any public release.
5. RESOLVED: Garmin HRM strap over Bluetooth, plus Garmin speed and cadence sensors
   (section 5.8).
6. RESOLVED: metric defaults: kilometres, kilograms, km/h, metres, watts per kilo. FTP not
   given, so first run offers the ramp test and uses 2.5 W/kg as a placeholder until then.
7. RESOLVED: "save in settings" means the three HUD presets; theme colours to be tuned
   after the Stitch output.

8. RESOLVED 2026-11-14: build our own imaginary world (section 7.0) instead of real roads.

Still open
- Is the world name "Velora" and the ten-region list acceptable, or does the owner want
  different terrains or names?
- RESOLVED 2026-11-14: riding real roads from GPS tracks stays as an optional part of
  Phase 6, after Velora is complete.
- Which Garmin HRM model and which watch, if any (affects Bluetooth connection limits)?

---

## 15. Sources consulted

- Zwift HUD: support.zwift.com "Using the Heads Up Display when Cycling"; zwiftinsider.com/hud-refresh-closer-look; forums.zwift.com customizable workout HUD (May 2026)
- Rouvy: bikeradar.com Rouvy guide; cyclingnews.com Rouvy guide; endurance.biz 2025 interface update; smartbiketrainers.com workouts in AR app
- Tacx: garmin.com/en-US/blog/fitness/tacx-training-app; Tacx Training App Store listing; developer.garmin.com/tacx-trainer/overview
- Flux 2: smartbiketrainers.com/tacx-flux-2-review-7782; the5krunner.com specs; Garmin forum threads on ERG limits and control conflicts
- Protocol and prior art: github.com/dvmarinoff/Flux and Auuki; github.com/masonwyatt23/globeride; github.com/OlliV/bfree; Bluetooth SIG FTMS ICS; github.com/h4l/zwift-workout-file-reference
- Browser support: beaconzone.co.uk Web Bluetooth support; WebKit bug 101034
- World data: protomaps.com/blog/mapterhorn-terrain; AWS Terrain Tiles; OpenFreeMap; developers.google.com Map Tiles API usage and billing

---

## 16. Owner decisions after Phase 0 (2026-11-14) — these override earlier sections

1. **World:** "Velora" and the ten regions stand. The implementer may change, add or remove
   regions and names where that makes a better world.
2. **Owner's kit:** Garmin epix Gen 2 (watch), Garmin Edge 550, Garmin HRM 200 and HRM 600
   straps, Tacx Flux 2, Garmin speed and cadence sensors. The Edge 550 must not be paired to the
   trainer as a controller during app rides (pairing checklist names it).
3. **Profile values** are entered by the user in first run; no hard-coded owner defaults.
4. **`design/` is committed** to git.
5. **The code will be open source.** Consequences: no proprietary libraries in the shipped app.
   D12 changes: write our own FIT activity encoder from the public FIT protocol description
   (with round-trip tests against an independent decoder in dev tooling only), instead of
   Garmin's FIT SDK. Same rule for every dependency and asset: OSI or CC0/CC-BY only. Never copy
   code from AGPL projects (Auuki) into this repository.
6. **Reconnect after a tab reload:** do both. If `navigator.bluetooth.getDevices` exists (Chrome
   flag enabled), reconnect automatically; otherwise show a one-click "Reconnect devices" banner.
   Settings → Trainer explains the flag.
7. **Ride simulator, not a game.** The rider never steers. The bike follows the road and turns by
   itself at corners and junctions. Overrides section 7.0 "Riding rules": no junction prompt, no
   arrow-key direction choice, no U-turn key. Free ride follows a chosen free-ride loop (default:
   the region's default loop); routes follow their edge list. Arrow keys keep only their HUD
   meaning (bias / slope).
8. **Terrain profile always on (2026-11-14):** every ride view (Broadcast, Cockpit, Focus and
   any custom layout) shows the 2D terrain/stage profile strip by default: whole-route
   silhouette coloured by gradient intensity (green → yellow → orange → red → dark red, DESIGN.md
   elevation scale), the rider's position on it, distance done / remaining, and the current
   slope. It can be turned off in Settings → HUD (and the in-ride quick settings). Slope is shown
   in percent (the cycling convention; 10 % ≈ 5.7°). In a pure workout with no route the strip shows the
   workout power profile instead (section 7.5). Overrides 10.5 A, where Focus had no profile.
9. **Auto-pause / auto-resume in every mode (2026-11-14):** when the rider stops pedalling
   (power 0 and cadence 0) for the auto-pause delay (default 3 s, setting 1–10 s), the ride
   pauses: clock, distance, recording and workout timeline stop, the bike comes to rest, and a
   "Paused — start pedalling" banner shows. The first pedal stroke (power > 0 or cadence > 0)
   resumes immediately; in ERG the current target is re-sent. Overrides 6.5 ("routes only,
   never in workouts"). Manual pause (space) still exists and resumes only on the key.
10. **Richer scenery (2026-11-14):** trees must look real (layered, irregular crowns with leaf
    clusters, several species per climate, wind sway) and every region gets a scenery catalogue
    beyond trees. Baseline catalogue (each region picks from it, all procedural or CC0):
    - Water: lakes and ponds with reed edges, rivers and streams with bridges, waterfalls,
      sea with surf line, harbour with moored boats, jetties.
    - Animals (static or idle-animated, never on the road): sheep flocks, cows, horses, goats
      in fields; gulls over the coast; ducks on ponds; birds in the sky.
    - Farmland: crop fields with row texture (wheat, sunflower, lavender, tea), hay bales,
      hedgerows, dry-stone walls, wooden fences and gates, barns, silos, orchards, vineyards.
    - Ground cover: grass tufts, wildflower patches, bushes, ferns, rocks and boulders, scree.
    - Built: houses, farmhouses, windmills, wind turbines, churches, ruins, lighthouses,
      benches, signposts, kilometre posts, telegraph poles, picnic spots, campsites.
    - Sky: clouds, birds, hot-air balloon (one per world), contrails.
    Performance rule: everything instanced and density-scaled by the quality preset; budgets
    in section 9 still apply.
11. **Rider avatar in the profile (2026-11-14):** Settings → Profile has an avatar section: body
    (male / female), skin tone, hair colour, and kit colours for jersey, jersey accent, shorts,
    socks, shoes, helmet and glasses lens. Stored in `profile.avatar` (jsonb). The 3D rider, the
    status-bar avatar and ghosts (tinted translucent) use it. Bike frame colour is part of it too.
12. **HUD size (2026-11-14):** Settings → HUD (and in-ride quick settings) offers Small, Medium and
    Large (default Large). It scales every HUD widget together, including the profile strip.
13. **Heart rate in every default HUD layout (2026-11-14),** with HR-zone colour; shows "—" with a
    "no strap" hint when no heart-rate source is paired.
14. **Scenery is placed for the rider's eye (2026-11-14):** lakes, animals, fields, walls and
    other catalogue items are placed mostly within 15–150 m of the road (lakes the road runs
    along, flocks in roadside fields), not spread evenly over the island.
15. **Checkpoints like a Grand Tour stage (2026-11-14):** start/finish, every segment start and
    end (sprint, climb), summits (KOM) and optional intermediate points get an inflatable arch
    in MyFitBike's own branding (no third-party or sponsor marks), banner barriers along both
    road edges for ~60 m, feather flags, painted road markings, and spectators behind the
    barriers who wave, clap and jump as the rider approaches (crowd density scaled by quality
    preset; cheering audio in Phase 5). Extends 10.5 C.
16. **Road graffiti before checkpoints (2026-11-14):** the 300 m before each checkpoint (denser on
    climbs and summits) carries hand-painted road writing like a Grand Tour climb: the rider's
    own name from the profile ("GO <NAME>!", repeated, biggest near the top), cheers in several
    languages (ALLEZ, VAS-Y, FORZA, VAMOS, HOPP), Velora place names, invented fan nicknames and
    simple painted flags/arrows. Chalk-white and yellow paint, irregular sizes and angles, always
    readable from the approach direction. No real people's names or third-party marks.
17. **Rider country (2026-11-14):** the profile stores the rider's country (ISO 3166 alpha-2).
    Its flag is painted on the road before checkpoints, waved by some spectators and shown on the
    rider's status-bar avatar. Graffiti mixes the rider's name (about half of all writing, plus
    one road-wide banner before each arch), witty fan slogans, distance countdowns painted at
    their true distance, and flags of many nations.
18. **Real-road mode: go (2026-11-14).** The optional Phase 6 real-road mode is built (GPX / TCX / FIT import,
    open elevation tiles, bake to OPFS). Next pieces (OSM scenery, MapLibre map, World Tour list) wait for
    checkpoint G.
19. **Imperial units (2026-11-14):** Metric or Imperial (mi, mph, ft, lb) in Settings → Units and first run.
    Display only — storage, physics, ride files, Strava and FIT stay metric.
20. **Spotify: not now (2026-11-14).** Evaluated: Spotify's policy bans overlapping its audio with the app's own
    sounds, requires visible cover art, Premium, and 5 allowlisted users per developer app. Riders can play
    Spotify in its own app alongside MyFitBike.
21. **Ride first, profile later (2026-11-14; replaces the blocking first-run wizard of 10.4):** first launch
    creates a default profile (75 kg + 8.5 kg bike, FTP unknown → 2.5 W/kg estimate, units from the browser
    language) and opens Home. Home shows a non-blocking "Finish your profile" card (weight, FTP, ramp test,
    guided setup, guided spin). FTP is asked only before the first structured ERG workout without one (enter /
    use estimate / ramp test). Estimated values are labelled "est." in the HUD and summary. The wizard stays as
    optional "Guided setup". An unreachable API shows a retrying screen and never opens setup.
22. **Renamed to MyFitBike (2026-11-14):** the VeloWorld name is taken. Every user-facing name, the 3D arches,
    banners and barrier boards, Strava activity names and upload ids, package names (`@myfitbike/*`) and the
    local databases (`myfitbike`, `myfitbike_test`) now use MyFitBike. The island keeps its name, Velora. The
    original Stitch design exports in `design/` and the historical prompt files keep their VeloWorld file names.
23. **Tablet and phone friendly (2026-11-14; relaxes D1):** every screen works from 375 px wide up (bottom tab bar on
    phones, side rail from 768 px, stacked grids, wrapping controls), and the ride screen has touch buttons for every
    keyboard shortcut plus a compact HUD below 900 px. The app no longer blocks other browsers: it feature-detects
    Web Bluetooth and, where it is missing (iPhone/iPad, Safari, Firefox, insecure address), shows a banner and
    offers the demo trainer. Serving the app to devices on the local network (needs HTTPS) is not set up yet.
24. **Online radio (2026-11-14):** free internet radio from radio-browser.info (TuneIn/Shoutcast need partner keys,
    Radio Garden has no public API). Settings → Radio: search by name, genre and country, test-play, star favourites
    (stored in settings). In a ride: favourites in the ride menu (tap to play, stop, mute) and a one-tap mute button on
    the HUD while a station plays. It keeps playing through pauses and stops when the ride screen closes. No mixing
    restriction applies (unlike Spotify), so the app's own sounds still play.
