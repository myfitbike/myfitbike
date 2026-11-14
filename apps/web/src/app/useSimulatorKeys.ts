// Simulator keyboard control (plan 5.6) on Shift + arrows, so plain arrows stay free for the ride HUD (bias/slope).
import { useEffect } from 'react';
import { devices } from '../devices/DeviceManager';
import { SimulatedTrainer } from '../devices/SimulatedTrainer';

export function useSimulatorKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = devices.trainer; if (!(t instanceof SimulatedTrainer) || !e.shiftKey) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowUp') t.effortW += 10; else if (e.key === 'ArrowDown') t.effortW = Math.max(0, t.effortW - 10);
      else if (e.key === 'ArrowRight') t.cadence = Math.min(130, t.cadence + 5); else if (e.key === 'ArrowLeft') t.cadence = Math.max(0, t.cadence - 5);
      else return; e.preventDefault();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);
}
