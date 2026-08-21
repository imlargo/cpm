import { describe, expect, it } from 'vitest';

import {
  calculateSchedule,
  formatISODate,
  parseISODate,
  workingDayAt,
  workingIndexOf,
  type Dependency,
  type DependencyType,
  type Schedule,
  type Task,
} from '../src/index.js';

import { fixtureCalendar } from './support/calendar.js';
import {
  constraintsOf,
  earliestByExhaustion,
  spanOf,
  violations,
  type Constraint,
  type WindowPositions,
} from './support/constraints.js';

/**
 * The generalized model against its own definition.
 *
 * Two kinds of check, over thousands of random schedules built from all four
 * relation types, maximum lags and date windows:
 *
 * 1. On schedules small enough, every possible assignment of start days is
 *    tried. That decides feasibility and the earliest schedule by exhaustion —
 *    no algorithm to be wrong about — and the engine has to agree.
 * 2. On larger ones, the answer is checked against what the words mean: every
 *    constraint holds, no activity could start a day sooner, none could start a
 *    day later without breaking something, and the floats measure what they say.
 */

const calendar = fixtureCalendar();
const PROJECT_START = '2026-02-02';
const TYPES: readonly DependencyType[] = ['FS', 'SS', 'FF', 'SF'];

const origin = (() => {
  const day = parseISODate(PROJECT_START);
  const position = day === undefined ? undefined : workingIndexOf(calendar, day);
  if (position === undefined) throw new Error('fixture project start is not a working day');
  return position;
})();

/** A working-day position, counted from the project's start, as a date. */
function dateAt(position: number): string {
  const day = workingDayAt(calendar, origin + position);
  if (day === undefined) throw new Error(`position ${String(position)} is outside the calendar`);
  return formatISODate(day);
}

/** The inverse: a date the engine returned, as a position from the start. */
function positionOf(iso: string): number {
  const day = parseISODate(iso);
  const position = day === undefined ? undefined : workingIndexOf(calendar, day);
  if (position === undefined) throw new Error(`${iso} is not a working day of the calendar`);
  return position - origin;
}

function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

interface Generated {
  readonly tasks: Task[];
  readonly windows: Map<string, WindowPositions>;
}

function randomInstance(
  random: () => number,
  count: number,
  options: { readonly maxima: boolean; readonly windows: boolean },
): Generated {
  const pick = (bound: number): number => Math.floor(random() * bound);
  const tasks: Task[] = [];
  const windows = new Map<string, WindowPositions>();

  for (let index = 0; index < count; index += 1) {
    const dependencies: Dependency[] = [];

    for (let earlier = 0; earlier < index; earlier += 1) {
      if (random() >= 0.55) continue;

      const lag = pick(4) - 1;
      const dependency: Dependency = {
        predecessorId: `t${String(earlier)}`,
        type: TYPES[pick(TYPES.length)] ?? 'FS',
        lag,
        ...(options.maxima && random() < 0.45 ? { maxLag: lag + pick(3) } : {}),
      };
      dependencies.push(dependency);
    }

    const id = `t${String(index)}`;
    const window: WindowPositions =
      options.windows && random() < 0.3 ? { startNotBefore: pick(6) } : {};

    if (window.startNotBefore !== undefined) windows.set(id, window);

    tasks.push({
      id,
      duration: pick(4),
      dependencies,
      ...(window.startNotBefore === undefined
        ? {}
        : { window: { startNotBefore: dateAt(window.startNotBefore) } }),
    });
  }

  return { tasks, windows };
}

/** The start positions the engine chose, earliest or latest. */
function startsOf(schedule: Schedule, which: 'earliest' | 'latest'): Map<string, number> {
  return new Map(
    schedule.tasks.map((task) => [
      task.id,
      positionOf(which === 'earliest' ? task.earliestStart : task.latestStart),
    ]),
  );
}

describe('against every possible schedule', () => {
  const compare = (trials: number, count: number, seed: number): { feasible: number } => {
    const random = randomSource(seed);
    let feasible = 0;

    for (let trial = 0; trial < trials; trial += 1) {
      const { tasks, windows } = randomInstance(random, count, { maxima: true, windows: true });
      const constraints = constraintsOf(tasks, windows);
      const exhaustive = earliestByExhaustion(tasks, constraints, 18);
      const result = calculateSchedule({ tasks, calendar, projectStart: PROJECT_START });
      const where = `trial ${String(trial)}: ${JSON.stringify(tasks)}`;

      // The engine and exhaustion must agree on whether a schedule exists at all.
      expect(result.ok, where).toBe(exhaustive !== undefined);
      if (!result.ok || exhaustive === undefined) continue;

      feasible += 1;
      // And on which one is the earliest.
      expect(Object.fromEntries(startsOf(result.value, 'earliest')), where).toEqual(
        Object.fromEntries(exhaustive),
      );
    }

    return { feasible };
  };

  it('agrees on two-activity schedules', () => {
    const { feasible } = compare(400, 2, 11);
    expect(feasible).toBeGreaterThan(100);
  }, 30_000);

  it('agrees on three-activity schedules', () => {
    const { feasible } = compare(250, 3, 22);
    expect(feasible).toBeGreaterThan(50);
  }, 30_000);
});

describe('against what the words mean', () => {
  const check = (
    trials: number,
    count: number,
    seed: number,
    options: { maxima: boolean; windows: boolean },
  ): number => {
    const random = randomSource(seed);
    let feasible = 0;

    for (let trial = 0; trial < trials; trial += 1) {
      const { tasks, windows } = randomInstance(random, count, options);
      const result = calculateSchedule({ tasks, calendar, projectStart: PROJECT_START });
      if (!result.ok) continue;

      feasible += 1;
      const schedule = result.value;
      const where = `trial ${String(trial)}: ${JSON.stringify(tasks)}`;
      const constraints = constraintsOf(tasks, windows);
      const spans = new Map(tasks.map((task) => [task.id, spanOf(task.duration)]));
      const finish = positionOf(schedule.finish);

      /** The constraints, plus the promise that nothing outlasts the project. */
      const withProjectFinish: Constraint[] = [
        ...constraints,
        ...tasks.map((task) => ({
          describe: `${task.id} finishes within the project`,
          holds: (startOf: (id: string) => number) =>
            startOf(task.id) + (spans.get(task.id) ?? 0) <= finish,
        })),
      ];

      const earliest = startsOf(schedule, 'earliest');
      const latest = startsOf(schedule, 'latest');

      // Both schedules the engine reports have to be schedules at all.
      expect(violations(constraints, earliest), `${where} — earliest`).toEqual([]);
      expect(violations(withProjectFinish, latest), `${where} — latest`).toEqual([]);

      for (const task of schedule.tasks) {
        const label = `${where} — ${task.id}`;
        const span = spans.get(task.id) ?? 0;

        // The dates agree with the duration.
        expect(positionOf(task.earliestFinish) - positionOf(task.earliestStart), label).toBe(span);
        expect(positionOf(task.latestFinish) - positionOf(task.latestStart), label).toBe(span);

        // Nothing could start a day sooner: something would break.
        const sooner = new Map(earliest).set(task.id, (earliest.get(task.id) ?? 0) - 1);
        expect(
          violations(constraints, sooner).length,
          `${label} — could start sooner`,
        ).toBeGreaterThan(0);

        // Nor a day later than its latest.
        const later = new Map(latest).set(task.id, (latest.get(task.id) ?? 0) + 1);
        expect(
          violations(withProjectFinish, later).length,
          `${label} — could start later`,
        ).toBeGreaterThan(0);

        // Total float is the room between the two, and is real room.
        expect((latest.get(task.id) ?? 0) - (earliest.get(task.id) ?? 0), label).toBe(
          task.totalFloat,
        );
        expect(task.totalFloat, label).toBeGreaterThanOrEqual(0);
        expect(task.isCritical, label).toBe(task.totalFloat === 0);

        // Free float is exactly how far this one activity can slip on its own.
        const slipped = (by: number): Map<string, number> =>
          new Map(earliest).set(task.id, (earliest.get(task.id) ?? 0) + by);
        expect(
          violations(withProjectFinish, slipped(task.freeFloat)),
          `${label} — free float`,
        ).toEqual([]);
        expect(
          violations(withProjectFinish, slipped(task.freeFloat + 1)).length,
          `${label} — free float is the most it can slip`,
        ).toBeGreaterThan(0);
      }

      // The project finishes when its last activity does.
      expect(
        Math.max(...schedule.tasks.map((task) => positionOf(task.earliestFinish))),
        where,
      ).toBe(finish);
    }

    return feasible;
  };

  it('holds for minimum lags of every type', () => {
    expect(check(400, 7, 33, { maxima: false, windows: false })).toBeGreaterThan(350);
  }, 30_000);

  it('holds with date windows', () => {
    expect(check(400, 7, 44, { maxima: false, windows: true })).toBeGreaterThan(300);
  }, 30_000);

  it('holds with maximum lags', () => {
    expect(check(600, 6, 55, { maxima: true, windows: true })).toBeGreaterThan(100);
  }, 30_000);
});
