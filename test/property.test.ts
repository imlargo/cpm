import { describe, expect, it } from 'vitest';

import { calculateSchedule, type Task } from '../src/index.js';

import { colombiaCalendar, COLOMBIA_SPEC } from './support/calendar.js';
import { referenceSchedule, workingDaysOf } from './support/reference.js';

/**
 * The engine against the naive reference, over a few thousand random schedules.
 *
 * Worked examples pin down the cases somebody thought of. This covers the ones
 * nobody did: it is what caught the engine leaving a task's latest finish free
 * to run past the end of the project, which only shows up with negative lag.
 */

const calendar = colombiaCalendar();
const workingDays = workingDaysOf(COLOMBIA_SPEC);

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
  const compare = (trials: number, maxTasks: number, maxLag: number): void => {
    const random = randomSource(20260819);

    for (let trial = 0; trial < trials; trial += 1) {
      const tasks = randomTasks(random, 2 + Math.floor(random() * maxTasks), maxLag);
      const projectStart = '2026-02-02';

      const result = calculateSchedule({ tasks, calendar, projectStart });
      expect(result.ok, `schedule ${String(trial)}: ${JSON.stringify(tasks)}`).toBe(true);
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
        const where = `schedule ${String(trial)}, task ${task.id}: ${JSON.stringify(tasks)}`;
        expect(actual, where).toEqual(expected.get(task.id));
      }
    }
  };

  it('agrees on schedules without lag', () => {
    compare(300, 12, 0);
  });

  it('agrees on schedules with lag in both directions', () => {
    compare(300, 12, 3);
  });

  it('agrees on wider schedules with heavy overlap', () => {
    compare(100, 30, 5);
  });
});
