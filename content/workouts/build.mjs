// Authoring script for the built-in workout library (plan 6.4). Run: node content/workouts/build.mjs
// Writes library.json and plans.json. All workouts are original; durations in minutes below, seconds in output.
import { writeFileSync } from 'node:fs';
const P = (v) => ({ type: 'ftpPct', value: v }), S = (v) => ({ type: 'slopePct', value: v });
const s = (min, pct, cadence, text) => ({ kind: 'steady', durS: Math.round(min * 60), target: P(pct), ...(cadence ? { cadence } : {}), ...(text ? { text: [{ atS: 0, text }] } : {}) });
const sl = (min, pct, text) => ({ kind: 'steady', durS: Math.round(min * 60), target: S(pct), ...(text ? { text: [{ atS: 0, text }] } : {}) });
const ramp = (min, a, b) => ({ kind: 'ramp', durS: Math.round(min * 60), from: P(a), to: P(b) });
const rep = (times, ...steps) => ({ kind: 'repeat', times, steps });
const free = (min, text) => ({ kind: 'free', durS: Math.round(min * 60), ...(text ? { text: [{ atS: 0, text }] } : {}) });
const wu = (min = 10) => ramp(min, 45, 70), cd = (min = 8) => ramp(min, 65, 40);
const W = [];
const add = (id, name, category, description, steps, extra = {}) => W.push({ id: `builtin-${id}`, name, category, description, steps, source: 'builtin', ...extra });

add('first-spin', 'First Spin', 'getting-started', 'Twenty easy minutes to get to know ERG mode. The trainer sets the power; you just pedal at a comfortable cadence.', [ramp(5, 40, 55), s(10, 60, 85, 'Settle in. Notice that power stays the same whatever cadence you choose.'), cd(5)]);
add('cadence-intro', 'Cadence Explorer', 'getting-started', 'Steady endurance power while you try different cadences.', [wu(8), rep(4, s(2, 65, 70, 'Slow and strong: 70 rpm'), s(2, 65, 95, 'Light and quick: 95 rpm')), cd(6)]);
add('recovery-30', 'Recovery Spin 30', 'recovery', 'Very easy spinning to flush the legs the day after a hard session.', [s(30, 50, 90)]);
add('recovery-45', 'Recovery Spin 45', 'recovery', 'Longer easy ride below 55 % FTP.', [ramp(5, 40, 50), s(35, 52), ramp(5, 50, 40)]);
for (const m of [60, 90, 120]) add(`z2-${m}`, `Endurance Z2 ${m}`, 'endurance', `${m} minutes of steady zone 2 to build aerobic base.`, [wu(10), s(m - 18, 68), cd(8)]);
add('endurance-surges', 'Endurance with Surges', 'endurance', 'Zone 2 with a short surge every 10 minutes to keep the legs awake.', [wu(10), rep(5, s(9, 68), s(1, 105)), cd(10)]);
add('tempo-3x10', 'Tempo 3x10', 'tempo', 'Three blocks at tempo with easy recoveries.', [wu(), rep(3, s(10, 82), s(4, 55)), cd()]);
add('tempo-2x20', 'Tempo 2x20', 'tempo', 'Two long tempo blocks.', [wu(), rep(2, s(20, 80), s(5, 55)), cd()]);
add('ss-2x20', 'Sweet Spot 2x20', 'sweetspot', 'The classic: two 20-minute efforts just under threshold.', [wu(), rep(2, s(20, 90), s(5, 55)), cd()]);
add('ss-3x15', 'Sweet Spot 3x15', 'sweetspot', 'Three 15-minute sweet spot blocks.', [wu(), rep(3, s(15, 90), s(5, 55)), cd()]);
add('ss-4x10', 'Sweet Spot 4x10', 'sweetspot', 'Four 10-minute sweet spot blocks — a good first sweet spot session.', [wu(), rep(4, s(10, 89), s(4, 55)), cd()]);
add('ss-3x12-ou', 'Sweet Spot 3x12 Over-Under', 'sweetspot', 'Sweet spot with 1-minute surges over threshold inside each block.', [wu(), rep(3, rep(3, s(3, 88), s(1, 105)), s(5, 55)), cd()]);
add('thr-2x20', 'Threshold 2x20', 'threshold', 'Two 20-minute efforts at threshold. Hard but steady.', [wu(12), rep(2, s(20, 97), s(8, 55)), cd()]);
add('thr-3x12', 'Threshold 3x12', 'threshold', 'Three 12-minute efforts at 100 % FTP.', [wu(12), rep(3, s(12, 100), s(6, 55)), cd()]);
add('thr-over-under', 'Over-Unders 4x8', 'threshold', 'Alternate 2 minutes just under and 1 minute just over threshold.', [wu(12), rep(4, rep(2, s(2, 95), s(1, 108)), s(2, 95), s(4, 55)), cd()]);
add('vo2-5x5', 'VO2 Max 5x5', 'vo2max', 'Five 5-minute efforts at 115 % FTP. Eyes on the clock.', [wu(12), rep(5, s(5, 115), s(5, 50)), cd()]);
add('vo2-6x4', 'VO2 Max 6x4', 'vo2max', 'Six 4-minute efforts at 118 % FTP.', [wu(12), rep(6, s(4, 118), s(4, 50)), cd()]);
add('vo2-3030', '30/30s', 'vo2max', 'Two sets of ten 30-second efforts with 30-second recoveries.', [wu(12), rep(2, rep(10, s(0.5, 130), s(0.5, 50)), s(6, 50)), cd()]);
add('vo2-4020', '40/20s', 'vo2max', 'Three sets of eight 40/20s — short rest makes it bite.', [wu(12), rep(3, rep(8, s(40 / 60, 125), s(20 / 60, 50)), s(5, 50)), cd()]);
add('tabata', 'Tabata', 'anaerobic', 'Eight 20-second all-out efforts with 10 seconds rest. Repeat twice.', [wu(15), rep(2, rep(8, s(20 / 60, 170), s(10 / 60, 40)), s(8, 50)), cd()]);
add('anaerobic-10x1', 'Anaerobic 10x1', 'anaerobic', 'Ten 1-minute efforts at 140 % FTP.', [wu(15), rep(10, s(1, 140), s(2, 50)), cd()]);
add('sprints-8', 'Sprint Session', 'sprint', 'Eight 15-second sprints. Turn ERG off for each sprint if you want to go beyond the target.', [wu(15), rep(8, s(0.25, 200, 110, 'Sprint!'), s(4.75, 55)), cd()]);
add('sprints-standing', 'Standing Starts', 'sprint', 'Six 10-second standing starts from low cadence.', [wu(15), rep(6, s(10 / 60, 180, 80, 'Big gear, stand and go'), s(4, 50)), cd()]);
add('cad-ladder', 'Cadence Ladder', 'cadence', 'Endurance power while cadence climbs from 80 to 110 rpm.', [wu(), rep(3, s(2, 70, 80), s(2, 70, 90), s(2, 70, 100), s(1, 70, 110), s(2, 55, 85)), cd()]);
add('cad-spinups', 'Spin-Ups', 'cadence', 'Short high-cadence spin-ups to smooth the pedal stroke.', [wu(), rep(8, s(0.5, 65, 120, 'Spin up!'), s(2.5, 60, 90)), cd()]);
add('single-leg', 'Single-Leg Drills', 'cadence', 'Alternate single-leg pedalling (unclip one foot) at low power.', [wu(), rep(4, s(1, 45, 70, 'Left leg only'), s(1, 45, 70, 'Right leg only'), s(2, 60, 90, 'Both legs')), cd()]);
add('pyramid', 'Pyramid', 'threshold', 'Up and down the zones: 1-2-3-4-3-2-1 minutes building to VO2.', [wu(12), ...[[1, 95], [2, 100], [3, 105], [4, 110], [3, 105], [2, 100], [1, 95]].flatMap(([m, p]) => [s(m, p), s(m, 55)]), cd()]);
add('climb-sim-alpine', 'Alpine Climb Simulation', 'climbing', 'Slope-controlled: you choose the power with your gears while the gradient changes like a long alpine pass.', [wu(10), sl(6, 5), sl(5, 7), sl(4, 8.5), sl(3, 6), sl(5, 9), sl(3, 7), sl(4, 10, 'Summit push'), free(5, 'Easy spin over the top'), cd(5)]);
add('climb-sim-punchy', 'Punchy Hills Simulation', 'climbing', 'Short steep ramps by slope, recover on the flats.', [wu(10), rep(8, sl(1.5, 9), sl(3, 1)), cd()]);
add('climb-sim-steady', 'Steady Climb 3x10 (Slope)', 'climbing', 'Three 10-minute climbs at 6 %. Ride them at threshold feel.', [wu(10), rep(3, sl(10, 6), sl(5, 0)), cd()]);
add('openers', 'Openers', 'openers', 'Short, sharp efforts to prepare the legs the day before a big ride.', [wu(12), rep(3, s(1, 110), s(2, 55)), rep(3, s(10 / 60, 160), s(110 / 60, 50)), cd(8)]);
add('mixed-hour', 'The Mixed Hour', 'tempo', 'A bit of everything in one hour: tempo, sweet spot, a few spikes.', [wu(10), s(10, 80), s(3, 55), s(8, 90), s(3, 55), rep(4, s(0.5, 130), s(1.5, 55)), s(10, 75), cd(8)]);
add('long-ss-60', 'Sweet Spot 60', 'sweetspot', 'One continuous hour with 30 minutes of sweet spot in the middle.', [wu(12), s(30, 88), s(10, 65), cd(8)]);
add('recovery-cadence', 'Easy Cadence Flow', 'recovery', 'Very easy with relaxed cadence changes.', [s(10, 50, 85), s(10, 50, 95), s(10, 50, 85)]);
add('ftp-booster-1', 'FTP Booster: Long Threshold', 'threshold', 'One long 30-minute threshold block.', [wu(12), s(30, 95), cd(10)]);
add('ftp-booster-2', 'FTP Booster: 5x6', 'threshold', 'Five 6-minute efforts slightly above threshold.', [wu(12), rep(5, s(6, 103), s(3, 55)), cd()]);
// FTP tests (plan 6.4 / 10.5 H)
add('test-ramp', 'Ramp Test', 'test', 'No FTP needed. Power rises 20 W every minute until you cannot hold it. FTP = 75 % of your best minute.', [ramp(5, 40, 50), ...Array.from({ length: 35 }, (_, i) => ({ kind: 'steady', durS: 60, target: { type: 'watts', value: 100 + i * 20 } }))], { test: 'ramp' });
add('test-ramp-pct', 'Ramp Test (by % of FTP)', 'test', 'Ramp starting from 50 % of your current FTP, +6 % per minute.', [ramp(5, 40, 50), ...Array.from({ length: 25 }, (_, i) => s(1, 50 + i * 6))], { test: 'ramp' });
add('test-ftp20', '20-Minute FTP Test', 'test', 'Warm up with openers, then ride 20 minutes as hard as you can sustain (ERG off). FTP = 95 % of the average.', [wu(10), rep(3, s(1, 110), s(1, 55)), s(5, 55), free(20, 'Go! Ride as hard as you can sustain for 20 minutes.'), cd(10)], { test: 'ftp20' });
add('test-ftp60', '60-Minute FTP Test', 'test', 'The gold standard: one hour as hard as you can (ERG off). FTP = your average power.', [wu(15), free(60, 'Steady and hard for the full hour.'), cd(10)], { test: 'ftp60' });

writeFileSync(new URL('./library.json', import.meta.url), JSON.stringify(W, null, 1));
const byId = (id) => `builtin-${id}`;
const plans = [
  { id: 'plan-base-4w', name: '4-Week Base', description: 'Aerobic base with tempo and sweet spot, three to four rides a week.', weeks: [
    [byId('z2-60'), byId('tempo-3x10'), byId('cadence-intro'), byId('z2-90')], [byId('z2-60'), byId('ss-4x10'), byId('recovery-30'), byId('z2-90')],
    [byId('endurance-surges'), byId('ss-3x15'), byId('recovery-30'), byId('z2-120')], [byId('recovery-45'), byId('tempo-2x20'), byId('z2-60')] ] },
  { id: 'plan-build-4w', name: '4-Week Build', description: 'Threshold and VO2 max on top of a solid base.', weeks: [
    [byId('ss-2x20'), byId('z2-60'), byId('vo2-5x5'), byId('z2-90')], [byId('thr-3x12'), byId('recovery-30'), byId('vo2-3030'), byId('z2-90')],
    [byId('thr-over-under'), byId('z2-60'), byId('vo2-6x4'), byId('z2-120')], [byId('recovery-45'), byId('openers'), byId('test-ramp')] ] },
  { id: 'plan-ftp-booster', name: 'FTP Booster', description: 'Four focused weeks to lift threshold, finishing with a test.', weeks: [
    [byId('test-ramp'), byId('ss-3x15'), byId('z2-60'), byId('ftp-booster-1')], [byId('thr-2x20'), byId('recovery-30'), byId('ftp-booster-2'), byId('z2-90')],
    [byId('thr-over-under'), byId('z2-60'), byId('ss-3x12-ou'), byId('long-ss-60')], [byId('recovery-45'), byId('openers'), byId('test-ftp20')] ] },
];
writeFileSync(new URL('./plans.json', import.meta.url), JSON.stringify(plans, null, 1));
console.log(`library.json: ${W.length} workouts; plans.json: ${plans.length} plans`);
