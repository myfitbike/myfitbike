import { useSyncExternalStore } from 'react';
import { radio, type RadioState } from './player';
export const useRadio = (): RadioState => useSyncExternalStore((f) => radio.subscribe(f), () => radio.state);
