// One GATT operation at a time (plan 5.1): serialized, 3 s timeout per attempt, 2 attempts, then fail loudly.
export class CommandQueue {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly timeoutMs = 3000, private readonly attempts = 2, private readonly log: (m: string) => void = () => {}) {}
  run<T>(label: string, op: () => Promise<T>): Promise<T> {
    const exec = async () => {
      let lastErr: unknown;
      for (let a = 1; a <= this.attempts; a++) {
        try { return await withTimeout(op(), this.timeoutMs, label); }
        catch (e) { lastErr = e; this.log(`${label}: attempt ${a} failed (${(e as Error).message})`); }
      }
      throw lastErr;
    };
    const p = this.tail.then(exec, exec); this.tail = p.catch(() => undefined); return p;
  }
}
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });
}
