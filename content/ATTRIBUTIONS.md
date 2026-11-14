# Third-party software, fonts and assets

Only permissive licences (OSI-approved, CC0, CC BY, SIL OFL). Every item used by the shipped app is listed here and on the About screen.

| Item | Use | Licence | Source |
|---|---|---|---|
| React, React DOM | UI | MIT | react.dev |
| React Router | routing | MIT | reactrouter.com |
| Zustand | UI state | MIT | github.com/pmndrs/zustand |
| Tailwind CSS | styling | MIT | tailwindcss.com |
| three.js | 3D world (spikes now, app from Phase 4) | MIT | threejs.org |
| Hono, @hono/node-server | local API | MIT | hono.dev |
| node-postgres (pg) | database driver | MIT | node-postgres.com |
| dotenv | API config | BSD-2-Clause | github.com/motdotla/dotenv |
| Inter (via @fontsource/inter) | interface font, self-hosted | SIL OFL 1.1 | rsms.me/inter |
| Barlow Condensed (via @fontsource/barlow-condensed) | live-number font, self-hosted | SIL OFL 1.1 | github.com/jpt/barlow |
| Material Symbols (via @material-symbols/svg-400) | icons, subset compiled in | Apache-2.0 | fonts.google.com/icons |

World art (terrain, trees, animals, buildings, riders, crowds, arches, road graffiti) is generated procedurally by VeloWorld's own code; no third-party models or textures are used so far.

## Data used at runtime (optional real-road mode)

Fetched by the rider's browser only while importing or baking a real-road route; nothing is fetched during a ride
and none of this data ships with the app. The ride screen and the Real roads tab show
"Elevation © Mapterhorn · Terrain Tiles (USGS and others)".

| Data | Use | Licence / terms | Required credit |
|---|---|---|---|
| Mapterhorn terrain tiles (`tiles.mapterhorn.com`, Terrarium WebP) | elevation for imported routes and their 3D terrain | open-data sources, per-region licences listed at mapterhorn.com/attribution (code BSD-3) | "© Mapterhorn", linking mapterhorn.com/attribution |
| AWS Terrain Tiles (`elevation-tiles-prod`, Terrarium PNG), fallback | same, where Mapterhorn has no tile | per-source, see github.com/tilezen/joerd/blob/master/docs/attribution.md | e.g. "3DEP, SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey" plus the regional lines in that file |

The rider's own GPX / TCX / FIT files stay on their computer and local database.
