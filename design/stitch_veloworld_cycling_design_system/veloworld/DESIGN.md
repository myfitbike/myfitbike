---
name: VeloWorld
colors:
  surface: '#0d1320'
  surface-dim: '#0d1320'
  surface-bright: '#333948'
  surface-container-lowest: '#080e1b'
  surface-container-low: '#151b29'
  surface-container: '#191f2d'
  surface-container-high: '#242a38'
  surface-container-highest: '#2f3543'
  on-surface: '#dde2f5'
  on-surface-variant: '#d2c5af'
  inverse-surface: '#dde2f5'
  inverse-on-surface: '#2a303e'
  outline: '#9b8f7c'
  outline-variant: '#4e4635'
  surface-tint: '#f0c04d'
  primary: '#ffe0a3'
  on-primary: '#3f2e00'
  primary-container: '#f2c14e'
  on-primary-container: '#6b4f00'
  inverse-primary: '#785a00'
  secondary: '#71d4e9'
  on-secondary: '#00363e'
  secondary-container: '#319eb1'
  on-secondary-container: '#002f36'
  tertiary: '#87fabe'
  on-tertiary: '#003822'
  tertiary-container: '#69dda3'
  on-tertiary-container: '#00603d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdf9d'
  primary-fixed-dim: '#f0c04d'
  on-primary-fixed: '#251a00'
  on-primary-fixed-variant: '#5b4300'
  secondary-fixed: '#a3eeff'
  secondary-fixed-dim: '#71d4e9'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5a'
  tertiary-fixed: '#85f9bd'
  tertiary-fixed-dim: '#68dca2'
  on-tertiary-fixed: '#002112'
  on-tertiary-fixed-variant: '#005233'
  background: '#0d1320'
  on-background: '#dde2f5'
  surface-variant: '#2f3543'
typography:
  metric-hero:
    fontFamily: Barlow Condensed
    fontSize: 80px
    fontWeight: '700'
    lineHeight: 72px
    letterSpacing: -0.02em
  metric-hero-mobile:
    fontFamily: Barlow Condensed
    fontSize: 52px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  metric-xl:
    fontFamily: Barlow Condensed
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  metric-lg:
    fontFamily: Barlow Condensed
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: 0em
  metric-md:
    fontFamily: Barlow Condensed
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.12em
  metric-unit:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-desktop: 2rem
  margin: 1.5rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes an atmospheric, focused, and high-performance digital environment tailored for solo indoor cycling on smart trainers. It bridges the discipline of athletic telemetry with the escapism of modern ambient gaming.

### Aesthetic Foundation
- **Atmospheric Glassmorphism & Depth:** Deep slate canvas surfaces suspended with luminous ambient atmospheric backdrops. UI elements float as translucent frosted shields rather than solid barriers, preserving game immersion.
- **2-Meter Glanceability:** High legibility under physical exertion. Interfaces are consumed while cadence is high and vision is degraded by physical effort. Data hierarchy prioritizes instantaneous cognitive pickup through high-contrast status and zone coloring set against muted framing.
- **Calm, Premium Restraint:** Free of distracting neon flicker and aggressive gamified clutter. The interface remains calm and focused, utilizing tactile amber cues and low-saturation container backgrounds to maintain focus on the road and cadence.

## Colors

The palette establishes high separation between ambient environmental chrome and instantaneous telemetry metrics.

### Canvas & Atmospheric Surfaces
- **Canvas Gradient:** Vertical blend from `#262C3A` (top) to `#1E2633` (bottom).
- **Ambient Aura Nodes:** Fixed position soft blurs with low saturation:
  - Top Right: Plum Glow `#6B3A5C` (opacity: 0.25, blur: 120px)
  - Bottom Right: Teal Glow `#1F6F86` (opacity: 0.20, blur: 140px)
- **Glass Panel Surface:** `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.12)` with `backdrop-filter: blur(16px)`.
- **Glass Border:** `1px solid rgba(255, 255, 255, 0.10)`.

### Text & Accents
- **Text Primary:** `#FFFFFF` (Peak legibility, metric readouts)
- **Text Secondary:** `#A9B1BE` (Labels, supporting metrics, state text)
- **Text Muted:** `#7C8594` (Inactive units, secondary stamps, grid dividers)
- **Primary Accent (Amber):** `#F2C14E` (Primary interaction targets, progress track heads, position marker ring, focused states)

### System Status
- **Connected / Telemetry Stream:** Soft Teal `#5BC0D4`
- **Success / Target Achieved:** Mint `#5FD39A`
- **Warning / Effort Drifting:** Amber `#F2C14E`
- **Danger / Sensor Disconnected:** Crimson `#F0787A`

### Power Zones (Coggan-standard telemetry)
- **Z1 (Active Recovery):** `#8A94A0`
- **Z2 (Endurance):** `#3B8BFF`
- **Z3 (Tempo):** `#35D07F`
- **Z4 (Threshold):** `#FFD23F`
- **Z5 (VO2 Max):** `#FF8A3D`
- **Z6 (Anaerobic):** `#FF4D4D`
- **Z7 (Neuromuscular):** `#A259FF`

### Elevation Gradients
- **Downhill (<0%):** `#48CAE4`
- **Flat / Gentle (<3%):** `#35D07F`
- **Moderate (3% – 6%):** `#FFD23F`
- **Steep (6% – 9%):** `#FF8A3D`
- **Severe (9% – 12%):** `#FF4D4D`
- **Extreme (>12%):** `#8E1B1B`

## Typography

Typography is split into two operational modes: High-Velocity Telemetry and Structural Interface Navigation.

### Telemetry Typography
- All live athletic outputs (Watts, Cadence, HR, Speed, Gradient) utilize **Barlow Condensed** in italicized weights with `font-variant-numeric: tabular-nums lining-nums`. This prevents horizontal layout jitter during fluctuating output.
- Numbers sit tightly aligned with paired unit tokens. Unit tokens (`metric-unit`) render in `Inter`, all-caps, with positive tracking, placed either baseline-aligned adjacent or superscripted to avoid reading confusion from 2 meters.

### Interface Typography
- Operational elements, profile configuration, routes, and segment menus leverage **Inter**.
- Section markers, card headers, and table identifiers enforce `label-caps` (all uppercase, 12% letter spacing) in `Text Secondary` (`#A9B1BE`) to ensure distinct categorical boundaries without relying on heavy visual lines.

## Layout & Spacing

The layout is built around a HUD (Heads-Up Display) layout model optimized for wide 16:9 displays, external monitors, and TV output.

### Grid Rhythm & Viewport Rules
- **Base Grid:** Strict 8px increment baseline.
- **Viewport Anchor Points:** HUD layouts reserve dynamic center space for the avatar and route visuals, affixing vital data pods to peripheral anchor sectors:
  - Top Bar: Session time, route name, system connectivity status.
  - Top Left: Primary Power & Cadence cluster.
  - Top Right: Heart Rate, Caloric Burn, Elevation profile mini-map.
  - Bottom Center: Workout interval timeline, target zones, and effort bar.
- **TV/Couch Safe Zone:** Outer margins expand to `margin-desktop` (48px / 3rem) to counteract display overscan and maintain peripheral visibility.
- **Breakpoints:**
  - `Desktop (>= 1280px)`: Full 12-column dynamic HUD; persistent live multi-metric pods.
  - `Compact / Laptop (< 1280px)`: Collapsed secondary metrics; prioritized primary wattage/cadence stack.

## Elevation & Depth

Visual hierarchy uses optical layering and backdrops rather than drop shadows.

### Atmospheric Layering
- **Layer 0 (Canvas):** Underlying 3D scene / video rendering engine, overlaid with the base dual-tone gradient `#262C3A` to `#1E2633`.
- **Layer 1 (Sub-HUD Panels):** Frosted glass `rgba(255, 255, 255, 0.06)` with `backdrop-filter: blur(12px)` and a soft 1px perimeter of `rgba(255, 255, 255, 0.08)`. Used for passive route context and telemetry rails.
- **Layer 2 (Primary Telemetry Pods):** Frosted glass `rgba(255, 255, 255, 0.10)` with `backdrop-filter: blur(20px)` and perimeter of `rgba(255, 255, 255, 0.14)`. Used for real-time live performance stats.
- **Layer 3 (Modals & Emergency HUD Overlays):** Solid slate base `#1E2633` with `rgba(255, 255, 255, 0.16)` border stroke and ambient drop glow `0 24px 48px -12px rgba(0, 0, 0, 0.50)`.

### Depth Cues
- Drop shadows are never purely black; they are deep slate ambient bleeds tinted with the background tone: `0 8px 32px 0 rgba(15, 20, 28, 0.45)`.
- Interactive elements receive an inner rim-light effect using an interior stroke: `inset 0 1px 1px 0 rgba(255, 255, 255, 0.15)`.

## Shapes

The design uses balanced rounded geometry that complements the technical, performance-oriented tone without feeling bubbly or toy-like.

- **Cards & Data Modules:** `12px` border radius (`rounded-lg`). Creates clean grouping for multi-stat arrays.
- **Buttons, Field Inputs, & Toggles:** `8px` border radius (`rounded`). Provides structural precision.
- **Circular Action Controls:** Exactly 48px × 48px with a `50%` pill/circle profile for quick touch/click targets during intervals.
- **Rider Position Reticle:** Concentric circles, highlighted by an outer circular ring with a 2px stroke in primary amber `#F2C14E`.

## Components

### Buttons
- **Primary Interactive:** Background `#F2C14E`, text `#1E2633` (Inter SemiBold 14px), 8px corner radius. Padding: `12px 24px`. Hover: Brightness 108%. Active: Scale 0.98.
- **Glass / Secondary:** Background `rgba(255, 255, 255, 0.10)`, text `#FFFFFF`, 1px solid border `rgba(255, 255, 255, 0.15)`. Hover: Background `rgba(255, 255, 255, 0.16)`.
- **48px Circular Icon Button:** 48px × 48px circle, background `rgba(255, 255, 255, 0.08)`, frosted blur, centered icon. Used for Camera Angles, ERG Mode toggles, and Lap triggers.

### Telemetry Pods (Metric Cards)
- Translucent container with 12px border radius. Padding: `16px 20px`.
- Micro-header with `label-caps` in `#A9B1BE`.
- Dynamic metric display in `Barlow Condensed` bold italic. The primary number is tinted with the active Power Zone color (e.g., Z4 Threshold Yellow `#FFD23F`) to communicate status at a glance.
- Unit appended with `metric-unit` in `#7C8594`.

### Elevation & Route Profile Strip
- Horizontal track component displaying course profile geometry.
- Base track fill split into distinct polygon segments colored by the elevation gradient scale (from `#48CAE4` downhill to `#8E1B1B` severe climb).
- Rider position denoted by an amber marker `#F2C14E` featuring a vertical needle beam and a pulsing translucent halo.

### Checkboxes, Radios, and Toggles
- **Checkboxes & Radios:** 20px dimension, 4px corner radius (checkbox) or fully circular (radio), border `1.5px solid rgba(255, 255, 255, 0.25)`. Checked state fills with `#F2C14E` with dark `#1E2633` icon glyph.
- **Toggle Switches:** 44px × 24px pill track in `rgba(255, 255, 255, 0.15)`. Active state shifts track to `#5FD39A` (Success) or `#F2C14E` (Target), sliding a 18px solid white knob.

### Input Fields
- Height 44px, background `rgba(255, 255, 255, 0.06)`, border `1px solid rgba(255, 255, 255, 0.12)`, radius 8px, text `#FFFFFF`.
- Focus ring: `1px solid #F2C14E` with an ambient glow of `0 0 0 3px rgba(242, 193, 78, 0.20)`.

### Power Zone Bar / Interval Block
- Segmented linear progress bar displaying structured workout intervals.
- Height: 12px rounded pill or 32px full-height block chart.
- Each block's fill matches its specific Power Zone color. Completed duration dims to 50% opacity, while current target block pulses with a subtle top border sheen.