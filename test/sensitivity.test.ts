import { describe, expect, it } from 'vitest';

import { analyzeSensitivity, type Task, type TaskSensitivity } from '../src/index.js';

import { fixtureCalendar } from './support/calendar.js';

/**
 * How the project's finish answers to one activity taking a day more or less.
 *
 * The interesting cases are the ones where the answer is not what a single
 * critical-path diagram suggests — the anomalies Wiest (1981) described.
 */

const calendar = fixtureCalendar();

function sensitivityOf(tasks: readonly Task[]): Map<string, TaskSensitivity> {
  const result = analyzeSensitivity({ tasks, calendar, projectStart: '2026-02-02' });
  if (!result.ok) throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`);
  return new Map(result.value.map((entry) => [entry.id, entry]));
}

describe('ordinary schedules', () => {
  it('moves the finish with every activity on the critical path', () => {
    const report = sensitivityOf([
      { id: 'a', duration: 3 },
      { id: 'b', duration: 2, dependencies: [{ predecessorId: 'a' }] },
    ]);

    expect(report.get('a')).toEqual({ id: 'a', ifOneDayLonger: 1, ifOneDayShorter: -1 });
    expect(report.get('b')).toEqual({ id: 'b', ifOneDayLonger: 1, ifOneDayShorter: -1 });
  });

  it('leaves the finish alone for an activity with float to spare', () => {
    const report = sensitivityOf([
      { id: 'long', duration: 5 },
      { id: 'short', duration: 3 },
      {
        id: 'after',
        duration: 1,
        dependencies: [{ predecessorId: 'long' }, { predecessorId: 'short' }],
      },
    ]);

    expect(report.get('short')).toEqual({ id: 'short', ifOneDayLonger: 0, ifOneDayShorter: 0 });
    expect(report.get('long')?.ifOneDayLonger).toBe(1);
  });

  it('has nothing to shorten in a milestone', () => {
    const report = sensitivityOf([
      { id: 'a', duration: 2 },
      { id: 'gate', duration: 0, dependencies: [{ predecessorId: 'a' }] },
    ]);

    expect(report.get('gate')?.ifOneDayShorter).toBe(0);
  });
});

describe('an activity that is critical in reverse', () => {
  // "middle" has to finish when "first" does, and "last" starts when "middle"
  // starts. Give "middle" another day and it must begin a day earlier to still
  // finish on time — which drags "last" earlier with it, and the project ends
  // sooner. No maximum lag needed: finish-to-finish followed by start-to-start
  // is enough.
  const tasks: Task[] = [
    { id: 'first', duration: 5 },
    { id: 'middle', duration: 1, dependencies: [{ predecessorId: 'first', type: 'FF' }] },
    { id: 'last', duration: 5, dependencies: [{ predecessorId: 'middle', type: 'SS' }] },
  ];

  it('pulls the finish earlier when it takes longer', () => {
    expect(sensitivityOf(tasks).get('middle')?.ifOneDayLonger).toBe(-1);
  });

  it('is not distinguishable by float alone', () => {
    // Float says only that it has none; the sign of the response is what says
    // which way it pushes.
    const report = sensitivityOf(tasks);
    expect(report.get('first')?.ifOneDayLonger).toBe(1);
    expect(report.get('middle')?.ifOneDayLonger).toBe(-1);
  });
});

describe('a direction that leaves no schedule at all', () => {
  it('reports it as infinite rather than as a number', () => {
    // "b" must start the day "a" finishes, no later, and be done by the 9th.
    // A longer "a" leaves nothing that satisfies both.
    const report = sensitivityOf([
      { id: 'a', duration: 4 },
      {
        id: 'b',
        duration: 2,
        dependencies: [{ predecessorId: 'a', lag: 0, maxLag: 0 }],
        window: { finishNotAfter: '2026-02-09' },
      },
    ]);

    expect(report.get('a')?.ifOneDayLonger).toBe(Number.POSITIVE_INFINITY);
    expect(report.get('a')?.ifOneDayShorter).toBe(-1);
  });

  it('passes the issues through when the schedule itself is impossible', () => {
    const result = analyzeSensitivity({
      calendar,
      projectStart: '2026-02-02',
      tasks: [
        { id: 'a', duration: 1, dependencies: [{ predecessorId: 'b' }] },
        { id: 'b', duration: 1, dependencies: [{ predecessorId: 'a' }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('circular-dependency');
  });
});
