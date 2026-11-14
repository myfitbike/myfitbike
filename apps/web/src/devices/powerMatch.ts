// Power match (plan 5.8, Phase 6): with power pedals as the power source, the ERG target sent to the trainer is
// corrected by the difference between pedal and trainer power — slowly, at most 1 W per second — so the rider
// holds the target as measured by the pedals without the trainer and pedals fighting each other.
export class PowerMatch {
  offset = 0; private lastT: number | null = null;
  /** Feed simultaneous readings; returns the current correction (trainer target = wanted − offset). */
  update(pedalW: number, trainerW: number, nowS: number): number {
    const dt = this.lastT === null ? 0 : Math.min(5, nowS - this.lastT); this.lastT = nowS;
    if (pedalW < 30 || trainerW < 30) return this.offset; // ignore freewheeling and spikes at start
    const want = pedalW - trainerW; const maxStep = 1 * dt; // ≤ 1 W per second
    this.offset += Math.max(-maxStep, Math.min(maxStep, want - this.offset)); this.offset = Math.max(-60, Math.min(60, this.offset)); return this.offset;
  }
  targetFor(wantedW: number) { return Math.round(wantedW - this.offset); }
}
