// Workout file import (plan 10.2 #4): Zwift-style ZWO (XML), ERG (absolute watts) and MRC (% of FTP).
// All convert to the internal Step model; ZWO export is used by the workout builder.
import type { Step, Workout, WorkoutCategory } from '@myfitbike/shared';

const num = (el: Element, a: string, d = 0) => { const v = el.getAttribute(a) ?? el.getAttribute(a.toLowerCase()); return v === null ? d : Number(v); };
const pct = (x: number) => Math.round(x * 1000) / 10; // ZWO powers are fractions of FTP

export function parseZwo(xml: string, id: string): Workout {
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('Not a valid ZWO (XML) file');
  const root = doc.querySelector('workout_file'); const wk = doc.querySelector('workout'); if (!root || !wk) throw new Error('ZWO file has no <workout> section');
  const steps: Step[] = [];
  for (const el of Array.from(wk.children)) {
    const tag = el.tagName.toLowerCase(); const dur = num(el, 'Duration'); const cad = el.getAttribute('Cadence') ? num(el, 'Cadence') : undefined;
    const cues = Array.from(el.querySelectorAll('textevent')).map((t) => ({ atS: num(t, 'timeoffset'), text: t.getAttribute('message') ?? '' })).filter((c) => c.text);
    const text = cues.length ? cues : undefined;
    if (tag === 'steadystate') steps.push({ kind: 'steady', durS: dur, target: { type: 'ftpPct', value: pct(num(el, 'Power')) }, cadence: cad, text });
    else if (tag === 'warmup' || tag === 'cooldown' || tag === 'ramp') steps.push({ kind: 'ramp', durS: dur, from: { type: 'ftpPct', value: pct(num(el, 'PowerLow')) }, to: { type: 'ftpPct', value: pct(num(el, 'PowerHigh')) }, cadence: cad, text });
    else if (tag === 'intervalst') steps.push({ kind: 'repeat', times: num(el, 'Repeat', 1), steps: [
      { kind: 'steady', durS: num(el, 'OnDuration'), target: { type: 'ftpPct', value: pct(num(el, 'OnPower')) }, cadence: el.getAttribute('Cadence') ? num(el, 'Cadence') : undefined, text },
      { kind: 'steady', durS: num(el, 'OffDuration'), target: { type: 'ftpPct', value: pct(num(el, 'OffPower')) }, cadence: el.getAttribute('CadenceResting') ? num(el, 'CadenceResting') : undefined }] });
    else if (tag === 'freeride' || tag === 'maxeffort') steps.push({ kind: 'free', durS: dur, text });
  }
  if (!steps.length) throw new Error('ZWO workout contains no supported steps');
  const name = doc.querySelector('name')?.textContent?.trim() || 'Imported workout';
  return { id, name, category: guessCategory(steps), description: doc.querySelector('description')?.textContent?.trim() ?? '', steps, source: 'import' };
}

/** ERG/MRC: [COURSE DATA] lines of "minutes value". Consecutive points become ramps (equal values = steady). */
export function parseErgMrc(text: string, id: string, fallbackName: string): Workout {
  const isMrc = /MINUTES\s+PERCENT/i.test(text) || /\.mrc$/i.test(fallbackName); const isErg = /MINUTES\s+WATTS/i.test(text) || /\.erg$/i.test(fallbackName);
  if (!isMrc && !isErg) throw new Error('Not an ERG or MRC file (header must say MINUTES WATTS or MINUTES PERCENT)');
  const data = text.split(/\[COURSE DATA\]/i)[1]?.split(/\[END COURSE DATA\]/i)[0]; if (!data) throw new Error('Missing [COURSE DATA] section');
  const pts = data.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite)) as [number, number][];
  const steps: Step[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [m0, v0] = pts[i]!, [m1, v1] = pts[i + 1]!; const durS = Math.round((m1 - m0) * 60); if (durS <= 0) continue;
    const t = (v: number) => ({ type: isMrc ? ('ftpPct' as const) : ('watts' as const), value: v });
    steps.push(v0 === v1 ? { kind: 'steady', durS, target: t(v0) } : { kind: 'ramp', durS, from: t(v0), to: t(v1) });
  }
  if (!steps.length) throw new Error('No course data points found');
  const name = text.match(/FILE NAME\s*=\s*(.+)/i)?.[1]?.trim() || fallbackName.replace(/\.(erg|mrc)$/i, '');
  return { id, name, category: guessCategory(steps), description: text.match(/DESCRIPTION\s*=\s*(.+)/i)?.[1]?.trim() ?? '', steps, source: 'import' };
}

export function exportZwo(w: Workout): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  const f = (v: number) => (v / 100).toFixed(3);
  const body = (steps: Step[]): string[] => steps.flatMap((s) => {
    if (s.kind === 'steady') return s.target.type === 'ftpPct' ? [`<SteadyState Duration="${s.durS}" Power="${f(s.target.value)}"${s.cadence ? ` Cadence="${s.cadence}"` : ''}/>`] : [`<FreeRide Duration="${s.durS}"/>`];
    if (s.kind === 'ramp') return [`<Ramp Duration="${s.durS}" PowerLow="${f(s.from.value)}" PowerHigh="${f(s.to.value)}"/>`];
    if (s.kind === 'free') return [`<FreeRide Duration="${s.durS}"/>`];
    const [on, off] = s.steps; if (s.steps.length === 2 && on?.kind === 'steady' && off?.kind === 'steady' && on.target.type === 'ftpPct' && off.target.type === 'ftpPct')
      return [`<IntervalsT Repeat="${s.times}" OnDuration="${on.durS}" OffDuration="${off.durS}" OnPower="${f(on.target.value)}" OffPower="${f(off.target.value)}"/>`];
    return Array.from({ length: s.times }, () => body(s.steps)).flat();
  });
  return `<workout_file>\n  <author>MyFitBike</author>\n  <name>${esc(w.name)}</name>\n  <description>${esc(w.description)}</description>\n  <sportType>bike</sportType>\n  <workout>\n    ${body(w.steps).join('\n    ')}\n  </workout>\n</workout_file>\n`;
}

function guessCategory(steps: Step[]): WorkoutCategory {
  let max = 0; const walk = (l: Step[]) => l.forEach((s) => { if (s.kind === 'repeat') walk(s.steps); else if (s.kind === 'steady' && s.target.type === 'ftpPct') max = Math.max(max, s.target.value); else if (s.kind === 'ramp' && s.from.type === 'ftpPct') max = Math.max(max, s.to.value, s.from.value); });
  walk(steps); return max >= 130 ? 'anaerobic' : max >= 106 ? 'vo2max' : max >= 94 ? 'threshold' : max >= 84 ? 'sweetspot' : max >= 76 ? 'tempo' : max >= 56 ? 'endurance' : 'recovery';
}
