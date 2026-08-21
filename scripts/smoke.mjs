// Imports the *built* dist/, not src/, so a broken build (bad bundling, a dropped
// export) fails here even with a fully green vitest run. Plain Node, no test runner,
// and no syntax past what `engines` in package.json claims — this runs on the oldest
// supported Node, which the build toolchain itself does not.
import { analyzeSensitivity, calculateSchedule, defineCalendar, Weekday } from '../dist/index.mjs';

const fail = (message) => {
  console.error(`smoke test failed: ${message}`);
  process.exit(1);
};

const calendar = defineCalendar({
  workingWeekdays: [
    Weekday.Monday,
    Weekday.Tuesday,
    Weekday.Wednesday,
    Weekday.Thursday,
    Weekday.Friday,
  ],
  from: '2025-01-01',
  to: '2027-12-31',
  holidays: ['2025-12-25', '2026-01-01', '2026-01-12'],
});

if (!calendar.ok) {
  fail(`defineCalendar rejected a valid spec: ${calendar.issues.map((i) => i.message).join('; ')}`);
}

// The same network as the README's usage example, so the built package is checked
// against the numbers the documentation promises rather than against itself.
const input = {
  calendar: calendar.value,
  projectStart: '2025-12-29',
  tasks: [
    { id: 'a', duration: 4 },
    { id: 'b', duration: 6, dependencies: [{ predecessorId: 'a' }] },
    { id: 'c', duration: 3, dependencies: [{ predecessorId: 'a' }] },
    { id: 'd', duration: 8, dependencies: [{ predecessorId: 'b' }, { predecessorId: 'c' }] },
  ],
};

const result = calculateSchedule(input);
if (!result.ok)
  fail(`calculateSchedule returned issues: ${result.issues.map((i) => i.code).join(', ')}`);

if (result.value.finish !== '2026-01-23')
  fail(`finish is ${result.value.finish}, expected 2026-01-23`);
if (result.value.duration !== 18) fail(`duration is ${result.value.duration}, expected 18`);

const c = result.value.tasks.find((task) => task.id === 'c');
if (c.totalFloat !== 3) fail(`c has ${c.totalFloat} days of float, expected 3`);
if (result.value.criticalPath.join(',') !== 'a,b,d')
  fail(`critical path is ${result.value.criticalPath.join(',')}`);

// The generalized relations and the analysis reach the built output too.
const overlapped = calculateSchedule({
  ...input,
  tasks: [
    { id: 'a', duration: 4 },
    { id: 'b', duration: 6, dependencies: [{ predecessorId: 'a', type: 'SS', lag: 2 }] },
  ],
});
if (!overlapped.ok) fail('a start-to-start relation was rejected');

const sensitivity = analyzeSensitivity(input);
if (!sensitivity.ok) fail('analyzeSensitivity returned issues');
if (sensitivity.value.find((s) => s.id === 'a').ifOneDayLonger !== 1)
  fail('sensitivity of a is wrong');

console.log(`smoke test passed: dist/ scheduled the example to finish on ${result.value.finish}`);
