// Node only: the Velora world read from (and, in development, saved to) content/world/velora/world.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { World } from '@myfitbike/world';
import type { WorldSource } from './routes.js';

const WORLD_PATH = fileURLToPath(new URL('../../../content/world/velora/world.json', import.meta.url));
export const nodeWorldSource = (): WorldSource => ({
  load: () => JSON.parse(readFileSync(WORLD_PATH, 'utf8')) as World,
  ...(process.env.NODE_ENV !== 'production' ? { save: (w: World) => writeFileSync(WORLD_PATH, JSON.stringify(w)) } : {}),
});
