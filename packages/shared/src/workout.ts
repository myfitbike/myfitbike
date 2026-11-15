// Workout model (plan 6.3). Every import format converts to this; the player flattens it to a timeline once at load,
// so elapsed time maps to a target deterministically.
export type Target = { type: 'ftpPct' | 'watts' | 'slopePct' | 'hrPct'; value: number };
export type Cue = { atS: number; text: string };
export type Step =
  | { kind: 'steady'; durS: number; target: Target; cadence?: number; text?: Cue[] }
  | { kind: 'ramp'; durS: number; from: Target; to: Target; cadence?: number; text?: Cue[] }
  | { kind: 'free'; durS: number; text?: Cue[] }
  | { kind: 'repeat'; times: number; steps: Step[] };
export type WorkoutCategory = 'recovery' | 'endurance' | 'tempo' | 'sweetspot' | 'threshold' | 'vo2max' | 'anaerobic' | 'sprint' | 'cadence' | 'climbing' | 'openers' | 'test' | 'getting-started';
export type Workout = { id: string; name: string; category: WorkoutCategory; description: string; steps: Step[]; tags?: string[]; source?: 'builtin' | 'import' | 'custom'; test?: 'ramp' | 'ftp20' | 'ftp60' };

/** One flattened block: absolute start/end, target interpolation, and its index for "step 3 / 12". */
export type Block = { i: number; startS: number; endS: number; kind: 'steady' | 'ramp' | 'free'; from?: Target; to?: Target; cadence?: number; cues: Cue[] };

export function flatten(steps: Step[]): Block[] {
  const out: Block[] = []; let t = 0;
  const walk = (list: Step[]) => {
    for (const s of list) {
      if (s.kind === 'repeat') { for (let r = 0; r < s.times; r++) walk(s.steps); continue; }
      const b: Block = { i: out.length, startS: t, endS: t + s.durS, kind: s.kind, cadence: 'cadence' in s ? s.cadence : undefined, cues: (s.text ?? []).map((c) => ({ ...c, atS: t + c.atS })) };
      if (s.kind === 'steady') { b.from = s.target; b.to = s.target; }
      if (s.kind === 'ramp') { b.from = s.from; b.to = s.to; }
      out.push(b); t += s.durS;
    }
  };
  walk(steps); return out;
}
export const durationOf = (blocks: Block[]) => (blocks.length ? blocks[blocks.length - 1]!.endS : 0);

/** Block containing time t (last block for t >= end). Binary search: called every simulation step. */
export function blockAt(blocks: Block[], t: number): Block | null {
  if (!blocks.length) return null; let lo = 0, hi = blocks.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (blocks[mid]!.startS <= t) lo = mid; else hi = mid - 1; }
  return blocks[lo]!;
}
export type Resolved = { type: Target['type'] | 'free'; value: number; watts: number | null };
/** Target at time t, resolved to watts where possible (ftpPct/watts). `bias` scales power targets (70–130 %). */
export function targetAt(blocks: Block[], t: number, ftp: number, bias = 1): Resolved {
  const b = blockAt(blocks, t); if (!b || b.kind === 'free' || !b.from || !b.to) return { type: 'free', value: 0, watts: null };
  const k = b.kind === 'ramp' ? Math.min(1, Math.max(0, (t - b.startS) / (b.endS - b.startS))) : 0;
  const value = b.from.value + (b.to.value - b.from.value) * k; const type = b.from.type;
  const watts = type === 'ftpPct' ? Math.round((value / 100) * ftp * bias) : type === 'watts' ? Math.round(value * bias) : null;
  return { type, value, watts };
}

/** Intensity factor and training stress estimate from the plan (free/slope count as 55 % FTP). Absolute-watt targets
 *  are judged against `ftp` (catalogue default 200 W). A ramp test ends at failure, not at its last step: the estimate
 *  stops where the target passes FTP / 0.75 (the best minute a rider of that FTP can hold), and so does its duration. */
export function estimateStress(blocks: Block[], ftp = 200, rampTest = false): { tss: number; if: number; durationS: number } {
  let dur = durationOf(blocks); if (!dur || ftp <= 0) return { tss: 0, if: 0, durationS: dur };
  if (rampTest) { const fail = blocks.find((b) => (targetAt(blocks, b.startS, ftp).watts ?? 0) > ftp / 0.75); if (fail) dur = fail.endS; }
  let sum4 = 0;
  for (let t = 0; t < dur; t += 5) { const r = targetAt(blocks, t, ftp); const pct = r.watts === null ? 0.55 : r.watts / ftp; sum4 += pct ** 4 * Math.min(5, dur - t); }
  const IF = Math.pow(sum4 / dur, 0.25); return { tss: Math.round((dur * IF * IF * 100) / 3600), if: +IF.toFixed(2), durationS: dur };
}
/** Plan 6.3: a step earns its star if average power is within 5 % of its average target. */
export function earnsStar(avgPower: number, avgTarget: number) { return avgTarget > 0 && Math.abs(avgPower - avgTarget) / avgTarget <= 0.05; }
