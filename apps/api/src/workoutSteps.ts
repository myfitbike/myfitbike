// Workout steps as stored: rebuilt from the Step type's fields, never stored as sent. flatten() and estimateStress()
// loop over every repeat and every second, so the expanded size is bounded too (security audit 2, V3/V5).
import type { Cue, Step, Target } from '@myfitbike/shared';
import { MAX_BLOCKS, MAX_REPEAT, MAX_STEP_DEPTH, MAX_STEP_NODES, MAX_WORKOUT_S, clampNum } from './limits.js';

const TARGETS = ['ftpPct', 'watts', 'slopePct', 'hrPct'];
const target = (v: unknown): Target | null => {
  const t = v as Record<string, unknown> | null; if (!t || typeof t !== 'object' || !TARGETS.includes(t.type as string)) return null;
  const value = clampNum(t.value, -50, 3000); return value !== null && value === t.value ? { type: t.type as Target['type'], value } : null;
};
/** Cues are optional text: a bad one is left out rather than refusing the workout. */
const cues = (v: unknown): Cue[] | null => {
  if (!Array.isArray(v)) return null; const out: Cue[] = [];
  for (const c of v.slice(0, 50) as Record<string, unknown>[]) { const atS = c && clampNum(c.atS, 0, MAX_WORKOUT_S); if (atS !== null && atS === c.atS && typeof c.text === 'string' && c.text.length <= 300) out.push({ atS, text: c.text }); }
  return out.length ? out : null;
};

/** Workout steps rebuilt from known fields with every number in range, or null if they are not a workout. Bounds the
 *  expanded size, because flatten() and estimateStress() loop over repeats and seconds (security audit 2, V3/V5). */
export function cleanSteps(raw: unknown): Step[] | null {
  let nodes = 0, blocks = 0, seconds = 0;
  const walk = (list: unknown, depth: number, mult: number): Step[] | null => {
    if (!Array.isArray(list) || !list.length || depth > MAX_STEP_DEPTH) return null; const out: Step[] = [];
    for (const s of list as Record<string, unknown>[]) {
      if (++nodes > MAX_STEP_NODES || !s || typeof s !== 'object') return null;
      if (s.kind === 'repeat') {
        if (!Number.isInteger(s.times) || (s.times as number) < 1 || (s.times as number) > MAX_REPEAT) return null;
        const inner = walk(s.steps, depth + 1, mult * (s.times as number)); if (!inner) return null;
        out.push({ kind: 'repeat', times: s.times as number, steps: inner }); continue;
      }
      const durS = clampNum(s.durS, 1, MAX_WORKOUT_S); if (durS === null || durS !== s.durS) return null;
      blocks += mult; seconds += mult * durS; if (blocks > MAX_BLOCKS || seconds > 2 * MAX_WORKOUT_S) return null;
      const cad = clampNum(s.cadence, 0, 300), text = cues(s.text); const extra = { ...(cad !== null && cad === s.cadence ? { cadence: cad } : {}), ...(text ? { text } : {}) };
      if (s.kind === 'free') out.push({ kind: 'free', durS, ...(text ? { text } : {}) });
      else if (s.kind === 'steady') { const t = target(s.target); if (!t) return null; out.push({ kind: 'steady', durS, target: t, ...extra }); }
      else if (s.kind === 'ramp') { const a = target(s.from), b = target(s.to); if (!a || !b) return null; out.push({ kind: 'ramp', durS, from: a, to: b, ...extra }); }
      else return null;
    }
    return out;
  };
  return walk(raw, 1, 1);
}
