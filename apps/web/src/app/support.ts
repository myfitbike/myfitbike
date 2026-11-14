// Evaluated once at start-up: whether this browser can pair Bluetooth devices (see browserSupport.ts).
import { checkBrowser, type Support } from './browserSupport';
export const support: Support = checkBrowser(navigator as Navigator & { bluetooth?: unknown }, window.isSecureContext);
