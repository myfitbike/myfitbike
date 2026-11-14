// UI state (plan D9). Per-sample telemetry does NOT live here; see devices/telemetry.ts.
import { create } from 'zustand';
import type { Profile } from '@veloworld/shared';

export type SlotId = 'trainer' | 'power' | 'cadence' | 'heartRate' | 'speed';
export type SlotStatus = 'idle' | 'searching' | 'connecting' | 'connected' | 'lost' | 'bypassed';
export type SlotState = { status: SlotStatus; name?: string; detail?: string; source?: 'ble' | 'simulator' };

type AppState = {
  profile: Profile | null;
  profileLoaded: boolean;
  apiOnline: boolean;
  slots: Record<SlotId, SlotState>;
  setProfile: (p: Profile | null) => void;
  setApiOnline: (v: boolean) => void;
  setSlot: (id: SlotId, s: Partial<SlotState>) => void;
};

export const useApp = create<AppState>((set) => ({
  profile: null,
  profileLoaded: false,
  apiOnline: true,
  slots: { trainer: { status: 'idle' }, power: { status: 'idle' }, cadence: { status: 'idle' }, heartRate: { status: 'idle' }, speed: { status: 'bypassed' } },
  setProfile: (profile) => set({ profile, profileLoaded: true }),
  setApiOnline: (apiOnline) => set({ apiOnline }),
  setSlot: (id, s) => set((st) => ({ slots: { ...st.slots, [id]: { ...st.slots[id], ...s } } })),
}));
