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
