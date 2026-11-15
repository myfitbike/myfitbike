// Public landing page (PLAN 17.4): one scrolling page built from the app's own screenshots (public/landing/) and
// drawn graphics. Every claim here matches a shipped feature — check the app before adding one.
import type { ReactNode } from 'react';
import { Icon, cx } from '../design/primitives';
import type { IconName } from '../design/icons.generated';
import { DeviceArt, ProfileBars, RidgeBackdrop, SignalArcs } from '../landing/art';
import { BrowserFrame, LinkButton, PhoneFrame, PublicFooter, PublicHeader } from '../landing/ui';

const NAV = [{ href: '#features', label: 'Features' }, { href: '#how', label: 'How it works' }, { href: '#world', label: 'The world' }, { href: '#faq', label: 'FAQ' }];
const CLIMBS = ["Alpe d'Huez", 'Mont Ventoux', 'Col du Tourmalet', 'Col du Galibier', 'Passo dello Stelvio', 'Passo Pordoi', 'Grossglockner', 'Sa Calobra'];
const STATS: [string, string][] = [['12', 'routes on Velora'], ['8', 'famous real climbs'], ['43', 'built-in workouts'], ['3', 'training plans']];

const FEATURES: { icon: IconName; title: string; text: string; tone: string }[] = [
  { icon: 'bolt', title: 'ERG workouts', text: 'Hold an exact wattage whatever your cadence. The trainer sets the resistance for every interval, so you just pedal.', tone: 'text-accent bg-accent/12' },
  { icon: 'landscape', title: 'Real gradient feel', text: 'On a route your smart trainer follows the slope of the road: it gets harder up the climbs and eases off on the descents.', tone: 'text-grade-steep bg-grade-steep/12' },
  { icon: 'map', title: 'The island of Velora', text: 'A 3D island with harbours, downs, forests, a fjord and a summit climb. The bike follows the road by itself — no steering.', tone: 'text-secondary bg-secondary/12' },
  { icon: 'flag', title: 'World Tour climbs', text: "Eight legendary climbs on real roads, from Alpe d'Huez to Sa Calobra — or import your own GPX, TCX or FIT route.", tone: 'text-tertiary bg-tertiary/12' },
  { icon: 'fitness_center', title: 'Workouts & plans', text: '43 workouts in 11 categories, three four-week plans, a ramp FTP test and a builder. Import .zwo, .erg, .mrc and .fit files.', tone: 'text-zone-2 bg-zone-2/12' },
  { icon: 'history', title: 'Ghosts & segment PBs', text: 'Race translucent ghosts of your best and last ride, or a steady pacer. Climbs and sprints keep your personal bests.', tone: 'text-zone-7 bg-zone-7/12' },
  { icon: 'upload', title: 'Strava upload', text: 'Connect Strava once, then upload each ride when you finish — or let it happen automatically.', tone: 'text-zone-5 bg-zone-5/12' },
  { icon: 'radio', title: 'Radio while you ride', text: 'Search free internet radio by name, genre or country, star favourites and play them from the ride menu.', tone: 'text-primary bg-primary/12' },
  { icon: 'devices', title: 'Desktop, tablet, phone', text: 'Every screen works from a phone up, with touch buttons for every ride shortcut and a compact HUD on small screens.', tone: 'text-status-success bg-status-success/12' },
];

const FAQ: [string, ReactNode][] = [
  ['Is MyFitBike free?', 'Yes. MyFitBike is a free hobby project: no subscription and no ads. Create an account and ride.'],
  ['Which browsers work?', <>To pair a trainer you need a browser with Web Bluetooth: <b className="text-text">Chrome or Microsoft Edge</b> on a desktop or laptop (Windows, macOS, Linux, ChromeOS), or Chrome on <b className="text-text">Android</b>. iPhone and iPad browsers, Safari and Firefox don't have Web Bluetooth — you can still look around there and ride the demo trainer.</>],
  ['Which trainers and sensors are supported?', <>Smart trainers that use the standard Bluetooth <b className="text-text">FTMS</b> (Fitness Machine) profile, and Tacx trainers using <b className="text-text">FE-C over Bluetooth</b>. You can also pair Bluetooth power meters, heart-rate straps and speed/cadence sensors.</>],
  ["Can I try it without a trainer?", 'Yes. Turn on the demo trainer in Sensors (or tap "Use demo trainer" when a ride starts). It rides on its own, and on a keyboard Shift + arrow keys change the effort and cadence.'],
  ['Do I have to steer?', 'No. MyFitBike is a ride simulator, not a game: the bike follows the road and takes corners and junctions by itself. You focus on pedalling.'],
  ['Do I need Strava?', 'No. Strava is optional. Your rides are saved in MyFitBike either way; connect Strava only if you want them there too.'],
];

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('inline-flex items-center gap-2 text-label-caps uppercase text-accent', className)}><span className="w-1.5 h-1.5 rounded-full bg-accent" />{children}</p>;
}
function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('text-[32px] leading-[38px] sm:text-[44px] sm:leading-[50px] font-bold tracking-tight text-text', className)}>{children}</h2>;
}

function Showcase({ eyebrow, title, text, points, flip, children }: { eyebrow: string; title: ReactNode; text: string; points: string[]; flip?: boolean; children: ReactNode }) {
  return (
    <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
      <div className={cx('lg:col-span-5', flip && 'lg:order-2')}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-3 text-[28px] leading-[34px] sm:text-[36px] sm:leading-[42px] font-bold tracking-tight text-text">{title}</h3>
        <p className="mt-4 text-body-lg text-text-secondary">{text}</p>
        <ul className="mt-6 space-y-3">{points.map((p) => <li key={p} className="flex gap-3 text-body-lg text-on-surface"><Icon name="check_circle" className="text-accent mt-0.5" />{p}</li>)}</ul>
      </div>
      <div className={cx('lg:col-span-7 relative', flip && 'lg:order-1')}>{children}</div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-control focus:bg-accent focus:text-on-accent">Skip to content</a>
      <PublicHeader nav={NAV} />
      <main id="main">

        {/* hero */}
        <section aria-labelledby="hero-title" className="relative pt-14 sm:pt-20 pb-16">
          <RidgeBackdrop className="absolute inset-x-0 top-[600px] sm:top-[400px] h-[520px] w-full opacity-70" />
          <div aria-hidden className="absolute left-1/2 top-0 -translate-x-1/2 w-[900px] max-w-full h-[420px] rounded-full bg-accent/10 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 text-center">
            <p className="inline-flex flex-wrap justify-center items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-label-caps uppercase text-accent"><Icon name="pedal_bike" size={16} />Free indoor cycling · in your browser</p>
            <h1 id="hero-title" className="mt-6 mx-auto max-w-4xl text-[40px] leading-[44px] sm:text-[60px] sm:leading-[62px] lg:text-[76px] lg:leading-[76px] font-bold tracking-tight text-text">
              Your trainer. <span className="bg-linear-to-r from-accent via-primary to-grade-steep bg-clip-text text-transparent">A whole island</span> to climb.
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-[17px] leading-7 sm:text-[19px] sm:leading-8 text-text-secondary">Pair your smart trainer over Bluetooth and ride a 3D world, famous real climbs or structured ERG workouts — right in Chrome or Edge. Nothing to install.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <LinkButton to="/login?mode=signup" size="lg" iconRight="arrow_forward">Get started — it's free</LinkButton>
              <a href="#how" className="inline-flex items-center justify-center gap-2 rounded-control px-8 py-4 text-body-lg font-semibold uppercase tracking-wider bg-white/10 text-text border border-white/15 hover:bg-white/16 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">See how it works</a>
            </div>
            <p className="mt-4 text-body-md text-text-muted">No trainer yet? Ride the built-in demo trainer.</p>

            <div className="relative mt-14 mx-auto max-w-6xl">
              <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-linear-to-b from-accent/25 via-secondary/10 to-transparent blur-2xl" />
              <BrowserFrame src="/landing/ride-climb.jpg" lazy={false} alt="The MyFitBike ride screen: a rider climbing a road through pine forest on Mount Solace, with power, speed, cadence, the climb segment timer and a gradient-coloured route profile." className="relative" />
              <div className="hidden md:flex absolute -left-6 lg:-left-10 top-1/3 glass-hud rounded-card px-4 py-3 items-center gap-3 shadow-modal text-left">
                <span className="w-10 h-10 rounded-lg bg-grade-steep/20 text-grade-steep flex items-center justify-center"><Icon name="landscape" /></span>
                <span><span className="block text-label-caps uppercase text-text-secondary">Solace Summit</span><span className="font-metric-live text-metric-md text-text">12.5 km · 1050 m</span></span>
              </div>
              <div className="hidden md:block absolute -right-4 lg:-right-8 -bottom-10 w-40 lg:w-52"><PhoneFrame src="/landing/phone-ride.jpg" alt="The same ride on a phone, with a compact HUD" /></div>
            </div>
          </div>
        </section>

        {/* numbers */}
        <section aria-label="MyFitBike in numbers" className="mx-auto max-w-7xl px-4 sm:px-6 pb-8">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {STATS.map(([n, l]) => <div key={l} className="rounded-card border border-white/8 bg-surface-container-low/70 px-5 py-5 text-center"><dt className="sr-only">{l}</dt><dd><span className="block font-metric-live text-metric-xl text-accent">{n}</span><span className="mt-1 block text-label-caps uppercase text-text-secondary">{l}</span></dd></div>)}
          </dl>
        </section>

        {/* features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 py-20">
          <div className="max-w-2xl"><Eyebrow>Features</Eyebrow><H2 className="mt-3"><span id="features-title">Everything for a proper session indoors</span></H2><p className="mt-4 text-body-lg text-text-secondary">Free ride, routes, climbs, intervals and tests — with the numbers you care about on screen and your trainer doing the work.</p></div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <article key={f.title} className="group rounded-card border border-white/8 bg-surface-container-low/70 p-6 transition-colors hover:border-accent/30 hover:bg-surface-container/80">
                <span className={cx('w-12 h-12 rounded-xl flex items-center justify-center', f.tone)}><Icon name={f.icon} size={24} /></span>
                <h3 className="mt-5 text-headline-md text-text">{f.title}</h3>
                <p className="mt-2 text-body-lg text-text-secondary">{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-20 relative py-20 bg-surface-container-lowest/50 border-y border-white/6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto"><Eyebrow>How it works</Eyebrow><H2 className="mt-3"><span id="how-title">Riding in three steps</span></H2></div>
            <ol className="mt-12 grid md:grid-cols-3 gap-4">
              {[
                { n: '01', t: 'Pair your trainer', d: 'Open MyFitBike in Chrome or Edge, go to Sensors and pair your smart trainer over Bluetooth. Add a heart-rate strap or power meter if you like.', art: <SignalArcs className="h-16 w-32" /> },
                { n: '02', t: 'Pick a route or workout', d: 'Choose a Velora route, a famous climb or a structured workout. Turn on your ghost or a pacer for company.', art: <ProfileBars className="h-16 w-40" /> },
                { n: '03', t: 'Ride, then sync', d: 'Pedal — the trainer follows the road or the workout. When you finish, see your summary and upload it to Strava.', art: <span className="h-16 flex items-center gap-2 text-zone-5"><Icon name="sports_score" size={40} /><Icon name="arrow_forward" size={24} className="text-text-muted" /><Icon name="upload" size={40} /></span> },
              ].map((s) => (
                <li key={s.n} className="relative rounded-card border border-white/8 bg-surface-container/70 p-6 overflow-hidden">
                  <span aria-hidden className="absolute -top-4 right-3 font-metric-live text-[110px] leading-none text-white/5 select-none">{s.n}</span>
                  <div className="relative">{s.art}<p className="mt-4 font-metric-live text-metric-md text-accent">Step {s.n}</p><h3 className="mt-1 text-headline-md text-text">{s.t}</h3><p className="mt-2 text-body-lg text-text-secondary">{s.d}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* showcase rows */}
        <section id="world" aria-labelledby="world-title" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 py-24 space-y-28">
          <h2 id="world-title" className="sr-only">A closer look</h2>
          <Showcase eyebrow="The world" title={<>A road that <span className="text-accent">cheers you on</span></>} text="Velora is drawn entirely by MyFitBike's own code: trees that sway, grazing animals, lakes and villages along the road. Checkpoints get arches, banners and a waving crowd."
            points={['Your name painted on the road before every checkpoint', 'Climbs and sprints with live timers and personal bests', 'Six camera views, or hide the HUD and just ride']}>
            <BrowserFrame src="/landing/ride-world.jpg" alt="A rider on a long straight road with their name painted on the asphalt, trees, cows in a field and a mountain ahead." />
            <img src="/landing/ride-checkpoint.jpg" alt="A checkpoint arch with spectators behind banners, and a cheer painted on the road." loading="lazy" width={1440} height={900} className="hidden sm:block absolute -bottom-12 -left-6 w-1/2 rounded-xl border border-white/14 shadow-modal" />
          </Showcase>

          <Showcase flip eyebrow="Routes" title={<>Twelve routes across <span className="text-secondary">Velora</span></>} text="From an 8 km harbour spin to the 112 km Grand Tour of Velora. Every route shows distance, climbing, max gradient and an estimated time at your power."
            points={['Filter by difficulty and search by name', 'Pick a section of a route to ride on its own', 'Ride any workout on a route for the scenery']}>
            <BrowserFrame src="/landing/velora-map.jpg" alt="The Velora map with region names and the list of routes with distance and climbing." />
            <img src="/landing/route-detail.jpg" alt="Route page for Solace Summit: 12.5 km, 1050 m ascent, 11.2 % max gradient, ghost and pacer options." loading="lazy" width={1440} height={900} className="hidden sm:block absolute -bottom-12 -right-6 w-1/2 rounded-xl border border-white/14 shadow-modal" />
          </Showcase>

          <Showcase eyebrow="Real roads" title={<>The World Tour: <span className="text-tertiary">famous climbs</span></>} text="Eight legendary climbs, mapped from OpenStreetMap roads with real elevation. Each one is prepared on your device the first time you ride it."
            points={['Smoothed gradients, so your trainer never jumps', 'Import your own GPX, TCX or FIT route too', 'Elevation from open terrain data']}>
            <BrowserFrame src="/landing/real-roads.jpg" alt="The Real roads tab listing World Tour climbs such as Alpe d'Huez, Mont Ventoux and Col du Tourmalet." />
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="World Tour climbs">{CLIMBS.map((c) => <li key={c} className="rounded-full border border-tertiary/25 bg-tertiary/10 px-3 py-1 text-body-md text-tertiary">{c}</li>)}</ul>
          </Showcase>

          <Showcase flip eyebrow="Training" title={<>Structured workouts, <span className="text-accent">ERG-controlled</span></>} text="Sweet spot, threshold, VO2 max, sprints, cadence drills and more. Targets scale to your FTP, and the workout graph shows exactly what's next."
            points={['Ramp FTP test to find your number', 'Build your own workouts or import .zwo, .erg, .mrc and .fit', 'Training stress and intensity for every session']}>
            <BrowserFrame src="/landing/workout-detail.jpg" alt="Workout page for Sweet Spot 4x10 with duration, stress, intensity and a coloured interval profile." />
            <img src="/landing/ride-workout.jpg" alt="A workout in progress with the interval list, power and the workout profile." loading="lazy" width={1440} height={900} className="hidden sm:block absolute -bottom-12 -left-6 w-1/2 rounded-xl border border-white/14 shadow-modal" />
          </Showcase>

          <Showcase eyebrow="Plans" title={<>A plan for the <span className="text-zone-2">next four weeks</span></>} text="Start a training plan and Home recommends the next session. Monthly challenges and badges keep the streak going."
            points={['4-Week Base, 4-Week Build and FTP Booster', 'Recommended workout on Home, one tap to start in ERG', 'Ride history, weekly load and personal records']}>
            <BrowserFrame src="/landing/training-plans.jpg" alt="The Training Room with the 4-Week Base, 4-Week Build and FTP Booster plans." />
            <img src="/landing/home.jpg" alt="The Home screen with a recommended plan, a recommended ramp test and quick-start modes." loading="lazy" width={1440} height={900} className="hidden sm:block absolute -bottom-12 -right-6 w-1/2 rounded-xl border border-white/14 shadow-modal" />
          </Showcase>

          <Showcase flip eyebrow="Any screen" title={<>Laptop by the bike, <span className="text-status-success">phone on the bars</span></>} text="MyFitBike works from a 375 px phone up to a big monitor. On a phone you get a bottom tab bar, a compact HUD and touch buttons for every ride control."
            points={['Pair from Chrome on Android', 'Metric or imperial units', 'Hide the HUD for a clean view']}>
            <div className="flex justify-center gap-4 sm:gap-8">
              <PhoneFrame src="/landing/phone-ride.jpg" alt="The ride screen on a phone: rider on a mountain road, compact HUD with power, speed and cadence." className="w-[44%] max-w-64 rotate-[-3deg]" />
              <PhoneFrame src="/landing/phone-workouts.jpg" alt="The Workouts screen on a phone with power and slope controls and the bottom tab bar." className="w-[44%] max-w-64 rotate-[3deg] mt-10" />
            </div>
          </Showcase>
        </section>

        {/* devices */}
        <section aria-labelledby="devices-title" className="py-20 bg-surface-container-lowest/50 border-y border-white/6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto"><Eyebrow>Devices</Eyebrow><H2 className="mt-3"><span id="devices-title">Works with standard Bluetooth gear</span></H2><p className="mt-4 text-body-lg text-text-secondary">No dongles and no extra apps — MyFitBike talks to your devices straight from the browser.</p></div>
            <ul className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {([['trainer', 'Smart trainers', 'Bluetooth FTMS, plus Tacx FE-C over Bluetooth', 'text-accent'], ['power', 'Power meters', 'Bluetooth cycling power', 'text-zone-4'], ['hr', 'Heart-rate straps', 'Bluetooth heart rate', 'text-status-danger'], ['cadence', 'Cadence sensors', 'Bluetooth speed & cadence', 'text-secondary']] as const).map(([k, t, d, c]) => (
                <li key={k} className="rounded-card border border-white/8 bg-surface-container/70 p-5 sm:p-6 text-center">
                  <DeviceArt kind={k} className={cx('mx-auto w-16 h-16 sm:w-20 sm:h-20', c)} />
                  <h3 className="mt-4 text-body-lg font-semibold text-text">{t}</h3><p className="mt-1 text-body-md text-text-secondary">{d}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-center text-body-md text-text-muted"><Icon name="cell_tower" size={16} className="inline -mt-0.5 mr-1 text-secondary" />No trainer? The demo trainer lets you ride and explore everything.</p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 mx-auto max-w-3xl px-4 sm:px-6 py-24">
          <div className="text-center"><Eyebrow>FAQ</Eyebrow><H2 className="mt-3"><span id="faq-title">Questions, answered</span></H2></div>
          <div className="mt-10 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-card border border-white/8 bg-surface-container-low/70 open:border-accent/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-body-lg font-semibold text-text rounded-card focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">{q}<Icon name="keyboard_arrow_down" className="text-text-secondary transition-transform group-open:rotate-180" /></summary>
                <div className="px-5 pb-5 text-body-lg text-text-secondary">{a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* final call to action */}
        <section aria-labelledby="cta-title" className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-accent/25 bg-linear-to-br from-accent/20 via-surface-container to-secondary/15 px-6 py-14 sm:px-12 sm:py-20 text-center">
            <RidgeBackdrop className="absolute inset-x-0 bottom-0 h-32 w-full opacity-35" />
            <div className="relative">
              <H2 className="mx-auto max-w-3xl"><span id="cta-title">Clip in. The island is waiting.</span></H2>
              <p className="mt-4 mx-auto max-w-xl text-body-lg text-text-secondary">Create a free account and ride today — with your smart trainer or the demo trainer.</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <LinkButton to="/login?mode=signup" size="lg" iconRight="arrow_forward">Get started — it's free</LinkButton>
                <LinkButton to="/login" variant="glass" size="lg">Log in</LinkButton>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
