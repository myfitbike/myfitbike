# MyFitBike

Free indoor cycling in the browser. Pair a smart trainer over Bluetooth and ride a 3D island, famous real climbs or
structured ERG workouts. Nothing to install.

**Live:** https://myfitbike.com · **Licence:** public domain ([The Unlicense](LICENSE))

![Riding up Mount Solace](apps/web/public/landing/ride-climb.jpg)

---

## Contents

1. [What it does](#1-what-it-does)
2. [Screens](#2-screens)
   1. [Public pages](#21-public-pages)
   2. [Home, routes and workouts](#22-home-routes-and-workouts)
   3. [Riding](#23-riding)
   4. [After the ride](#24-after-the-ride)
   5. [Devices and settings](#25-devices-and-settings)
3. [Architecture](#3-architecture)
   1. [The big picture](#31-the-big-picture)
   2. [Components](#32-components)
   3. [Technology](#33-technology)
4. [Data flow](#4-data-flow)
   1. [Signing in and calling the API](#41-signing-in-and-calling-the-api)
   2. [A ride, second by second](#42-a-ride-second-by-second)
   3. [Crash recovery](#43-crash-recovery)
   4. [Finishing a ride](#44-finishing-a-ride)
   5. [The world, routes and real roads](#45-the-world-routes-and-real-roads)
   6. [Radio](#46-radio)
   7. [Strava and intervals.icu](#47-strava-and-intervalsicu)
5. [Data model](#5-data-model)
6. [API reference](#6-api-reference)
7. [Settings keys](#7-settings-keys)
8. [Repository layout](#8-repository-layout)
9. [Setup](#9-setup)
   1. [Prerequisites](#91-prerequisites)
   2. [Run it locally (single rider, no login)](#92-run-it-locally-single-rider-no-login)
   3. [Run it locally with accounts](#93-run-it-locally-with-accounts)
   4. [Tests, type checks and builds](#94-tests-type-checks-and-builds)
   5. [Environment variables](#95-environment-variables)
10. [Deployment](#10-deployment)
    1. [Production layout](#101-production-layout)
    2. [First-time setup](#102-first-time-setup)
    3. [Auto-deploy from GitHub](#103-auto-deploy-from-github)
    4. [Database migrations in production](#104-database-migrations-in-production)
11. [Devices and browsers](#11-devices-and-browsers)
12. [Security and privacy](#12-security-and-privacy)
13. [Troubleshooting](#13-troubleshooting)
14. [Licences, attributions and further reading](#14-licences-attributions-and-further-reading)

---

## 1. What it does

| Area | What a rider gets |
|---|---|
| **Trainers and sensors** | Bluetooth pairing of FTMS smart trainers (built for the Tacx Flux 2; Tacx FE-C over BLE as a fallback), heart-rate straps, cadence/speed sensors and power meters. A built-in **demo trainer** lets anyone try the app without hardware. |
| **Free ride** | Ride the fictional island of **Velora** in 3D: 12 routes from flat harbour loops to the 12.5 km, 1,050 m climb of Mount Solace. Gradient physics drives the trainer's resistance. |
| **Real roads** | 8 famous climbs built in (Alpe d'Huez, Mont Ventoux, Stelvio, Tourmalet, Galibier, Grossglockner, Passo Pordoi, Sa Calobra), plus import of any GPX / TCX / FIT track. |
| **Workouts** | 43 structured workouts and 3 training plans; ERG mode holds target watts; import ZWO / ERG / MRC / FIT files; a block-based workout builder; ramp FTP test. |
| **Live HUD** | Power, heart rate, cadence, speed, zone, climb card, stage profile, minimap, segment timing, ghost of your best ride and pacers. Cameras 1–6. |
| **History** | Ride summary with power curve, zones, best efforts and FIT export; activity log (AG Grid), weekly load, calendar, personal records, FTP history, XP and levels. |
| **Extras** | Online radio (radio-browser.info stations, by country and genre), trainer calibration (spin-down), Strava upload (opt-in), intervals.icu workout sync. |
| **Accounts** | E-mail + password and Google sign-in (Supabase Auth). Each rider sees only their own data. |

---

## 2. Screens

All screenshots are from the real app (1440 × 900 window). Local data belongs to a test profile called "Test Rider".

### 2.1 Public pages

These are reachable without signing in.

| Page | Route | Screenshot |
|---|---|---|
| **Landing** — one long scrolling page: hero, numbers, features, how it works, screenshots, devices, FAQ. Signed-out visitors get it at `/`. | `/landing` | ![Landing](docs/screenshots/landing.jpg) |
| **Log in / create account** — 50/50 layout: pitch on the left, form on the right (stacks on phones). Password, sign-up with e-mail confirmation, "Forgot password?", and "Continue with Google" (shown only when Google is enabled in Supabase). | `/login` | ![Login](docs/screenshots/login.jpg) |
| **Choose a new password** — where the reset e-mail's link lands. | `/reset-password` | ![Reset password](docs/screenshots/reset-password.jpg) |
| **Privacy policy** — plain-English draft for the owner to review. | `/privacy` | ![Privacy](docs/screenshots/privacy.jpg) |
| **Attributions** — `content/ATTRIBUTIONS.md` rendered. | `/attributions` | ![Attributions](docs/screenshots/attributions.jpg) |

### 2.2 Home, routes and workouts

| Page | Route | Screenshot |
|---|---|---|
| **Home** — recommended plan and workout, quick-start tiles (Just Ride, Start Power in ERG, Start Slope), Velora routes, "finish your profile" card. The top bar shows the rider, level/XP, weekly goal and the five device slots. | `/` | ![Home](docs/screenshots/home.jpg) |
| **First-run setup** — name, weight, FTP, units and the rider's look. Optional: a new rider can ride first and finish the profile later. | `/welcome` | ![Welcome](docs/screenshots/welcome.jpg) |
| **Routes** — Velora routes on the illustrated map, the Real roads tab (built-in climbs and imported tracks). | `/routes` | ![Routes](docs/screenshots/routes.jpg) |
| **Route detail** — map with start/finish, distance, ascent, max gradient, estimated time, ghost / pacer / workout-on-route options, elevation profile with selectable sections. | `/routes/:id` | ![Route detail](docs/screenshots/route-detail.jpg) |
| **Workouts** — library with filters; TSS and duration are computed against the rider's FTP. | `/workouts` | ![Workouts](docs/screenshots/workouts.jpg) |
| **Workout detail** — zone-coloured graph, stats and interval list. | `/workouts/:id` | ![Workout detail](docs/screenshots/workout-detail.jpg) |
| **Workout builder** — blocks on a timeline; edit duration and target. | `/workouts/builder` | ![Workout builder](docs/screenshots/workout-builder.jpg) |
| **Training room** — challenges, tests (ramp FTP test) and multi-week training plans. | `/training` | ![Training](docs/screenshots/training.jpg) |

### 2.3 Riding

The ride screen (`/ride`) runs the 3D world, the HUD and the trainer. It needs a paired trainer or the demo trainer, so
these images come from the landing-page set.

| View | Screenshot |
|---|---|
| **Climbing in the 3D world** — power, zone, climb card, next 2 km, route profile. | ![Climb](apps/web/public/landing/ride-climb.jpg) |
| **ERG workout on the road** — workout graph with the actual power trace. | ![Workout](apps/web/public/landing/ride-workout.jpg) |
| **Open world** | ![World](apps/web/public/landing/ride-world.jpg) |
| **Checkpoint / segment banner** | ![Checkpoint](apps/web/public/landing/ride-checkpoint.jpg) |
| **Phone layout** | ![Phone](apps/web/public/landing/phone-ride.jpg) |
| **The Velora map** | ![Map](apps/web/public/landing/velora-map.jpg) |

In-ride menu: cameras 1–6, difficulty, pause, radio (favourites + "Find a station"), end ride. Keyboard: arrows bias
power / slope; Shift + arrows drive the demo trainer.

### 2.4 After the ride

| Page | Route | Screenshot |
|---|---|---|
| **Ride summary** — time, distance, average / normalised power, TSS, IF, work, power + HR + target chart, zones, best efforts, FIT export, Strava upload when connected. | `/summary/:id` | ![Summary](docs/screenshots/summary.jpg) |
| **Activities** — weekly load (12 weeks), calendar, personal records, FTP history and the ride list in AG Grid. | `/activity` | ![Activities](docs/screenshots/activity.jpg) |

### 2.5 Devices and settings

| Page | Route | Screenshot |
|---|---|---|
| **Sensors** — pair and manage trainer, power, cadence, speed and heart rate; Calibrate opens the guided spin-down. | `/sensors` | ![Sensors](docs/screenshots/sensors.jpg) |
| **Profile** — account (e-mail, sign out), name, weight, bike weight, FTP, heart-rate values, country, rider look. | `/settings/profile` | ![Profile](docs/screenshots/settings-profile.jpg) |
| **Units** — metric / imperial (display only; everything is stored metric). | `/settings/units` | ![Units](docs/screenshots/settings-units.jpg) |
| **Trainer** — climb/descent difficulty, auto-pause. | `/settings/trainer` | ![Trainer](docs/screenshots/settings-trainer.jpg) |
| **HUD** — preset, size, widgets, profile strip, power averaging. | `/settings/hud` | ![HUD](docs/screenshots/settings-hud.jpg) |
| **Graphics** — quality and default camera. | `/settings/graphics` | ![Graphics](docs/screenshots/settings-graphics.jpg) |
| **Audio** — interface sounds and crowd cues. | `/settings/audio` | ![Audio](docs/screenshots/settings-audio.jpg) |
| **Downloads** — FIT export of rides. | `/settings/downloads` | ![Downloads](docs/screenshots/settings-downloads.jpg) |
| **Connections** — Strava (opt-in) and intervals.icu. | `/settings/connections` | ![Connections](docs/screenshots/settings-connections.jpg) |
| **Radio** — volume, favourites, station finder (country list with name/genre filter, or worldwide search). | `/settings/radio` | ![Radio](docs/screenshots/settings-radio.jpg) |
| **About** | `/settings/about` | ![About](docs/screenshots/settings-about.jpg) |

A developer-only world editor exists at `/dev/world` in development builds; it is never shipped to riders.

---

## 3. Architecture

### 3.1 The big picture

```mermaid
flowchart LR
  subgraph Browser["Rider's browser (Chrome / Edge)"]
    UI["React app<br/>screens, HUD"]
    DM["DeviceManager<br/>Web Bluetooth"]
    ENG["Ride engine<br/>Web Worker, 20 Hz"]
    W3D["3D world<br/>three.js"]
    WAL[("OPFS write-ahead log<br/>1 line per second")]
    SB["supabase-js<br/>session + tokens"]
  end
  TR["Smart trainer<br/>+ sensors"] <-->|BLE FTMS / FE-C / HR / CSC / CP| DM
  DM --> ENG --> DM
  ENG --> UI
  UI --> W3D
  ENG --> WAL
  subgraph CF["Cloudflare Worker 'myfitbike' (myfitbike.com)"]
    ASSETS["Static assets<br/>built web app"]
    API["Hono API under /api"]
    CRON["Cron every minute<br/>Strava upload queue"]
  end
  UI -->|HTML / JS / world chunks| ASSETS
  UI -->|"fetch /api/* + Bearer token"| API
  SB <-->|sign-in, refresh| AUTH["Supabase Auth<br/>e-mail, Google"]
  API -->|verify JWT via JWKS| AUTH
  API --> HD["Hyperdrive<br/>pooling, caching off"] --> PG[("Supabase Postgres")]
  CRON --> PG
  CRON --> STRAVA["Strava API"]
  API --> RB["radio-browser.info"]
  UI -->|audio streams| STATIONS["Radio stations"]
```

Locally the same code runs as two processes: the Vite dev server (web, port 5173, proxying `/api` to 8787) and a Node
Hono server (API, port 8787) on a local Postgres.

### 3.2 Components

| Component | Where | Responsibility |
|---|---|---|
| **Web app** | `apps/web` | React 19 single-page app. Screens, HUD, 3D world, Bluetooth devices, ride engine, crash-safe local log, radio, sign-in. |
| — App shell and state | `apps/web/src/app` | Routing (`App.tsx`), shell, UI state (zustand `store.ts`), the API client (`api.ts`), sign-in and token injection (`auth.ts`), workout catalogue, crash recovery dialog. |
| — Devices | `apps/web/src/devices` | `DeviceManager` owns every Bluetooth device and fills five slots (trainer, power, cadence, speed, HR). `FtmsTrainer` (primary), `FecTrainer` (fallback), `SimulatedTrainer` (demo). Byte-level codecs in `codecs/`. One GATT operation at a time (`commandQueue.ts`). Live values in `telemetry.ts`, outside React. |
| — Ride engine | `apps/web/src/engine` | `core.ts` — pure, deterministic step at 20 Hz (physics, ERG/slope targets, workout timeline, pacers, ghosts). Runs in `rideWorker.ts` so timers keep going in background tabs. `RideController.ts` bridges worker, trainer, OPFS log (`wal.ts`) and API. |
| — HUD | `apps/web/src/hud` | Workout graph, stage profile, minimap, route widgets, audio cues; numbers written straight to the DOM on fixed ticks. |
| — 3D world | `apps/web/src/world` | `VeloraRenderer` (three.js, own frame loop) loaded lazily by `WorldView`. |
| — Real roads | `apps/web/src/realroad` | GPS import → worker prepares and bakes the route with elevation tiles (Mapterhorn / AWS terrain). |
| — Radio | `apps/web/src/radio` | One shared player (`<audio>`, hls.js lazy-loaded for HLS), station finder, in-ride menu. |
| — Design system | `apps/web/src/design` | Tailwind v4 theme tokens, primitives (Button, Card, Label…), self-hosted fonts, generated Material Symbols icons. |
| — Public pages | `apps/web/src/screens/{Landing,Login,Privacy,Attributions,ResetPassword}.tsx`, `src/landing` | Marketing and legal pages, own SVG art. |
| **API** | `apps/api` | Hono app shared by Node (`server.ts`) and Cloudflare Workers (`worker.ts`). Auth middleware, per-rider data, rides, workouts, progress, routes, radio proxy, Strava, intervals.icu, migrations. |
| **Shared package** | `packages/shared` | Types and pure helpers used by both sides: physics (speed from power), metrics (NP, TSS, IF, best efforts), workout model and stress estimate, FIT encoder and FIT workout decoder, units. |
| **World package** | `packages/world` | Velora data model, road splines, terrain, validation (the build fails on bad gradients), route profiles at 5 m, illustrated map, the 3D bake CLI, real-road pure steps. |
| **Content** | `content/` | `world/velora/world.json` (single source of truth for the island), `workouts/library.json` + `plans.json`, `real-roads/*.gpx` + `catalog.json`, `ATTRIBUTIONS.md`. |
| **Plans and design** | `plan/`, `design/` | `PLAN.md` (spec and owner decisions), `PROGRESS.md` (hand-off log), design references. |
| **CI/CD** | `.github/workflows/deploy.yml` | Tests every push / PR; deploys `main` to Cloudflare. |

### 3.3 Technology

| Layer | Choice |
|---|---|
| Web | Vite 8, React 19, TypeScript, Tailwind CSS 4, react-router 8, zustand 5, three.js 0.170, AG Grid 36 (data grids), hls.js |
| API | Hono 4, node-postgres 8, jose (JWT verification), Node 22 locally / Cloudflare Workers (`nodejs_compat`) in production |
| Database | PostgreSQL (local Postgres for development, Supabase Postgres in production) |
| Auth | Supabase Auth (e-mail + password, Google); tokens verified in the API against the project's public JWKS (ES256) |
| Hosting | One Cloudflare Worker: static assets + API, Hyperdrive to Postgres, cron trigger |
| CI/CD | GitHub Actions |
| Tooling | pnpm 11 workspaces, Vitest, wrangler 4 |

---

## 4. Data flow

### 4.1 Signing in and calling the API

```mermaid
sequenceDiagram
  participant B as Browser (supabase-js)
  participant S as Supabase Auth
  participant W as Worker /api
  participant D as Postgres
  B->>S: e-mail + password, or Google OAuth
  S-->>B: session (access token, refresh token)
  B->>W: fetch /api/profile with Authorization: Bearer token
  W->>S: JWKS (cached) to verify signature, issuer, audience
  W->>D: select profile where auth_user_id = token.sub
  D-->>W: profile (or none yet)
  W-->>B: 200 profile / 404 "no profile yet"
  Note over B,W: 404 on first visit → the app creates a profile (Google name if available)
```

- **One place adds the token:** `apps/web/src/app/auth.ts` wraps `window.fetch`; every `/api/*` call gets the current
  access token (refreshed automatically). A 401 signs the rider out.
- **Every query is scoped:** `apps/api/src/auth.ts` resolves the rider's profile once per request (AsyncLocalStorage);
  every route filters by `profile_id`. Another rider's ride or workout returns 404, not 403.
- **Public API paths:** `/health` only. Strava redirects back to the web app (`/settings/connections`), which posts the code to the signed-in `POST /strava/oauth/complete`; the API checks the HMAC-signed state names the caller's own profile before talking to Strava.
- **Optional invite list:** `ALLOWED_EMAILS` turns open sign-up into a closed beta (403 for others).
- **Local mode:** with no `SUPABASE_URL` the API serves the single local profile with no login.

### 4.2 A ride, second by second

```mermaid
flowchart LR
  T["Trainer / sensors"] -- notifications --> DM["DeviceManager"] --> TEL["telemetry snapshot"]
  TEL --> RC["RideController (main thread)"] -- input --> WK["rideWorker: core.step() at 20 Hz"]
  WK -- "snapshot, trainer command (ERG W / grade)" --> RC
  RC -- "setTargetPower / setSimulation" --> DM --> T
  RC -- "every second" --> WAL[("OPFS ride-ID.ndjson")]
  RC -- "every 30 s: POST /api/rides/:id/samples" --> API["API"] --> RS[("ride_sample rows")]
  WK --> HUD["HUD + 3D world"]
```

- **Speed is ours, not the trainer's.** `packages/shared/src/physics.ts` computes speed from power, mass, gradient, air
  and rolling resistance.
- **Trainer commands** go through a serial GATT queue with timeouts and retries; FTMS commands resolve only when the
  trainer confirms on the control point.
- **Lost devices:** if the trainer powers off, tiles it fed turn "lost" and reconnect attempts time out after 10 s.
- **Batching:** samples go to the server every 30 s (keeps 100 riders inside free request limits); the OPFS log holds
  every second in between.

### 4.3 Crash recovery

1. Every second of a ride is appended to an OPFS file in the browser (`apps/web/src/engine/wal.ts`).
2. If the tab crashes or reloads, the next start finds the file and offers **Resume ride**, **Save and finish** or
   **Discard** (`RecoveryDialog.tsx`).
3. On a shared computer the log belongs to the browser, not the account, so the dialog only offers rides the server
   confirms belong to the signed-in rider.
4. The file is deleted once the server acknowledges the finished ride.

### 4.4 Finishing a ride

1. `PATCH /api/rides/:id { status: 'done', ftp }` — the API loads all samples, computes the summary
   (`packages/shared/src/metrics.ts`: NP, TSS, IF, zones, best efforts), segment efforts and personal records.
2. The samples move from `ride_sample` rows into **one gzipped, column-oriented JSON document** (`archive.ts`) — about
   a quarter of the row size, so a free 500 MB database lasts. Production can store these in R2; until R2 is switched
   on they go in the `ride_archive` table.
3. Progress (XP, levels, badges, weekly goal, streaks) is recalculated from ride history.
4. If Strava is connected and auto-upload is on, an upload is queued.
5. `GET /api/rides/:id/fit` builds a FIT file on demand (own encoder, no proprietary SDK).

### 4.5 The world, routes and real roads

- **Velora** is generated from `content/world/velora/world.json`: splines, terrain, validation and a 5 m route profile
  per route (`packages/world`). The 3D terrain is pre-baked into chunks (`apps/web/public/world/velora/`) by
  `pnpm --filter @myfitbike/world bake` and shipped as static files.
- **Gradients the trainer receives come from the same profile** the HUD shows; validation fails the build on any
  impossible gradient.
- **Real roads:** a GPX / TCX / FIT file is parsed in the browser, prepared in a worker (resampling, smoothing,
  elevation from public terrain tiles), saved via `POST /api/real-routes`, then baked for 3D on demand.

### 4.6 Radio

The API proxies **radio-browser.info** (open, community-run directory) for countries, tags and search, with gzip; picking
a country loads its full station list and filtering happens in the browser. Audio streams come straight from each
station to the browser; HLS stations use hls.js.

### 4.7 Strava and intervals.icu

- **Strava (opt-in, off by default):** `GET /api/strava/oauth/url` returns the authorisation link with an HMAC-signed
  state naming the rider; the callback stores encrypted tokens (`TOKEN_ENCRYPTION_KEY`). Uploads go into
  `strava_upload` and a queue processes them (5 s timer on Node, cron every minute on Workers). Needs Strava keys.
- **intervals.icu:** the rider stores an API key (encrypted); `POST /api/intervals/sync` imports planned workouts.

---

## 5. Data model

PostgreSQL, created by forward-only migrations in `apps/api/src/db/migrations/` (run in name order, each in a
transaction, recorded in `schema_migrations`).

| Table | Holds | Key columns |
|---|---|---|
| `profile` | One per rider | `id`, `auth_user_id` (Supabase user, unique), `email`, `name`, `weight_kg`, `bike_weight_kg`, `ftp_w`, `max_hr`, `resting_hr`, `units`, `avatar` (json), `country`, `setup_complete` |
| `settings` | Key/value preferences per rider | `profile_id`, `key`, `value` (json) — see [Settings keys](#7-settings-keys) |
| `device` | Remembered Bluetooth devices | `profile_id`, device id, kind, name |
| `zone_set` | Power / HR zone definitions | `profile_id` |
| `ride` | One per ride | `id`, `profile_id`, `started_at`, `ended_at`, `mode`, `name`, `status` (recording / done / discarded), `simulator`, `summary` (json), `workout_id`, `route_id` |
| `ride_sample` | Per-second samples while recording | `ride_id`, `t`, power, cadence, hr, speed, distance, alt, grade, target, step |
| `ride_archive` | Finished rides' samples, gzipped | `ride_id`, `n`, `samples_gz` (bytea) |
| `best_effort` | Personal records (5 s … 60 min) | `profile_id`, duration, watts, ride |
| `segment_effort` | Times on climbs/segments | `profile_id`, segment, ride, time |
| `workout` | Imported / custom workouts | primary key (`profile_id`, `id`), steps (json) |
| `real_route` | Imported GPS routes | `profile_id`, name, track and profile data |
| `strava_account` | Encrypted Strava tokens | `profile_id`, athlete, tokens |
| `strava_upload` | Upload queue and results | `ride_id`, status, Strava activity id |

**Row-level security** is on for every table with no policies (migration `011`), so Supabase's own Data API — callable
with the public key — sees nothing. The app reaches the database only through its API, as the table owner.

---

## 6. API reference

All paths are under `/api` on the site (the Node dev server serves them at the root). JSON in and out. Everything except
`/health` and the Strava callback needs `Authorization: Bearer <Supabase access token>` when accounts are on.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check (public) |
| GET / PUT | `/profile` | Read / create-or-update the rider's profile (404 until one exists) |
| GET | `/settings` | All settings with defaults filled in |
| PUT | `/settings/:key` | Save one setting |
| GET / POST | `/devices` | Remembered devices |
| GET | `/rides` | Ride list |
| POST | `/rides` | Start a ride → `{ id }` |
| GET | `/rides/recording` | Rides still recording (recovery) |
| GET | `/rides/:id` | Ride with summary and samples |
| POST | `/rides/:id/samples` | Append a batch of samples (a repeated second is ignored, so re-sends after a crash are safe) |
| PATCH | `/rides/:id` | Finish (`status: done`) or discard |
| DELETE | `/rides/:id` | Delete a ride |
| GET | `/rides/:id/fit` | FIT file download |
| GET / POST / DELETE | `/workouts`, `/workouts/:id` | Imported and custom workouts |
| GET | `/progress` | XP, level, badges, weekly goal, streak |
| GET | `/analytics` | Weekly load, records, FTP history |
| GET | `/routes/:id/ghost` | Best and last ride on a route, for the ghost |
| GET | `/routes/:id/rides` | Past rides on a route |
| GET | `/segments/:id/best` | Best time on a segment |
| PUT | `/dev/world` | Save `world.json` (Node development only) |
| GET / POST | `/real-routes` | List / save imported routes |
| GET / PUT / DELETE | `/real-routes/:id` | One imported route |
| GET | `/radio/countries`, `/radio/tags`, `/radio/search` | Station directory (radio-browser.info proxy) |
| POST | `/radio/click/:uuid` | Count a play, return the freshest stream URL |
| GET | `/strava/status` · `/strava/oauth/url` | Strava link (when configured) |
| POST | `/strava/oauth/complete` | Finish the Strava link: `{ code, state, scope }` from Strava's redirect; the state must be the caller's |
| PATCH / DELETE | `/strava/settings` · `/strava` | Auto-upload setting · disconnect |
| POST | `/strava/uploads` | Queue an upload |
| GET / PUT / DELETE | `/intervals/status` · `/intervals/key` | intervals.icu link |
| POST | `/intervals/sync` | Import planned workouts |

---

## 7. Settings keys

Stored per rider in `settings`; defaults in `packages/shared/src/index.ts` (`DEFAULT_SETTINGS`).

| Key | Meaning |
|---|---|
| `trainer.difficultyUpPct` / `trainer.difficultyDownPct` | How much of the real gradient the trainer applies uphill / downhill |
| `ride.autoPauseDelayS` | Seconds without pedalling before auto-pause |
| `hud.preset`, `hud.size`, `hud.widgets`, `hud.profileStrip` | HUD layout |
| `display.powerAveraging` | Smoothing of the live power number |
| `graphics.quality`, `graphics.camera` | 3D quality and default camera (1–6) |
| `goal.weeklyHours` | Weekly riding goal |
| `audio.interface` | Interface sounds |
| `radio.favourites`, `radio.volume` | Radio |

---

## 8. Repository layout

```
.
├── apps/
│   ├── web/                      React app (Vite)
│   │   ├── index.html            page shell + link-preview tags
│   │   ├── public/               favicon, share image, landing screenshots, baked world chunks
│   │   └── src/
│   │       ├── app/              routing, shell, store, api client, auth, recovery
│   │       ├── devices/          Bluetooth: DeviceManager, FTMS, FE-C, simulator, codecs
│   │       ├── engine/           ride engine core, worker, controller, OPFS log
│   │       ├── hud/              in-ride widgets and audio cues
│   │       ├── world/            three.js renderer and host
│   │       ├── realroad/         GPS import, elevation tiles, bake worker
│   │       ├── radio/            radio player, finder, ride menu
│   │       ├── formats/          ZWO / ERG / MRC workout import
│   │       ├── design/           theme, primitives, fonts, icons
│   │       ├── landing/          public-page pieces and art
│   │       └── screens/          one file per page
│   └── api/                      Hono API
│       ├── wrangler.toml         Cloudflare Worker config (assets, routes, Hyperdrive, cron)
│       └── src/
│           ├── app.ts            app factory: middleware, profile, settings, devices, route mounting
│           ├── auth.ts           token verification, per-request rider, profile resolver
│           ├── rides.ts          rides, samples, finish, FIT, workouts
│           ├── archive.ts        gzipped sample archive (Postgres or R2)
│           ├── routes.ts         segments, ghosts, world save (dev)
│           ├── progress.ts       XP, badges, analytics
│           ├── realRoutes.ts     imported routes
│           ├── radio.ts          radio-browser.info proxy
│           ├── strava.ts         Strava OAuth, uploads, queue
│           ├── intervals.ts      intervals.icu sync
│           ├── server.ts         Node entry (local)
│           ├── worker.ts         Cloudflare Workers entry (production)
│           └── db/               migrate.ts + migrations/*.sql
├── packages/
│   ├── shared/                   physics, metrics, workouts, FIT, units, types
│   └── world/                    Velora model, terrain, splines, validation, bake CLI
├── content/                      world.json, workouts, plans, real-road GPX, attributions
├── docs/screenshots/             images used in this README
├── plan/                         PLAN.md (spec + decisions), PROGRESS.md (hand-off log)
├── design/                       design references
├── spikes/                       early experiments (not shipped)
└── .github/workflows/deploy.yml  CI/CD
```

---

## 9. Setup

### 9.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 | |
| pnpm | 11 (`packageManager` pins 11.5.2) | `corepack enable` installs the right one |
| PostgreSQL | 15+ (developed on 18) | two databases: `myfitbike` and `myfitbike_test` |
| Browser | Chrome or Edge (desktop or Android) | Web Bluetooth is needed to pair real devices; the demo trainer works anywhere |

### 9.2 Run it locally (single rider, no login)

```bash
git clone <repository-url>
cd myfitbike
pnpm install
createdb myfitbike
createdb myfitbike_test
cp apps/api/.env.example apps/api/.env      # defaults point at localhost; leave SUPABASE_URL empty
pnpm --filter @myfitbike/api migrate
pnpm dev                                    # API on :8787, web on http://localhost:5173
```

Open http://localhost:5173. With `SUPABASE_URL` and the `VITE_SUPABASE_*` values empty, the app has no login and
serves one local profile. Open **Sensors** (or **Connect Trainer** in the top bar) and choose **Demo trainer** to ride without hardware.

### 9.3 Run it locally with accounts

1. Create a Supabase project (free tier is enough).
2. `apps/api/.env`: `SUPABASE_URL=https://<ref>.supabase.co`
3. `apps/web/.env.local` (copy from `.env.example`): `VITE_SUPABASE_URL` (same URL) and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API Keys → *Publishable key*, `sb_publishable_…`).
   Never use the secret / service-role key.
4. Supabase → Authentication → URL Configuration: add `http://localhost:5173/**` to Redirect URLs.
5. Restart `pnpm dev`. The first account to sign in takes over the existing local profile
   (`CLAIM_LOCAL_PROFILE=true`); later accounts start fresh.

### 9.4 Tests, type checks and builds

```bash
pnpm typecheck                             # all packages
pnpm test                                  # 150 tests: shared 29, world 18, web 66, api 37 (api uses myfitbike_test)
pnpm --filter @myfitbike/web build         # production web build → apps/web/dist
pnpm --filter @myfitbike/world bake        # rebuild the Velora 3D chunks after editing world.json
pnpm --filter @myfitbike/api worker:dev    # the production Worker locally on :8788 (needs apps/api/.dev.vars)
```

### 9.5 Environment variables

**API** (`apps/api/.env` locally; Worker vars / secrets in production):

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (8787) | Node API port |
| `DATABASE_URL` | yes (local) | Postgres connection; in production Hyperdrive replaces it |
| `TEST_DATABASE_URL` | for tests | Database the API tests wipe and migrate |
| `SUPABASE_URL` | for accounts | Turns on sign-in; empty = local single-rider mode |
| `ALLOWED_EMAILS` | no | Comma-separated invite list; empty = open sign-up |
| `CLAIM_LOCAL_PROFILE` | no (true) | Local only: first sign-in takes over the existing profile |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | for Strava | From strava.com/settings/api |
| `TOKEN_ENCRYPTION_KEY` | for Strava / intervals.icu | 32-byte hex (`openssl rand -hex 32`); encrypts stored tokens and signs OAuth state |
| `WEB_BASE`, `PUBLIC_API_BASE` | Worker | Site origin (CORS, redirects) and public API base (Strava callback) — set in `wrangler.toml` |

**Web** (`apps/web/.env.local`; all browser-safe):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `VITE_API_BASE` | Only if the API lives on another origin |

`.env`, `.env.local` and `.dev.vars` are git-ignored; only the `.env.example` files are committed.

---

## 10. Deployment

### 10.1 Production layout

| Piece | Service | Detail |
|---|---|---|
| Site + API | Cloudflare Worker `myfitbike` | Static assets from `apps/web/dist` with single-page fallback; only `/api/*` runs Worker code. Custom domains `myfitbike.com` and `www.myfitbike.com` (the app moves www to the apex). |
| Database | Supabase Postgres | Reached through **Hyperdrive** `myfitbike-db` (Session-pooler connection string). **Query caching is off** — see [Troubleshooting](#13-troubleshooting). |
| Auth | Supabase Auth | Site URL `https://myfitbike.com`; redirect URLs for myfitbike.com and localhost. |
| Google sign-in | Google Cloud project `myfitbike` | OAuth client "MyFitBike web (Supabase)", redirect URI `https://<ref>.supabase.co/auth/v1/callback`. Consent screen starts in *Testing* (test users only); publish it under Audience to open it to everyone. |
| Ride archive | Postgres `ride_archive` | R2 bucket binding ready in `wrangler.toml`, commented out until R2 is enabled. |
| Scheduled job | Worker cron `* * * * *` | Strava upload queue (no-op until Strava keys are set). |
| DNS | Cloudflare (registrar: Hostinger) | Nameservers point to Cloudflare. |
| Free-tier fit | ~100 riders | Workers 100k requests/day, Supabase 500 MB database + 50k monthly users, GitHub Actions 2,000 min/month. |

### 10.2 First-time setup

1. **Supabase:** create the project; note the URL and publishable key.
2. **Schema:** run the migrations against the production database
   (`DATABASE_URL='<session pooler URL>' pnpm --filter @myfitbike/api migrate`), or paste them into the Supabase SQL
   editor.
3. **Hyperdrive:** `wrangler hyperdrive create myfitbike-db --connection-string='<session pooler URL>'`, then
   `wrangler hyperdrive update <id> --caching-disabled=true`; put the id in `apps/api/wrangler.toml`.
4. **Worker:** `wrangler login`, then build the web app with the `VITE_SUPABASE_*` values and
   `cd apps/api && wrangler deploy`. Add Strava secrets with `wrangler secret put` when needed.
5. **Domain:** add it to Cloudflare, switch the registrar's nameservers, delete any imported parking A/CNAME records,
   then deploy with the `routes` entries in `wrangler.toml`.
6. **Supabase URL configuration:** Site URL and Redirect URLs for the live domain.
7. **Google:** create the OAuth client (web application; JS origins = your domains; redirect = Supabase callback) and
   paste the client ID and secret into Supabase → Sign In / Providers → Google.

### 10.3 Auto-deploy from GitHub

`.github/workflows/deploy.yml`:

```mermaid
flowchart LR
  P["push / pull request"] --> T["test job: Postgres 17 service<br/>pnpm install → typecheck → test"]
  T -->|"main only"| D["deploy job: build web with repo vars<br/>wrangler deploy"]
  D --> S["smoke test: /api/health 200,<br/>/api/profile 401"]
```

| GitHub setting | Kind | Value |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Repository variables | Browser-safe Supabase values |
| `CLOUDFLARE_ACCOUNT_ID` | Repository variable | Cloudflare account id |
| `CLOUDFLARE_API_TOKEN` | Repository secret | Token from the *Edit Cloudflare Workers* template, scoped to the account and the myfitbike.com zone |

A failing test stops the deploy. Feature branches are tested only when opened as a pull request and never deploy.

### 10.4 Database migrations in production

Migrations are **not** run by CI. When a commit adds `apps/api/src/db/migrations/NNN_*.sql`, run it against production
before (or right after) merging:

```bash
DATABASE_URL='<Supabase session-pooler URL>' pnpm --filter @myfitbike/api migrate
```

Add new tables to the row-level-security list (see migration `011`).

---

## 11. Devices and browsers

| | Supported |
|---|---|
| Trainers | FTMS (Fitness Machine Service) — Tacx Flux 2 and most modern smart trainers; Tacx FE-C over BLE on older Tacx firmware |
| Sensors | Heart rate (0x180D), Cycling Speed & Cadence (0x1816), Cycling Power (0x1818); power-match mode when pedals measure power |
| Calibration | FTMS spin-down, guided |
| Browsers | Chrome / Edge on desktop and Android for Bluetooth. Safari, Firefox and iPhone/iPad can browse and use the demo trainer (a banner explains). |
| Screens | Desktop, tablet and phone layouts |

---

## 12. Security and privacy

- **No shared secrets in the browser.** The browser holds only the Supabase publishable key; the API verifies tokens
  with Supabase's public keys.
- **Per-rider isolation** is enforced in every query and covered by `apps/api/src/accounts.test.ts`.
- **Row-level security** blocks Supabase's Data API from reading tables with the public key.
- **Encrypted third-party tokens** (Strava, intervals.icu) with `TOKEN_ENCRYPTION_KEY`; Strava OAuth state is
  HMAC-signed and expires after 15 minutes.
- **Secrets** live in git-ignored env files, Worker secrets and GitHub secrets — never in the repository.
- **Opt-in sharing:** nothing goes to Strava until the rider connects it.
- The privacy policy page is a draft pending the owner's review.

---

## 13. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| New rider stuck on "Reconnecting…", profile save returns 500, renames don't stick | Hyperdrive query caching returns stale rows right after writes | `wrangler hyperdrive update <id> --caching-disabled=true` |
| Site returns Cloudflare error 1042 after adding a custom domain | wrangler turns `workers_dev` off when `routes` are set | `workers_dev = true` in `wrangler.toml` |
| Custom domain deploy fails: "already has externally managed DNS records" | Parking records imported from the old DNS host | Delete the A/CNAME records for `@` and `www` in Cloudflare DNS |
| After Google or e-mail sign-in the browser lands on `localhost:3000` | Supabase Site URL / Redirect URLs not set | Authentication → URL Configuration |
| "Unsupported provider: provider is not enabled" | Google provider off in Supabase | The login page hides the button until it is enabled |
| "Too many attempts" on sign-up | Supabase's built-in mailer sends only a few e-mails per hour | Configure custom SMTP before launch; create test users in the dashboard with *Auto Confirm* |
| "Email address is invalid" | Supabase rejects domains that can't receive mail (`test.com`) | Use a real inbox or `you+tag@gmail.com` |
| Domain still shows the old site on your Mac | Local DNS cache | `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` |
| Link previews blank in WhatsApp | Missing Open Graph tags (fixed) or WhatsApp's cache | Share a fresh link, e.g. `?v=2` |
| Calibrate does nothing | Trainer doesn't support FTMS spin-down | Use the manufacturer's app |

---

## 14. Licences, attributions and further reading

- **Licence:** public domain under [The Unlicense](LICENSE) — MyFitBike's own code, content and graphics carry no
  copyright; anyone may copy, change, sell or reuse them for any purpose. Third-party libraries, fonts, icons and data
  keep their own licences.
- **Third-party assets and data:** see [`content/ATTRIBUTIONS.md`](content/ATTRIBUTIONS.md) (fonts under SIL OFL,
  Material Symbols under Apache-2.0, terrain tiles, GPX sources and more). Only CC0 or similarly permissive assets are
  used; no other product's branding, names, maps or artwork.
- **Specification and decisions:** [`plan/PLAN.md`](plan/PLAN.md) — sections 16 (owner decisions) and 17 (publishing).
- **Progress and hand-off log:** [`plan/PROGRESS.md`](plan/PROGRESS.md).
