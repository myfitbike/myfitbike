// Shown when this browser can't pair a trainer (iPhone/iPad, Safari/Firefox, insecure address). Dismissible per browser.
import { useState } from 'react';
import { Icon } from '../design/primitives';
import { support } from './support';

const KEY = 'vw.btBannerDismissed';
export function BluetoothBanner() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  if (support.bluetooth || hidden) return null;
  return (
    <div role="status" className="mx-4 md:mx-8 mt-3 rounded-xl bg-accent/10 border border-accent/30 px-4 py-3 flex items-start gap-3 text-body-md">
      <Icon name="bluetooth" size={20} className="text-accent shrink-0 mt-0.5" /><span className="text-text flex-1">{support.reason}</span>
      <button aria-label="Dismiss" className="text-text-muted hover:text-text shrink-0" onClick={() => { try { localStorage.setItem(KEY, '1'); } catch { /* this visit only */ } setHidden(true); }}><Icon name="close" size={18} /></button>
    </div>
  );
}
