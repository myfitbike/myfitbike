// Minimap (plan 7.0 Maps): heading-up crop of the illustrated map with the route ahead highlighted and the rider arrow.
import { useEffect, useRef } from 'react';
import type { RouteProfile } from '@myfitbike/world';
import { baseMapUrl } from '../app/routesData';
import { tokenColor } from './zones';

export function MiniMap({ route, read, className, radiusM = 900, headingUp = true }: { route: RouteProfile; read: () => { x: number; z: number; headingRad: number; d: number } | null; className?: string; radiusM?: number; headingUp?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const base = baseMapUrl(route.id); const img = new Image(); img.src = base.url; const vb = base.viewBox; // whole-world map of the route's world
    const c = ref.current!; let raf = 0; let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw); if (now - last < 100) return; last = now; // 10 Hz is plenty for a map
      const dpr = devicePixelRatio, w = (c.width = c.clientWidth * dpr), h = (c.height = c.clientHeight * dpr); const st = read(); const g = c.getContext('2d')!; g.clearRect(0, 0, w, h); if (!st || !img.complete) return;
      const scale = Math.min(w, h) / 2 / radiusM; g.save(); g.translate(w / 2, h / 2); if (headingUp) g.rotate(-st.headingRad - Math.PI / 2); g.scale(scale, scale); g.translate(-st.x, -st.z);
      g.drawImage(img, vb[0]!, vb[1]!, vb[2]!, vb[3]!);
      g.strokeStyle = tokenColor('--color-accent'); g.lineWidth = Math.max(10, radiusM / 70); g.lineCap = 'round'; g.beginPath(); const i0 = Math.floor(st.d / route.step); for (let k = 0; k < 600; k++) { const i = (i0 + k) % route.x.length; if (k === 0) g.moveTo(route.x[i]!, route.z[i]!); else g.lineTo(route.x[i]!, route.z[i]!); } g.stroke(); // the next 3 km
      g.restore();
      g.save(); g.translate(w / 2, h / 2); if (!headingUp) g.rotate(st.headingRad + Math.PI / 2); g.fillStyle = '#fff'; g.strokeStyle = tokenColor('--color-accent'); g.lineWidth = 2.5 * dpr; g.beginPath(); g.moveTo(0, -11 * dpr); g.lineTo(8 * dpr, 9 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-8 * dpr, 9 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [route, read, radiusM, headingUp]);
  return <canvas ref={ref} className={className} role="img" aria-label="Minimap" />;
}
