// Media-query hook: compact layouts on small screens, touch controls on coarse pointers (tablets, phones).
import { useEffect, useState } from 'react';
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => { const m = matchMedia(query); const f = () => setOn(m.matches); f(); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [query]);
  return on;
}
