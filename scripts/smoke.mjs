// Imports the *built* dist/, not src/, so a broken build (bad bundling, a dropped
// export) fails here even with a fully green vitest run. Plain Node, no test runner,
// and no syntax past what `engines` in package.json claims — this runs on the oldest
// supported Node, which the build toolchain itself does not.
import { calculateSchedule, defineCalendar, Weekday } from '../dist/index.mjs';

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

// The same project as the README's usage example, so the built package is checked
// against the numbers the documentation promises rather than against itself.
const result = calculateSchedule({
  calendar: calendar.value,
  projectStart: '2025-12-29',
  tasks: [
    { id: 'excavacion', duration: 4 },
    { id: 'cimentacion', duration: 6, dependencies: [{ predecessorId: 'excavacion' }] },
    { id: 'acometida', duration: 3, dependencies: [{ predecessorId: 'excavacion' }] },
    {
      id: 'estructura',
      duration: 8,
      dependencies: [{ predecessorId: 'cimentacion' }, { predecessorId: 'acometida' }],
    },
  ],
});

if (!result.ok) {
  fail(
    `calculateSchedule rejected a valid project: ${result.issues.map((i) => i.message).join('; ')}`,
  );
}

const { finish, criticalPath, tasks } = result.value;

if (finish !== '2026-01-23') {
  fail(`expected the project to finish on 2026-01-23, got ${finish}`);
}

const expectedPath = 'excavacion,cimentacion,estructura';
if (criticalPath.join(',') !== expectedPath) {
  fail(`expected critical path ${expectedPath}, got ${criticalPath.join(',')}`);
}

const acometida = tasks.find((task) => task.id === 'acometida');
if (acometida === undefined || acometida.totalFloat !== 3 || acometida.isCritical) {
  fail(
    'expected acometida to carry three working days of total float and stay off the critical path',
  );
}

console.log(`smoke test passed: dist/ scheduled the example project to finish on ${finish}`);
