import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/fonts';
import './design/theme.css';
import { App } from './app/App';

// One address for sign-in: www.myfitbike.com is served too, but sessions and Firebase's authorized domains
// belong to myfitbike.com, so move there before anything loads.
if (location.hostname === 'www.myfitbike.com') location.replace(`https://myfitbike.com${location.pathname}${location.search}${location.hash}`);

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Offline app shell + cached world packs (production builds only; in dev the service worker would fight Vite's HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
