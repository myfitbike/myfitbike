// Bounds on what one rider may send or store (security audit M2, M3, L2). The browser is not trusted: these are
// checked on the server, and the numbers are generous enough that no real ride or workout comes near them.
export const MAX_RIDE_T_S = 172_800;      // 48 h: longer than any ride; bounds rows per ride and the ghost array
export const MAX_SAMPLES_PER_POST = 600;  // the web app sends at most 300 per request (RideController.ts:76, :107)
export const MAX_OPEN_RECORDINGS = 20;    // unfinished rides one rider may hold
export const MAX_STARS = 50;              // one per workout block; no workout has more blocks than this

/** A finite number clamped to [min, max]; anything else (null, NaN, string, object) becomes null. */
export const clampNum = (v: unknown, min: number, max: number): number | null => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
/** A string of 1..max characters after trimming, else null. */
export const text = (v: unknown, max: number): string | null => typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
/** An ISO date string that parses, else null. */
export const isoDate = (v: unknown): string | null => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null;
export const BODY_LIMIT = 256 * 1024;            // every JSON body the app sends is far below this (a 300-sample batch is ~40 KB)
export const WORLD_BODY_LIMIT = 3 * 1024 * 1024; // a prepared real-road world: built-ins measure ≤ 30 KB, a 200 km import ~1.4 MB, 300 km (the importer's cap) ~2.1 MB
export const MAX_SETTING_JSON = 32_768;          // settings are small flags and lists
export const MAX_DEVICES = 50, MAX_WORKOUTS = 500, MAX_REAL_ROUTES = 100; // per rider; far above any real library
// A prepared real-road world (security audit 2, V1/V2): its length decides how much the server builds from it.
export const MAX_ROUTE_POINTS = 16_000;          // the importer refuses routes over 300 km (checkTrack) and keeps one control point per 20 m → 15,000
export const MIN_ROUTE_M = 100, MAX_ROUTE_M = 330_000; // the importer accepts 500 m – 300 km; margin both sides
export const MAX_POINT_GAP_M = 200;              // control points are about 20 m apart
export const MAX_WORLD_SEGMENTS = 200;           // one per detected climb
export const MAX_LAPS = 500;                     // laps of one route counted for segment times in one ride
export const MAX_SEGMENT_EFFORTS = 2_000;        // segment_effort rows written per ride
// What one rider may store in total (security audit 2, V3): counts and request sizes alone let one account fill the database.
export const MAX_REAL_ROUTE_BYTES = 40 * 1024 * 1024; // all of one rider's prepared worlds together
export const MAX_RIDES = 10_000;                 // rides of any status (27 years at one a day)
export const MAX_RIDES_PER_DAY = 60;             // rides created in the last 24 hours
export const MAX_OPEN_SAMPLES = 400_000;         // samples in all unfinished rides (111 h). The app retries a refused batch forever: don't lower without changing the client
export const MAX_STORED_RIDE_S = 18_000_000;     // seconds in all finished rides (5,000 h)
// One workout's step tree (security audit 2, V3/V5): flatten() and estimateStress() loop over every repeat and second.
export const MAX_STEP_NODES = 500, MAX_STEP_DEPTH = 3, MAX_REPEAT = 200; // steps in the tree, levels of lists, times one repeat runs
export const MAX_BLOCKS = 2_000, MAX_WORKOUT_S = 86_400; // one workout after repeats are expanded; 24 h (the simulator's free ride is 24 h)
export const MAX_ICU_EVENTS = 60, MAX_ICU_BYTES = 2 * 1024 * 1024; // 14 days of intervals.icu calendar; its response size
