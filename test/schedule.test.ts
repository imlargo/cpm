import { describe, expect, it } from 'vitest';

import { calculateSchedule, defineCalendar, type Schedule, type Task } from '../src/index.js';

import { colombiaCalendar, COLOMBIA_SPEC } from './support/calendar.js';

const calendar = colombiaCalendar();

/** Runs the engine, failing the test with the issues if it could not schedule. */
function schedule(tasks: readonly Task[], projectStart = '2026-02-02'): Schedule {
  const result = calculateSchedule({ tasks, calendar, projectStart });
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return result.value;
}

/** The scheduled task with that id. */
function taskOf(result: Schedule, id: string): Schedule['tasks'][number] {
  const found = result.tasks.find((task) => task.id === id);
  if (found === undefined) throw new Error(`task "${id}" is missing from the schedule`);
  return found;
}

describe('a chain of tasks', () => {
  const result = schedule([
    { id: 'a', duration: 3 },
    { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a' }] },
  ]);

  it('starts each task the working day after its predecessor finishes', () => {
    expect(taskOf(result, 'a').earliestStart).toBe('2026-02-02');
    expect(taskOf(result, 'a').earliestFinish).toBe('2026-02-04');
    expect(taskOf(result, 'b').earliestStart).toBe('2026-02-05');
    expect(taskOf(result, 'b').earliestFinish).toBe('2026-02-06');
  });

  it('leaves no float anywhere on the chain', () => {
    expect(result.tasks.map((task) => task.totalFloat)).toEqual([0, 0]);
    expect(result.criticalPath).toEqual(['a', 'b']);
  });

  it('reports the project span in working days', () => {
    expect(result.start).toBe('2026-02-02');
    expect(result.finish).toBe('2026-02-06');
    expect(result.duration).toBe(5);
  });
});

describe('tasks running in parallel', () => {
  const parallel = (durationOfB: number): Schedule =>
    schedule([
      { id: 'a', duration: 5 },
      { id: 'b', duration: durationOfB },
      {
        id: 'c',
        duration: 1,
        dependencies: [{ predecessorId: 'a' }, { predecessorId: 'b' }],
      },
    ]);

  it('puts both on the critical path when they take the same time', () => {
    const result = parallel(5);

    expect(taskOf(result, 'a').isCritical).toBe(true);
    expect(taskOf(result, 'b').isCritical).toBe(true);
    expect(taskOf(result, 'a').totalFloat).toBe(0);
    expect(taskOf(result, 'b').totalFloat).toBe(0);
    expect(result.criticalPath).toEqual(['a', 'b', 'c']);
  });

  it('gives the shorter one the difference as float', () => {
    const result = parallel(3);
    const b = taskOf(result, 'b');

    expect(b.isCritical).toBe(false);
    expect(b.totalFloat).toBe(2);
    expect(b.freeFloat).toBe(2);
    expect(result.criticalPath).toEqual(['a', 'c']);
  });

  it('waits for the last predecessor to finish', () => {
    const result = parallel(3);
    expect(taskOf(result, 'c').earliestStart).toBe('2026-02-09');
  });
});

describe('float', () => {
  it('separates free float from total float along a chain', () => {
    // b and c both feed d, but c is shorter: it can slip without moving d.
    const result = schedule([
      { id: 'a', duration: 2 },
      { id: 'b', duration: 4, dependencies: [{ predecessorId: 'a' }] },
      { id: 'c', duration: 1, dependencies: [{ predecessorId: 'a' }] },
      {
        id: 'd',
        duration: 1,
        dependencies: [{ predecessorId: 'b' }, { predecessorId: 'c' }],
      },
    ]);

    expect(taskOf(result, 'c').totalFloat).toBe(3);
    expect(taskOf(result, 'c').freeFloat).toBe(3);
    expect(taskOf(result, 'b').freeFloat).toBe(0);
  });

  it('measures a trailing task against the project finish', () => {
    const result = schedule([
      { id: 'long', duration: 5 },
      { id: 'short', duration: 2 },
    ]);

    expect(taskOf(result, 'short').totalFloat).toBe(3);
    expect(taskOf(result, 'short').freeFloat).toBe(3);
  });
});

describe('milestones', () => {
  it('starts and finishes on the same day', () => {
    const result = schedule([
      { id: 'a', duration: 2 },
      { id: 'ready', duration: 0, dependencies: [{ predecessorId: 'a' }] },
    ]);
    const milestone = taskOf(result, 'ready');

    expect(milestone.earliestStart).toBe('2026-02-04');
    expect(milestone.earliestFinish).toBe('2026-02-04');
    expect(milestone.latestStart).toBe(milestone.latestFinish);
  });
});

describe('lag', () => {
  it('delays the successor by that many working days', () => {
    const result = schedule([
      { id: 'pour', duration: 2 },
      { id: 'strip', duration: 1, dependencies: [{ predecessorId: 'pour', lag: 3 }] },
    ]);

    expect(taskOf(result, 'pour').earliestFinish).toBe('2026-02-03');
    expect(taskOf(result, 'strip').earliestStart).toBe('2026-02-09');
  });

  it('overlaps the tasks with a negative lag', () => {
    const result = schedule([
      { id: 'a', duration: 3 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', lag: -1 }] },
    ]);

    expect(taskOf(result, 'a').earliestFinish).toBe('2026-02-04');
    expect(taskOf(result, 'b').earliestStart).toBe('2026-02-04');
  });
});

describe('a lag that reaches outside the calendar', () => {
  const tightCalendar = defineCalendar({
    ...COLOMBIA_SPEC,
    from: '2026-02-02', // the project's own start date
    to: '2026-12-31',
  });

  it('does not fail a schedule over a constraint that cannot bind', () => {
    expect(tightCalendar.ok).toBe(true);
    if (!tightCalendar.ok) return;

    // b may start two days before a finishes, which points before the calendar
    // begins. Nothing can start before the project does, so it changes nothing.
    const result = calculateSchedule({
      calendar: tightCalendar.value,
      projectStart: '2026-02-02',
      tasks: [
        { id: 'a', duration: 1 },
        { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', lag: -2 }] },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(taskOf(result.value, 'b').earliestStart).toBe('2026-02-02');
    expect(taskOf(result.value, 'b').earliestFinish).toBe('2026-02-03');
  });

  it('never lets a task finish after the project does', () => {
    // The overlap would let "a" finish three days after "b" starts, but the
    // project is over when its last task is done, so "a" has no float at all.
    const result = schedule([
      { id: 'a', duration: 2 },
      { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a', lag: -3 }] },
    ]);

    expect(result.finish).toBe('2026-02-03');
    expect(taskOf(result, 'a').latestFinish).toBe('2026-02-03');
    expect(taskOf(result, 'a').totalFloat).toBe(0);
    expect(taskOf(result, 'a').isCritical).toBe(true);
  });
});

describe('the working calendar', () => {
  it('jumps the weekends and the holidays it was given', () => {
    // The documented case: four working days from 29 December 2025.
    const result = schedule([{ id: 'closeout', duration: 4 }], '2025-12-29');

    expect(taskOf(result, 'closeout').earliestStart).toBe('2025-12-29');
    expect(taskOf(result, 'closeout').earliestFinish).toBe('2026-01-02');
  });

  it('starts on the first working day on or after the requested date', () => {
    const result = schedule([{ id: 'a', duration: 1 }], '2026-01-01');
    expect(result.start).toBe('2026-01-02');
  });
});

describe('circular dependencies', () => {
  it('reports the cycle instead of hanging or throwing', () => {
    const result = calculateSchedule({
      calendar,
      projectStart: '2026-02-02',
      tasks: [
        { id: 'a', duration: 1, dependencies: [{ predecessorId: 'c' }] },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a' }] },
        { id: 'c', duration: 1, dependencies: [{ predecessorId: 'b' }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const [issue] = result.issues;
    expect(issue?.code).toBe('circular-dependency');
    if (issue?.code !== 'circular-dependency') return;
    expect([...issue.cycle].sort()).toEqual(['a', 'b', 'c']);
    expect(issue.message).toContain('circle');
  });

  it('reports each cycle once', () => {
    const result = calculateSchedule({
      calendar,
      projectStart: '2026-02-02',
      tasks: [
        { id: 'a', duration: 1, dependencies: [{ predecessorId: 'b' }] },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a' }] },
        { id: 'c', duration: 1, dependencies: [{ predecessorId: 'd' }] },
        { id: 'd', duration: 1, dependencies: [{ predecessorId: 'c' }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(2);
  });
});

describe('invalid input', () => {
  const issuesOf = (tasks: readonly Task[], projectStart = '2026-02-02'): string[] => {
    const result = calculateSchedule({ tasks, calendar, projectStart });
    return result.ok ? [] : result.issues.map((issue) => issue.code);
  };

  it('reports unknown predecessors', () => {
    expect(
      issuesOf([{ id: 'a', duration: 1, dependencies: [{ predecessorId: 'ghost' }] }]),
    ).toEqual(['unknown-predecessor']);
  });

  it('reports duplicate ids', () => {
    expect(
      issuesOf([
        { id: 'a', duration: 1 },
        { id: 'a', duration: 2 },
      ]),
    ).toEqual(['duplicate-task-id']);
  });

  it('reports a task that depends on itself', () => {
    expect(issuesOf([{ id: 'a', duration: 1, dependencies: [{ predecessorId: 'a' }] }])).toEqual([
      'self-dependency',
    ]);
  });

  it('reports durations and lags that are not whole days', () => {
    expect(issuesOf([{ id: 'a', duration: -1 }])).toEqual(['invalid-duration']);
    expect(issuesOf([{ id: 'a', duration: 1.5 }])).toEqual(['invalid-duration']);
    expect(
      issuesOf([
        { id: 'a', duration: 1 },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a', lag: 0.5 }] },
      ]),
    ).toEqual(['invalid-lag']);
  });

  it('reports dependency types this version does not compute', () => {
    expect(
      issuesOf([
        { id: 'a', duration: 1 },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a', type: 'SS' }] },
      ]),
    ).toEqual(['unsupported-dependency-type']);
  });

  it('collects every problem instead of stopping at the first', () => {
    expect(
      issuesOf([
        { id: 'a', duration: -1 },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'ghost' }] },
      ]),
    ).toEqual(['invalid-duration', 'unknown-predecessor']);
  });

  it('reports a project start it cannot read or place', () => {
    expect(issuesOf([{ id: 'a', duration: 1 }], 'tomorrow')).toEqual(['invalid-project-start']);
    expect(issuesOf([{ id: 'a', duration: 1 }], '2030-01-01')).toEqual([
      'project-start-outside-calendar',
    ]);
  });

  it('reports work that runs past the end of the calendar', () => {
    const january = defineCalendar({ ...COLOMBIA_SPEC, from: '2026-01-01', to: '2026-01-31' });
    expect(january.ok).toBe(true);
    if (!january.ok) return;

    const result = calculateSchedule({
      calendar: january.value,
      projectStart: '2026-01-02',
      tasks: [{ id: 'a', duration: 100 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('outside-calendar-range');
  });
});

describe('schedules far larger than a spreadsheet', () => {
  const chainOf = (count: number, closeTheLoop: boolean): Task[] =>
    Array.from({ length: count }, (_unused, index) => ({
      id: `t${String(index)}`,
      duration: 1,
      dependencies:
        index === 0
          ? closeTheLoop
            ? [{ predecessorId: `t${String(count - 1)}` }]
            : []
          : [{ predecessorId: `t${String(index - 1)}` }],
    }));

  const decades = defineCalendar({ ...COLOMBIA_SPEC, from: '2000-01-01', to: '2090-12-31' });

  it('schedules ten thousand tasks in one chain', () => {
    expect(decades.ok).toBe(true);
    if (!decades.ok) return;

    const result = calculateSchedule({
      calendar: decades.value,
      projectStart: '2000-01-03',
      tasks: chainOf(10_000, false),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duration).toBe(10_000);
    expect(result.value.criticalPath).toHaveLength(10_000);
  });

  it('reports a cycle twenty thousand tasks long as data, not as a stack overflow', () => {
    expect(decades.ok).toBe(true);
    if (!decades.ok) return;

    const result = calculateSchedule({
      calendar: decades.value,
      projectStart: '2000-01-03',
      tasks: chainOf(20_000, true),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const [issue] = result.issues;
    expect(issue?.code).toBe('circular-dependency');
    if (issue?.code !== 'circular-dependency') return;
    expect(issue.cycle).toHaveLength(20_000);
  });
});

describe('the engine itself', () => {
  const tasks: readonly Task[] = [
    { id: 'a', duration: 3 },
    { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a', lag: 1 }] },
    { id: 'c', duration: 4, dependencies: [{ predecessorId: 'a' }] },
  ];

  it('gives the same answer every time', () => {
    expect(schedule(tasks)).toEqual(schedule(tasks));
  });

  it('does not touch the input', () => {
    const before = JSON.stringify(tasks);
    schedule(tasks);
    expect(JSON.stringify(tasks)).toBe(before);
  });

  it('returns the tasks in the order they were given', () => {
    expect(schedule(tasks).tasks.map((task) => task.id)).toEqual(['a', 'b', 'c']);
  });

  it('schedules nothing when there is nothing to schedule', () => {
    const result = schedule([]);
    expect(result.tasks).toEqual([]);
    expect(result.criticalPath).toEqual([]);
    expect(result.duration).toBe(0);
  });
});
