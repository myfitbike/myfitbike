# Google Stitch prompts — VeloWorld

How to use
1. Create one Stitch project, set to **Web / desktop**, 1440 x 900.
2. Paste **Batch 0** first. It sets the design system; every later batch assumes it.
3. Paste the batches in order, one per generation. If a batch produces weak results, split it
   and paste one screen at a time, keeping the "Global rules" paragraph at the top.
4. You may attach images from `plan/reference/` to a batch as layout references (suggested
   files are named per batch). Always keep the line "do not copy branding" in the prompt.
5. Stitch cannot draw the 3D world. Ride screens use a full-bleed photo placeholder; only the
   overlay matters.
6. Export to Figma or HTML when done and save into `plan/design/`. The implementation uses
   Tailwind, so ask Stitch for Tailwind-friendly HTML where it offers the choice.

Global rules (repeat at the top of any batch you paste on its own)
> Desktop web app, 1440x900, dark blue-slate theme with soft plum and teal background
> glows, frosted glass buttons and amber highlights. Product name "VeloWorld", a solo indoor cycling app
> for a smart bike trainer. Original branding only: do not copy the logos, names, colours or
> artwork of Zwift, Rouvy, Tacx or Garmin. No social features: no friends, chat, events or
> leaderboards of other people. Use the design system from the first prompt.

---

## Batch 0 — Design system

```
Create a design system and a component sheet for "VeloWorld", a desktop web app for solo
indoor cycling on a smart trainer. Dark, immersive, game-like, premium. Readable from two
metres away on a laptop or TV.

Mood (see attached reference 21 for the atmosphere and button treatment only)
Calm, soft, atmospheric and premium, not neon and not flat black. Low saturation
everywhere except data colours.

Background
- Base is a deep blue-slate, #262C3A at the top fading to #1E2633 at the bottom.
- Over it, two very large, heavily blurred colour glows at about 25% opacity: a plum glow
  #6B3A5C in the top-right corner and a teal glow #1F6F86 in the lower-right. They should
  read as soft light, with no visible edges. Every non-ride screen uses this background.

Surfaces and buttons
- Frosted glass: white at 10% opacity with background blur and no heavy border. Hover is
  white at 16%, selected is white at 22% and looks slightly raised.
- Standard button: frosted glass rectangle, 8px radius, bold uppercase white label with
  slight letter spacing, generous horizontal padding.
- Primary button: same shape filled with accent amber #F2C14E and dark slate text.
- Chips and filters: fully rounded pills with a 1px white outline at 35% opacity, no fill,
  white label, optional small "+" icon. Selected chip gets the frosted fill.
- Callout / highlight: pill with a 1px amber outline, amber bold text, transparent fill.
- Date or tab selector: plain text items; the selected one sits on a frosted raised tile.
- Segmented toggle: frosted track with a lighter frosted thumb.
- Dividers: 1px white at 12% opacity.

Colours
- Text primary #FFFFFF, secondary #A9B1BE, muted #7C8594.
- Accent amber #F2C14E for primary actions, highlights and callouts. Use it sparingly:
  at most one amber element per region of the screen.
- The rider's own marker is solid white with an amber ring, so it never clashes with
  zone or gradient colours.
- Connected / informational state: soft teal #5BC0D4. Success #5FD39A, warning #F2C14E,
  danger #F0787A (soft, not pure red).
- Power zone colours, used everywhere a zone appears:
  Z1 grey #8A94A0, Z2 blue #3B8BFF, Z3 green #35D07F, Z4 yellow #FFD23F,
  Z5 orange #FF8A3D, Z6 red #FF4D4D, Z7 purple #A259FF.
- Gradient colours for road steepness: under 3% green, 3-6% yellow, 6-9% orange,
  9-12% red, above 12% dark red #8E1B1B, downhill sky blue.

Typography
- Display and all live numbers: a condensed, bold, slightly italic sans (Barlow Condensed
  style) with tabular figures. Units are small caps beside the number.
- UI text: Inter. Section labels are uppercase with wide letter spacing.

Shapes and surfaces
- Cards are frosted glass with 12px radius. On ride screens, HUD panels are dark slate
  #1E2633 at 55% opacity with background blur, so they stay readable over bright scenery.
  Icon buttons are 48px frosted circles.
- 8px spacing grid, generous whitespace, left-aligned lists with small secondary labels
  above bold items.

Show on one sheet: colour swatches, type scale, primary / secondary / ghost / danger
buttons, icon buttons, tabs, segmented control, slider, toggle, dropdown, text input,
a metric tile (big number + unit + label), a zone bar (7 coloured segments with a marker),
a workout block graph (bars coloured by zone), a route card (photo, name, distance, ascent,
difficulty chip, mini elevation profile along the bottom edge), a workout card (block graph
as thumbnail, name, duration, stress score), a sensor status chip (icon + coloured dot),
a badge, a progress ring, a toast, and a modal.
```

---

## Batch 1 — App shell and Home
Reference images: 6, 7, 10.

```
Design the Home screen of VeloWorld using the existing design system.

Shell (appears on every non-ride screen)
- Left vertical icon rail, 88px wide: logo at top, then Home, Routes, Workouts,
  Training Room, Activities, Search, and Settings pinned at the bottom. Icon above a small
  label; the active item has a amber pill behind it.
- Top status bar: rider avatar and name, level badge with an XP progress bar and
  "140 XP to level 8", a weekly goal ring "3h 10 / 5h", and on the right a group of four
  sensor status icons (trainer, power, cadence, heart rate), each with a green dot when
  connected or a red dot when not. A "Connect trainer" pill appears when the trainer is not
  connected.

Home content
- Row 1: two large hero cards side by side. Left "Recommended plan": plan name, one line of
  description, "6 weeks", "3 rides / week", Continue button. Right "Recommended workout":
  workout name, "45 min", stress score, and its zone-coloured block graph drawn large.
- Row 2 "Quick start": three wide tiles. "Just Ride" (free ride), "Start Power" (hold a
  target wattage, bolt icon), "Start Slope" (ride a set gradient, mountain icon).
- Row 3 "Continue riding": horizontal row of route cards.
- Row 4 "Explore Velora": a wide banner showing a strip of the illustrated island map with
  three region chips, next to a row of route cards with region names.
- Row 5 "This week": small stats strip with distance, time, ascent, stress score and a
  7-day bar chart.
```

---

## Batch 2 — Pairing and first run
Reference images: 8, 20.

```
Design two screens for VeloWorld using the existing design system.

Screen A "Sensors"
- Title "Sensors" and a one-line hint: "Close other cycling apps so they release the trainer."
- Top row of four live value tiles: WATTS, KM/H, RPM, BPM. Show two filled with numbers and
  two showing dashes.
- Below, five large device tiles in a row: "Controllable trainer" (Tacx Flux 2),
  "Power source" (Tacx Flux 2), "Cadence" (Garmin Cadence Sensor 2), "Heart rate"
  (Garmin HRM), and "Speed" shown greyed out with the note "Not needed on a direct-drive
  trainer". Each tile has a big icon, the device name, signal bars, a live
  value, and a state: Connected (sky blue tile with a check), Searching (amber outline with a
  spinner and a "Search" button), Not found (grey with "Retry").
- A trainer detail card: device illustration placeholder, name "Tacx Flux 2", small
  capability icons (Bluetooth, power, speed, cadence, resistance control), firmware line,
  and buttons "Calibrate" and "Disconnect".
- Under "Other devices": a "Demo trainer" row with the text "Ride without hardware".
- Footer: primary button "Continue", ghost button "Just look around".
- A collapsed "Trouble connecting?" checklist.

Screen B "Welcome" (first run, three-step wizard shown as one screen with a stepper)
- Step 1 Profile: name, weight, bike weight, units toggle metric / imperial.
- Step 2 Fitness: FTP input with helper "I don't know — schedule a ramp test", max heart rate.
- Step 3 Connect: compact version of the device tiles.
- Stepper at top, Back and Next buttons at bottom right.
```

---

## Batch 3 — Routes
Reference images: 10, 11.

```
Design three screens for VeloWorld using the existing design system and app shell.

Screen A "Routes" browser
- All routes are in "Velora", the app's own imaginary island world. No real countries.
- Tabs: World, Routes, Collections, Search. The Routes tab is shown here.
- Filter row: region dropdown, distance range slider, ascent range slider, difficulty chips
  (Easy, Moderate, Hard, Extreme), sort dropdown.
- Left 60%: grid of route cards (photo, name, country, distance, ascent, difficulty chip,
  mini elevation profile on the bottom edge, small "ready offline" icon on some).
- Right 40%: the illustrated island map (see Screen D) with the hovered card's route drawn
  as a glowing amber line and the other roads faint.
- Region names to use: Port Anchor, Saltmarsh Flats, Greenfold Downs, Stonebridge, Tealeaf
  Terraces, Emberfall Canyon, Whisperwood, Mount Solace, Glasswater Fjord, Cinder Isle.
- Route names to use: Harbour Spin, Lagoon Lap, Downs Rollers, Cobble Crown, Tea Trail,
  Red Mesa, Forest Ribbon, Solace Summit, Fjord Run, Cinder Rim, Three Peaks.

Screen B "Collections"
- Grid of collection cards, each a tall illustrated card with a title such as "Flat and
  fast", "Climbs", "Rolling", "Short and sharp", "Epics", showing total distance, total
  ascent and number of routes.

Screen C "Route detail" for "Solace Summit"
- Wide hero illustration of an alpine road to a snowy summit with route name, region
  "Mount Solace" and difficulty chip; a favourite icon.
- Stats row: distance, ascent, average gradient, max gradient, estimated time at your FTP.
- A crop of the illustrated island map with the route line, a start pin and a finish pin.
- Below it a full-width filled elevation profile coloured by gradient, with climb banners
  (category, length, average gradient) and two draggable handles labelled "Select a section".
- Tabs "Course" and "My activities"; the second lists past rides with date, time and
  average power.
- Action bar: primary "Start ride", secondary "Ride with workout", "Ride against my best",
  "Add pacer", and a "Reverse direction" toggle.

Screen D "World" (the World tab) — reference images 22 and 23 for the map idea only;
draw an original island, do not reproduce any existing game map
- Full-width illustrated top-down map of an imaginary island called Velora, in a flat,
  layered vector style that sits well on the dark slate theme: deep navy sea with two
  lighter teal depth bands near the coast, a sandy shoreline, and land coloured by region.
- One large main island with a varied coastline and two small islands. Regions, each with
  its own muted colour and a small label in spaced uppercase:
  Port Anchor (harbour town on the south coast, small lighthouse icon),
  Saltmarsh Flats (pale green lagoon with causeways),
  Greenfold Downs (soft green farmland),
  Stonebridge (walled town on a hill),
  Tealeaf Terraces (banded dark-green terraced hills),
  Emberfall Canyon (terracotta desert with mesas in the east),
  Whisperwood (deep green forest),
  Mount Solace (grey rock with a white snow cap and a winding hairpin road, centre north),
  Glasswater Fjord (a long narrow inlet in the north-west with a bridge),
  Cinder Isle (a small dark volcanic island with a crater lake, joined by a causeway).
- A connected road network drawn as thin light lines with small junction dots; one
  selected route is highlighted in amber with direction chevrons. Small icons for start
  arches, sprint segments, climb segments and landmarks.
- Left overlay panel (frosted glass): the selected region's name, a one-line description,
  terrain chips (Flat, Rolling, Climb, Cobbles, Gravel), and a list of 4 routes through it
  with distance, ascent and a mini profile.
- Top-right: a legend toggle and zoom buttons. Bottom-right: a "You were last here" pin.
- Bottom strip: region chips to jump around the map, and a primary button "Free ride from
  Port Anchor".
```

---

## Batch 4 — Workouts and Training Room
Reference images: 6, 12, 13, 14.

```
Design four screens for VeloWorld using the existing design system and app shell.

Screen A "Workouts" library
- Top: two big quick tiles "Power control" (bolt icon, "hold a wattage") and
  "Slope control" (mountain icon, "ride a gradient").
- Category tiles in a row, each with a small block graph and a count: Getting started,
  Endurance, Sweet spot and tempo, Threshold, VO2 max, Sprints, Climbing, Recovery.
- Filter chips for duration (under 30, 30-60, 60-90, over 90 min) and intensity.
- Grid of workout cards: zone-coloured block graph as the thumbnail, name, duration,
  stress score, intensity factor.
- Buttons top right: "Import file" and "Build workout".

Screen B "Workout detail"
- Large zone-coloured block graph across the full width with a time axis and an FTP line.
- Left: description and coach notes. Right: step table (zone chip, duration, target watts,
  target cadence) and totals. Buttons "Start", "Start on a route", "Edit a copy".

Screen C "Workout builder"
- A timeline canvas where blocks are bars whose height is percent of FTP and colour is the
  zone. One block is selected, showing drag handles.
- Left palette of block types: Warm-up ramp, Steady, Intervals, Ramp, Free ride, Cool-down,
  Text cue.
- Right inspector for the selected block: duration, target type (percent FTP, watts, slope,
  heart rate), value, cadence, repeat count.
- Header with editable name, live totals (duration, stress score), Save and Export buttons.

Screen D "Training Room"
- Tabs: Challenges, Tests, Training plans.
- Challenges tab shown: "Multi-stage challenges" cards (badge art, title, "Ride 7 alpine
  climbs in 21 days", progress bar 3/7) and "Monthly badges" cards (distance, ascent, ride
  count, each with a progress ring).
- A "Tests" strip below with four cards: Ramp test, Ramp test by FTP, 20-minute test,
  60-minute test, each with its block graph and duration.
```

---

## Batch 5 — Ride screen, "Broadcast" HUD (default)
Reference images: 2, 4.

```
Design the in-ride screen of VeloWorld, "Broadcast" layout, using the existing design
system. Full-bleed background: a photo-realistic placeholder of an alpine road seen from
behind a single road cyclist in the lower centre. No app shell. All HUD panels are
translucent blurred ink; keep the top-centre and middle of the screen clear.

Bottom-left cluster
- Amber bolt icon and a very large italic number "217" with "W", a small "AVG 198" beside it.
- Under it a slim zone bar showing the current zone "Z4" highlighted.
- Under that a row of three metrics: speed "19.7 km/h", heart rate "140 bpm" with a small
  zone chip, cadence "80 rpm".

Bottom-centre
- A wide elevation profile of the whole route coloured by gradient, a amber rider pin at the
  current position, two smaller translucent pins labelled "PB" and "Pacer".
- Under it: "8.45 km → 14.52 km" and "111 m → 202 m" (done → remaining).

Bottom-right
- "Upcoming gradient" mini panel: a short coloured ramp of the next 500 m with a pin, a
  large "+3.2 %" and the climb name.

Top-left
- "On the road" list, 5 rows: Personal best (-0:12), Last ride (+0:20), Pacer 3.0 W/kg
  (+0:05), You (highlighted amber row, 3.1 W/kg), Pacer 2.5 W/kg. Each row has an icon,
  watts per kilo and gap.

Top-right
- Elapsed time "00:15:27" with "→ 00:42:10" estimated finish, a level chip "+54 XP", and
  round icon buttons: map, view switch, menu.

Right middle
- "Climb segment" panel: climb name, "4.69 km", "487 m", a live timer, and three rows
  comparing Now, Personal best and 30-day best with time differences.

Also show a second variant of the same screen at the start of a climb: a centred banner
"CLIMB START — Col d'Example, 8.2 km at 7.4 %" and a translucent ghost rider label
"Personal best" floating ahead on the road.
```

---

## Batch 6 — Ride screen, "Cockpit" and "Focus" HUDs
Reference images: 15, 16, 18 for Cockpit; 9 for Focus.

```
Design two more in-ride layouts for VeloWorld using the existing design system. Same
full-bleed road photo placeholder as before.

Layout "Cockpit"
- Top-left power tile: bolt icon, large "245 W", a thin zone-colour bar, then four small
  slots in a 2x2 grid: cadence, heart rate, average power, watts per kilo.
- Top-centre bar: speed, distance, elevation gained, elapsed time in one row; under it a
  route progress bar with "Lap 1/1" and distance to finish. Attached below, a compact
  gradient-coloured profile of the next 2 km with a "+0.3 %" bubble.
- Top-right: square minimap (dark top-down map, route line, rider arrow) with the route
  profile along its bottom edge and the route name.
- Left, under the power tile: "Splits" panel (three rows: time, speed, heart rate, power)
  and "Ride stats" panel (best 5 s, 1 min, 5 min, 20 min, weighted power, average speed).
- Right, under the minimap: "On the road" list of ghosts and pacers with gaps.
- Bottom-centre: action bar of 7 square icon buttons: pause, camera, view, screenshot,
  ERG on/off, bias minus, bias plus.

Layout "Focus" (for workouts, no scenery)
- Plain ink background with a soft gradient.
- Row 1: two wide tiles. "Power" with a huge number and a 7-colour zone bar with a marker;
  "Heart rate" with the same.
- Row 2: four tiles: target watts, cadence, speed, time remaining in step.
- Row 3: current step card: "4 min at 105 %", a thick countdown bar, next step preview,
  buttons "Skip" and "+1 min".
- Row 4: full-width workout block graph with the actual power trace drawn over it, an FTP
  dashed line, a rider marker, elapsed and total time at the ends.
- Small controls bottom-right: ERG toggle, bias "-" "100 %" "+", pause.
```

---

## Batch 7 — Workout on route, and 2D views
Reference images: 3, 1.

```
Design three in-ride screens for VeloWorld using the existing design system.

Screen A "Workout on route" (Broadcast layout plus workout)
- Same road photo placeholder.
- Top-left "Steps 3 / 12" list: each row has a zone-colour chip (Z2, Z3, Z6), duration,
  target watts and optional cadence. The active row is taller with a countdown bar "0:31".
- Bottom-left: large "192 W", "AVG 161", zone bar, then speed, heart rate, cadence.
- Bottom-centre: workout block graph coloured by zone with the actual power trace and a
  rider pin at the current time.
- Top-right: "00:15:27 → 00:19:31" and a menu button.
- A centred toast: "Next: 1 min 30 s at 300 W in 3 … 2 … 1".

Screen B "Stage profile" full-screen 2D view (Tour de France broadcast style)
- No photo. Ink background with a subtle topographic pattern.
- A large side-on elevation silhouette of the whole route across the full width, filled and
  coloured by gradient. Distance flags every 5 km, start arch and finish arch icons, summit
  markers with altitude, climb banners showing category (4, 3, 2, 1, HC), length and average
  gradient.
- A amber rider icon on the terrain line with a label "You 3.1 W/kg"; a ghost icon ahead
  labelled "PB -0:12"; a pacer icon behind labelled "+0:05".
- Top strip: route name, distance done → remaining, ascent done → remaining, elapsed time.
- Lower third: a zoomed "next 2 km" profile with gradient numbers per 100 m, and beside it
  the live metrics (watts, heart rate, cadence, speed, gradient).
- Bottom strip: power and heart-rate traces already ridden, aligned to distance.

Screen C "Map" full-screen 2D view
- The illustrated Velora island map (same style as the World screen), zoomed to the
  current area, with the route line (ridden part amber, remaining white), rider arrow,
  ghost and pacer dots, start and finish pins, and a junction ahead showing a small
  "Left / Straight / Right" choice prompt.
- Left overlay: live metrics column. Bottom overlay: slim gradient-coloured profile strip.
- Small controls: north-up / heading-up toggle, zoom, back to 3D.
```

---

## Batch 8 — Ride menu, pause and summary
Reference images: 3, 19.

```
Design three screens for VeloWorld using the existing design system.

Screen A "Ride menu"
- The ride screen dimmed, with a panel sliding in from the right, 420px wide.
- Title "Menu" and a close button. Large rows with icons: Sensors, Settings,
  Customise interface, Switch view, Camera.
- A "Quick settings" block: trainer difficulty slider, power display segmented control
  (3 s / instant), interface volume slider, world volume slider.
- Bottom: primary pill "Pause ride" and danger ghost button "End ride".

Screen B "Paused"
- Centred card over the dimmed ride: "Paused", elapsed time, distance, and three buttons:
  Resume (primary), End and save, Discard (danger, small).
- A banner variant at the top: "Trainer disconnected — reconnecting…" with a spinner.

Screen C "Ride summary"
- Header: route or workout name, date, a row of earned badges and "+320 XP, level 8".
- Hero stats: distance, time, ascent, average power, normalized power, stress score,
  average heart rate, energy.
- Left: map of the route with the elevation profile underneath.
- Right: chart of power, heart rate and cadence over time with zone shading.
- Row of cards: time in power zones (horizontal stacked bar), best efforts table (5 s,
  1 min, 5 min, 20 min with "new record" tags), workout compliance with stars per step,
  climb results versus personal best.
- Footer buttons: Save, Export FIT file, Upload to Strava, Ride again.
```

---

## Batch 9 — Activities and Settings
Reference images: 17, 19, 5.

```
Design three screens for VeloWorld using the existing design system and app shell.

Screen A "Activities"
- Toggle between List and Calendar. List rows: thumbnail map, name, date, distance, time,
  average power, stress score.
- Right column: weekly training load bar chart for 12 weeks, FTP history line chart,
  personal records table, streak counter.

Screen B "Settings"
- Left sub-navigation: Profile, Units, Trainer, Graphics, HUD, Audio, Downloads, Data and
  connections, About.
- Show the "Trainer" page: trainer difficulty slider with an explanation line, separate
  downhill difficulty slider, ERG smoothing toggle, power display (3 s / 1 s / instant),
  "Release ERG at low cadence" toggle, Calibrate button with last calibration date.
- Also show the "Graphics" page as a second frame: quality preset (Low, Medium, High,
  Ultra), resolution dropdown, shadows, view distance slider, time of day slider with a sun
  icon, ground detail (satellite colour on / off), vegetation density slider, post-processing
  toggle, frame-rate counter toggle.

Screen C "Settings → HUD"
- Top: three large preset cards with thumbnails: Broadcast, Cockpit, Focus; one selected.
- Below left: "Power tile" with four slot dropdowns (Slot 1 Cadence, Slot 2 Average power,
  Slot 3 Heart rate, Slot 4 Kilojoules) and "Reset to default".
- Below right: a live preview of the power tile with numbered callouts matching the slots.
- Further down: a checklist of widgets to show or hide (minimap, profile strip, upcoming
  gradient, on-the-road list, segment panel, splits, ride stats) and an
  "Edit layout on ride screen" button.
```
