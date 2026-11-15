// Public privacy policy (PLAN 17.4, 17.5): plain-English DRAFT — the owner reviews it before launch.
import type { ReactNode } from 'react';
import { Icon } from '../design/primitives';
import { DocPage } from '../landing/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10"><h2 className="text-headline-md text-text mb-3">{title}</h2><div className="space-y-3 text-body-lg text-on-surface-variant">{children}</div></section>;
}
const Li = ({ children }: { children: ReactNode }) => <li className="pl-1">{children}</li>;
const ul = 'list-disc pl-6 space-y-2 marker:text-accent';

export function Privacy() {
  return (
    <DocPage eyebrow="Your data" title="Privacy policy">
      <div role="note" className="mb-8 rounded-card border border-status-warning/40 bg-status-warning/10 p-4 flex gap-3 items-start">
        <Icon name="warning" className="text-status-warning mt-0.5" />
        <p className="text-body-lg text-text"><strong>Draft — to be reviewed by the owner before launch.</strong> <span className="text-text-secondary">This text is not final.</span></p>
      </div>
      <p className="text-body-lg text-text-secondary">MyFitBike is a free hobby app for indoor cycling. This page explains, in plain words, what we keep about you, where it lives, and how to get rid of it. Short version: we store what the app needs to work, we don't show ads, we don't track you across the web, and we never sell your data.</p>

      <Section title="What we store">
        <ul className={ul}>
          <Li><strong className="text-text">Your account:</strong> your e-mail address and a sign-in record. If you sign in with Google we receive your e-mail address from Google; we never see your Google password.</Li>
          <Li><strong className="text-text">Your profile:</strong> the name you choose, weight, FTP, heart-rate settings, units, country and avatar look.</Li>
          <Li><strong className="text-text">Your rides:</strong> time, power, cadence, speed, heart rate (if you wear a strap) and your position along the route. Positions are on Velora, our made-up island, or on the real-road route you chose to ride — we never read your device's location.</Li>
          <Li><strong className="text-text">Your settings:</strong> things like HUD layout, favourite radio stations, workouts you built or imported, and training-plan progress.</Li>
          <Li><strong className="text-text">Strava connection (optional):</strong> if you connect Strava, we keep the access tokens Strava gives us, encrypted, so we can upload rides when you ask.</Li>
        </ul>
      </Section>

      <Section title="Where it is stored">
        <ul className={ul}>
          <Li>Account and app data live in a <strong className="text-text">Supabase</strong> Postgres database in the cloud. Sign-in is handled by Supabase Auth.</Li>
          <Li>The website is hosted on <strong className="text-text">Cloudflare</strong>, and finished ride files (the second-by-second data) are kept in Cloudflare storage.</Li>
          <Li>Some things stay only on your device: prepared real-road routes are cached in your browser, and GPX/TCX/FIT files you import are read on your computer.</Li>
        </ul>
      </Section>

      <Section title="What goes to other services — only when you ask">
        <ul className={ul}>
          <Li><strong className="text-text">Strava:</strong> a ride is uploaded only when you connect Strava and choose to upload (or turn on automatic upload).</Li>
          <Li><strong className="text-text">Online radio:</strong> station search uses the public radio-browser.info directory, and the audio streams come straight from each station to your browser. Those stations can see your IP address, like any website.</Li>
          <Li><strong className="text-text">Elevation for real roads:</strong> when you prepare or import a real-road route, your browser downloads terrain tiles from open elevation services (Mapterhorn, with AWS Terrain Tiles as a fallback).</Li>
        </ul>
        <p>We don't use advertising networks or third-party analytics, and we don't sell or rent your data to anyone.</p>
      </Section>

      <Section title="Cookies and local storage">
        <p>We use your browser's local storage to keep you signed in and to remember small preferences on this device. There are no advertising or tracking cookies, so there is no cookie banner.</p>
      </Section>

      <Section title="Deleting your account">
        <p>You can disconnect Strava at any time in Settings → Connections. To delete your account and everything stored with it, contact us and we will remove it.</p>
        <p className="rounded-control bg-white/6 border border-white/10 px-4 py-3 text-text">Contact: [owner e-mail to be added]</p>
      </Section>

      <Section title="Changes">
        <p>If this policy changes, we'll update this page and the date below.</p>
        <p className="text-text-muted">Last updated: draft, not yet published.</p>
      </Section>
    </DocPage>
  );
}
