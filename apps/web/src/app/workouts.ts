// Workout catalogue: built-in library (content/) plus the rider's imported/custom workouts from the API.
import { estimateStress, flatten, type Workout } from '@myfitbike/shared';
import library from '../../../../content/workouts/library.json';
import plans from '../../../../content/workouts/plans.json';
import { api } from './api';

export type CatalogItem = Workout & { durationS: number; tss: number; if: number };
/** Stress at a given FTP (absolute-watt workouts like the Ramp Test depend on it); the catalogue uses 200 W. */
export const enrich = (w: Workout, ftp = 200): CatalogItem => { const s = estimateStress(flatten(w.steps), ftp, w.test === 'ramp'); return { ...w, durationS: s.durationS, tss: s.tss, if: s.if }; };
export const BUILTIN: CatalogItem[] = (library as Workout[]).map(enrich);
export const PLANS = plans as { id: string; name: string; description: string; weeks: string[][] }[];
export async function loadCatalog(): Promise<CatalogItem[]> {
  const mine = await api.listWorkouts().catch(() => []); return [...mine.map((w) => enrich(w)), ...BUILTIN];
}
export async function findWorkout(id: string): Promise<CatalogItem | undefined> { return (await loadCatalog()).find((w) => w.id === id); }
export const CATEGORY_LABEL: Record<string, string> = { 'getting-started': 'Getting started', recovery: 'Recovery', endurance: 'Endurance', tempo: 'Tempo', sweetspot: 'Sweet spot', threshold: 'Threshold', vo2max: 'VO2 max', anaerobic: 'Anaerobic', sprint: 'Sprints', cadence: 'Cadence drills', climbing: 'Slope control', openers: 'Openers', test: 'FTP tests' };
