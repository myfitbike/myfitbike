// Device toasts (fallbacks, disconnects, reconnects) — plan 5.8.
import { useEffect, useState } from 'react';
import { devices, type DeviceToast } from '../devices/DeviceManager';
import { Icon, cx } from '../design/primitives';

export function Toasts() {
  const [items, setItems] = useState<DeviceToast[]>([]);
  useEffect(() => { devices.onToast = (t) => { setItems((x) => [...x.slice(-3), t]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 6000); }; }, []);
  return (
    <div className="fixed top-20 right-6 z-[60] flex flex-col gap-2" aria-live="polite">
      {items.map((t) => <div key={t.id} className={cx('rounded-xl px-4 py-3 bg-slate-solid border shadow-modal flex items-center gap-2 text-body-md', t.tone === 'danger' ? 'border-status-danger/50 text-status-danger' : t.tone === 'success' ? 'border-status-success/50 text-status-success' : 'border-status-warning/50 text-status-warning')}><Icon name={t.tone === 'success' ? 'check_circle' : 'warning'} size={18} />{t.text}</div>)}
    </div>
  );
}
