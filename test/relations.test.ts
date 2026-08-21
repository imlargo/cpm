import { describe, expect, it } from 'vitest';

import { calculateSchedule, type Schedule, type Task } from '../src/index.js';

import { fixtureCalendar } from './support/calendar.js';

/**
 * The four relation types, minimum and maximum lags.
 *
 * Every expected date here was worked out by hand from the standardized weight
 * `endOffset(from) - endOffset(to) + lag`, not read off the engine.
 *
 * The calendar is Monday to Friday, and the project starts Monday 2 February
 * 2026, so the working days run 02-02, 02-03, 02-04, 02-05, 02-06, 02-09, …
 */

const calendar = fixtureCalendar();

function schedule(tasks: readonly Task[]): Schedule {
  const result = calculateSchedule({ tasks, calendar, projectStart: '2026-02-02' });
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result.value;
}

function taskOf(result: Schedule, id: string): Schedule['tasks'][number] {
  const found = result.tasks.find((task) => task.id === id);
  if (found === undefined) throw new Error(`task "${id}" is missing`);
  return found;
}

describe('start-to-start', () => {
  it('offsets the successor from the predecessor’s start', () => {
    // weight = 0 - 0 + 2 = 2, so b starts two working days after a does.
    const result = schedule([
      { id: 'a', duration: 4 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', type: 'SS', lag: 2 }] },
    ]);

    expect(taskOf(result, 'a').earliestStart).toBe('2026-02-02');
    expect(taskOf(result, 'b').earliestStart).toBe('2026-02-04');
    expect(taskOf(result, 'b').earliestFinish).toBe('2026-02-05');
  });

  it('starts them together with no lag', () => {
    const result = schedule([
      { id: 'a', duration: 3 },
      { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a', type: 'SS' }] },
    ]);

    expect(taskOf(result, 'b').earliestStart).toBe(taskOf(result, 'a').earliestStart);
  });
});

describe('finish-to-finish', () => {
  it('offsets the successor’s finish from the predecessor’s', () => {
    // weight = 4 - 2 + 1 = 3: b finishes one working day after a.
    const result = schedule([
      { id: 'a', duration: 4 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', type: 'FF', lag: 1 }] },
    ]);

    expect(taskOf(result, 'a').earliestFinish).toBe('2026-02-05');
    expect(taskOf(result, 'b').earliestStart).toBe('2026-02-05');
    expect(taskOf(result, 'b').earliestFinish).toBe('2026-02-06');
  });

  it('finishes them together with no lag', () => {
    const result = schedule([
      { id: 'a', duration: 4 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', type: 'FF' }] },
    ]);

    expect(taskOf(result, 'b').earliestFinish).toBe(taskOf(result, 'a').earliestFinish);
  });
});

describe('start-to-finish', () => {
  it('ties the successor’s finish to the predecessor’s start', () => {
    // The rarest relation: b cannot finish until a starts. weight = 0 - 2 + 0,
    // so b must finish on or after the working day before a begins.
    const result = schedule([
      { id: 'driver', duration: 5 },
      { id: 'a', duration: 3, dependencies: [{ predecessorId: 'driver' }] },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', type: 'SF' }] },
    ]);

    expect(taskOf(result, 'a').earliestStart).toBe('2026-02-09');
    expect(taskOf(result, 'b').earliestStart).toBe('2026-02-05');
    expect(taskOf(result, 'b').earliestFinish).toBe('2026-02-06');
  });
});

describe('the standardization itself', () => {
  it('makes finish-to-start the same relation as start-to-start shifted by the duration', () => {
    // weight(FS, lag d) = endOffset(a) + d = weight(SS, lag endOffset(a) + d).
    const asFinishToStart = schedule([
      { id: 'a', duration: 4 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', lag: 1 }] },
    ]);
    const asStartToStart = schedule([
      { id: 'a', duration: 4 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', type: 'SS', lag: 5 }] },
    ]);

    expect(asStartToStart).toEqual(asFinishToStart);
  });

  it('makes a milestone’s successors follow it rather than sit on it', () => {
    // endOffset is never zero, so a zero-duration activity still separates.
    const result = schedule([
      { id: 'gate', duration: 0 },
      { id: 'after', duration: 1, dependencies: [{ predecessorId: 'gate' }] },
    ]);

    expect(taskOf(result, 'gate').earliestFinish).toBe('2026-02-02');
    expect(taskOf(result, 'after').earliestStart).toBe('2026-02-03');
  });
});

describe('a maximum lag', () => {
  const withMaximum = (maxLag: number | undefined): Schedule =>
    schedule([
      { id: 'a', duration: 2 },
      { id: 'x', duration: 4, dependencies: [{ predecessorId: 'a' }] },
      {
        id: 'b',
        duration: 1,
        dependencies: [{ predecessorId: 'a', ...(maxLag === undefined ? {} : { maxLag }) }],
      },
    ]);

  it('pins a successor that would otherwise drift', () => {
    // Without a maximum, b may happen any time after a: three days of float.
    expect(taskOf(withMaximum(undefined), 'b').totalFloat).toBe(3);
    // Pinned to start the day a finishes, it moves only when a moves.
    expect(taskOf(withMaximum(0), 'b').totalFloat).toBe(0);
    expect(taskOf(withMaximum(0), 'b').isCritical).toBe(true);
  });

  it('leaves the earliest dates alone', () => {
    // A maximum bounds how late a relation may be, so it cannot push anything
    // earlier than it already was.
    expect(taskOf(withMaximum(0), 'b').earliestStart).toBe(
      taskOf(withMaximum(undefined), 'b').earliestStart,
    );
  });
});

describe('circles', () => {
  it('allows a circle whose lags cancel out', () => {
    // b may start four days before a finishes, and a may not start until the day
    // after b does. Both hold at once, so the schedule exists — where a version
    // that treated every circle as an error would have refused it.
    const result = calculateSchedule({
      calendar,
      projectStart: '2026-02-02',
      tasks: [
        { id: 'a', duration: 1, dependencies: [{ predecessorId: 'b' }] },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a', lag: -5 }] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(taskOf(result.value, 'b').earliestStart).toBe('2026-02-02');
    expect(taskOf(result.value, 'a').earliestStart).toBe('2026-02-03');
  });

  it('refuses one that gains length on every lap, and says by how much', () => {
    const result = calculateSchedule({
      calendar,
      projectStart: '2026-02-02',
      tasks: [
        { id: 'a', duration: 3, dependencies: [{ predecessorId: 'b' }] },
        { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a' }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const [issue] = result.issues;
    if (issue?.code !== 'circular-dependency') throw new Error('expected a circle');
    // Each waits for the whole of the other: three days plus two.
    expect(issue.excess).toBe(5);
    expect([...issue.cycle].sort()).toEqual(['a', 'b']);
  });
});

describe('date windows', () => {
  it('holds an activity back until its window opens', () => {
    const result = schedule([
      { id: 'a', duration: 2, window: { startNotBefore: '2026-02-09' } },
      { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a' }] },
    ]);

    expect(taskOf(result, 'a').earliestStart).toBe('2026-02-09');
    expect(taskOf(result, 'b').earliestStart).toBe('2026-02-11');
  });

  it('moves a window onto a working day, inwards', () => {
    // Saturday is not worked, so "not before Saturday" means Monday.
    const result = schedule([{ id: 'a', duration: 1, window: { startNotBefore: '2026-02-07' } }]);
    expect(taskOf(result, 'a').earliestStart).toBe('2026-02-09');
  });

  it('takes float away from an activity that must not run late', () => {
    const tasks: Task[] = [
      { id: 'long', duration: 6 },
      { id: 'short', duration: 1 },
    ];
    expect(taskOf(schedule(tasks), 'short').totalFloat).toBe(5);

    const pinned = schedule([
      { id: 'long', duration: 6 },
      { id: 'short', duration: 1, window: { finishNotAfter: '2026-02-04' } },
    ]);
    expect(taskOf(pinned, 'short').totalFloat).toBe(2);
    expect(taskOf(pinned, 'short').freeFloat).toBe(2);
  });

  it('reports a window nothing can meet, and by how much it is missed', () => {
    const result = calculateSchedule({
      calendar,
      projectStart: '2026-02-02',
      tasks: [{ id: 'a', duration: 5, window: { finishNotAfter: '2026-02-03' } }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const [issue] = result.issues;
    if (issue?.code !== 'impossible-time-window') throw new Error('expected a window conflict');
    // Five days from Monday finishes on the Friday; the window asks for Tuesday.
    expect(issue.excess).toBe(3);
    expect(issue.cycle).toEqual(['a']);
  });

  it('reports dates it cannot read or place', () => {
    const codes = (tasks: readonly Task[]): string[] => {
      const result = calculateSchedule({ tasks, calendar, projectStart: '2026-02-02' });
      return result.ok ? [] : result.issues.map((issue) => issue.code);
    };

    expect(codes([{ id: 'a', duration: 1, window: { startNotBefore: 'soon' } }])).toEqual([
      'invalid-window',
    ]);
    expect(codes([{ id: 'a', duration: 1, window: { startNotAfter: '2030-01-01' } }])).toEqual([
      'window-outside-calendar',
    ]);
  });
});
