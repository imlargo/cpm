import { describe, expect, it } from 'vitest';

import {
  calculateSchedule,
  defineCalendar,
  Weekday,
  type CalendarSpec,
  type Task,
} from '../src/index.js';

import { COLOMBIA_SPEC } from './support/calendar.js';
import { referenceSchedule, workingDaysOf } from './support/reference.js';

/**
 * The engine against the naive reference, and against the laws of the method
 * itself, over thousands of random schedules.
 *
 * Worked examples pin down the cases somebody thought of. This covers the ones
 * nobody did: it is what caught the engine leaving a task's latest finish free
 * to run past the end of the project, which only shows up with negative lag.
 */

/** Calendars shaped differently enough to shake out different edge cases. */
const CALENDARS: { readonly name: string; readonly spec: CalendarSpec }[] = [
  { name: 'a Monday-to-Friday week with holidays', spec: COLOMBIA_SPEC },
  {
    name: 'the six-day week a construction site runs',
    spec: {
      ...COLOMBIA_SPEC,
      workingWeekdays: [
        Weekday.Monday,
        Weekday.Tuesday,
        Weekday.Wednesday,
        Weekday.Thursday,
        Weekday.Friday,
        Weekday.Saturday,
      ],
    },
  },
  {
    name: 'a three-day week, where the gaps outnumber the working days',
    spec: {
      ...COLOMBIA_SPEC,
      workingWeekdays: [Weekday.Monday, Weekday.Wednesday, Weekday.Friday],
    },
  },
  {
    name: 'a holiday-heavy calendar with recovered Saturdays',
    spec: {
      ...COLOMBIA_SPEC,
      holidays: Array.from(
        { length: 27 },
        (_unused, index) => `2026-0${String((index % 9) + 1)}-1${String(index % 3)}`,
      ),
      extraWorkingDays: ['2026-02-07', '2026-02-14', '2026-03-07'],
    },
  },
];

const START_DATES = ['2026-01-05', '2026-02-07', '2026-04-02', '2025-12-26'];

/** A tiny seeded generator: random schedules, but the same ones every run. */
function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function randomTasks(random: () => number, count: number, maxLag: number): Task[] {
  const pick = (bound: number): number => Math.floor(random() * bound);
  const tasks: Task[] = [];

  for (let index = 0; index < count; index += 1) {
    // Only earlier tasks are eligible as predecessors, which keeps it acyclic.
    const dependencies = [];
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (random() < 0.3) {
        dependencies.push({
          predecessorId: `t${String(earlier)}`,
          lag: pick(maxLag * 2 + 1) - maxLag,
        });
      }
    }
    tasks.push({ id: `t${String(index)}`, duration: pick(6), dependencies });
  }

  return tasks;
}

describe('against a naive reference implementation', () => {
  const compare = (spec: CalendarSpec, trials: number, maxTasks: number, maxLag: number): void => {
    const built = defineCalendar(spec);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const workingDays = workingDaysOf(spec);
    const random = randomSource(20260819);

    for (let trial = 0; trial < trials; trial += 1) {
      const tasks = randomTasks(random, 2 + Math.floor(random() * maxTasks), maxLag);
      const projectStart = START_DATES[trial % START_DATES.length] ?? '2026-01-05';
      const where = `schedule ${String(trial)} from ${projectStart}: ${JSON.stringify(tasks)}`;

      const result = calculateSchedule({ tasks, calendar: built.value, projectStart });
      expect(result.ok, where).toBe(true);
      if (!result.ok) return;

      const expected = referenceSchedule(tasks, workingDays, projectStart);
      for (const task of result.value.tasks) {
        const actual = {
          earliestStart: task.earliestStart,
          earliestFinish: task.earliestFinish,
          latestStart: task.latestStart,
          latestFinish: task.latestFinish,
          totalFloat: task.totalFloat,
          freeFloat: task.freeFloat,
          isCritical: task.isCritical,
        };
        expect(actual, `${where}, task ${task.id}`).toEqual(expected.get(task.id));
      }
    }
  };

  it('agrees on schedules without lag', () => {
    compare(COLOMBIA_SPEC, 300, 12, 0);
  });

  it('agrees on schedules with lag in both directions', () => {
    compare(COLOMBIA_SPEC, 300, 12, 3);
  });

  it('agrees on wider schedules with heavy overlap', () => {
    compare(COLOMBIA_SPEC, 100, 30, 5);
  });

  for (const { name, spec } of CALENDARS) {
    it(`agrees on ${name}`, () => {
      compare(spec, 120, 12, 3);
    });
  }
});

describe('the laws every schedule obeys', () => {
  const built = defineCalendar(COLOMBIA_SPEC);
  const workingDays = workingDaysOf(COLOMBIA_SPEC);

  /** Where a date sits among the working days, counted without the library. */
  const positionOf = (iso: string): number => workingDays.indexOf(iso);

  it('hold over a thousand random schedules', () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const random = randomSource(2026);

    for (let trial = 0; trial < 1000; trial += 1) {
      const tasks = randomTasks(random, 2 + Math.floor(random() * 14), 3);
      const projectStart = '2026-01-05';
      const where = `schedule ${String(trial)}: ${JSON.stringify(tasks)}`;

      const result = calculateSchedule({ tasks, calendar: built.value, projectStart });
      expect(result.ok, where).toBe(true);
      if (!result.ok) return;

      const schedule = result.value;
      const byId = new Map(schedule.tasks.map((task) => [task.id, task]));
      const start = positionOf(schedule.start);
      const finish = positionOf(schedule.finish);

      for (const task of schedule.tasks) {
        const earliest = positionOf(task.earliestStart);
        const latest = positionOf(task.latestStart);
        const label = `${where}, task ${task.id}`;

        // Nothing starts before the project, nothing outlasts it.
        expect(earliest, label).toBeGreaterThanOrEqual(start);
        expect(positionOf(task.earliestFinish), label).toBeLessThanOrEqual(finish);
        expect(positionOf(task.latestFinish), label).toBeLessThanOrEqual(finish);

        // A task covers exactly its duration in working days, both ends included.
        expect(positionOf(task.earliestFinish) - earliest, label).toBe(
          Math.max(task.duration - 1, 0),
        );
        expect(positionOf(task.latestFinish) - latest, label).toBe(Math.max(task.duration - 1, 0));

        // Float is the distance between earliest and latest, measured either way.
        expect(latest - earliest, label).toBe(task.totalFloat);
        expect(positionOf(task.latestFinish) - positionOf(task.earliestFinish), label).toBe(
          task.totalFloat,
        );

        // Float is real room, and free float is never more than total float.
        expect(task.totalFloat, label).toBeGreaterThanOrEqual(0);
        expect(task.freeFloat, label).toBeGreaterThanOrEqual(0);
        expect(task.freeFloat, label).toBeLessThanOrEqual(task.totalFloat);
        expect(task.isCritical, label).toBe(task.totalFloat === 0);
      }

      // Every dependency is satisfied, lag included.
      for (const task of tasks) {
        const successor = byId.get(task.id);
        if (successor === undefined) continue;

        for (const dependency of task.dependencies ?? []) {
          const predecessor = byId.get(dependency.predecessorId);
          if (predecessor === undefined) continue;

          const required = positionOf(predecessor.earliestFinish) + 1 + (dependency.lag ?? 0);
          expect(
            positionOf(successor.earliestStart),
            `${where}, ${dependency.predecessorId} -> ${task.id}`,
          ).toBeGreaterThanOrEqual(required);
        }
      }

      // The critical path is exactly the tasks without float, and it reaches the end.
      const critical = schedule.tasks.filter((task) => task.isCritical);
      expect(new Set(schedule.criticalPath), where).toEqual(new Set(critical.map((t) => t.id)));
      expect(critical.length, where).toBeGreaterThan(0);
      expect(Math.max(...critical.map((task) => positionOf(task.earliestFinish))), where).toBe(
        finish,
      );
      expect(schedule.duration, where).toBe(finish - start + 1);
    }
  });
});
