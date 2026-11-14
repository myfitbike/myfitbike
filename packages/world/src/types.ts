// Velora world data model (plan 7.0). world.json is the single source of truth for gradients, maps, routes and the 3D bake.
export type Vec2 = [number, number];
export type Vec3 = [number, number, number]; // [x, elevation, z] in metres; x east, z south
export type Biome = 'harbour' | 'marsh' | 'farmland' | 'oldtown' | 'tea' | 'desert' | 'rainforest' | 'alpine' | 'fjord' | 'volcanic';
export type Region = { id: string; name: string; biome: Biome; polygon: Vec2[]; maxGradePct: number; color: string };
export type Stamp = { kind: 'mountain' | 'ridge' | 'plateau' | 'canyon' | 'crater'; pos?: Vec3; from?: Vec2; to?: Vec2; height: number; radius?: number; width?: number };
export type Edge = { id: string; name: string; from: string; to: string; points: Vec3[]; surface: 'asphalt' | 'cobble' | 'gravel' | 'boardwalk'; width: number; structure?: 'bridge' | 'tunnel' | 'causeway' };
export type Route = { id: string; name: string; description: string; edges: { id: string; reverse: boolean }[]; loop: boolean; region: string; tags: string[] };
export type Segment = { id: string; name: string; kind: 'sprint' | 'climb'; edge: string; from: number; to: number };
export type Landmark = { id: string; kind: string; name: string; pos: Vec3; rot: number };
export type World = {
  version: number; seed: number; size: Vec2; name: string;
  islands: { center: Vec2; radii: Vec2 }[]; lakes: { center: Vec2; radius: number; level: number; depth: number }[];
  heightStamps: Stamp[]; regions: Region[]; nodes: { id: string; pos: Vec3 }[]; edges: Edge[]; routes: Route[]; segments: Segment[]; landmarks: Landmark[];
  towns: { center: Vec2; radius: number; name: string }[];
};
