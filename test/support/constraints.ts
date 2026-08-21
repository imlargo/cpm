import type { Task, TimeWindow } from '../../src/index.js';

/**
 * The constraints a schedule has to satisfy, written from first principles.
 *
 * These are the four relation types stated directly over start and finish
 * positions — no standardization, no edge weights, nothing borrowed from the
 * engine. Checking the engine's answer against these checks the standardization
 * itself, not just the algorithm that runs on it.
 *
 * Positions count working days from the project's start, and a finish is the
 * last working day of the activity, so the instant after it is `finish + 1`.
 */

export interface Constraint {
  readonly describe: string;
  readonly holds: (startOf: (id: string) => number) => boolean;
}

/** Working days an activity covers after its first: durations count inclusively. */
export function spanOf(duration: number): number {
  return Math.max(duration - 1, 0);
}

export interface WindowPositions {
  readonly startNotBefore?: number;
  readonly startNotAfter?: number;
  readonly finishNotBefore?: number;
  readonly finishNotAfter?: number;
}

export function constraintsOf(
  tasks: readonly Task[],
  windows: ReadonlyMap<string, WindowPositions>,
): Constraint[] {
  const span = new Map(tasks.map((task) => [task.id, spanOf(task.duration)]));
  const spanOfId = (id: string): number => span.get(id) ?? 0;
  const constraints: Constraint[] = [];

  for (const task of tasks) {
    // Nothing may start before the project does.
    constraints.push({
      describe: `${task.id} starts on or after the project`,
      holds: (startOf) => startOf(task.id) >= 0,
    });

    for (const dependency of task.dependencies ?? []) {
      const predecessor = dependency.predecessorId;
      const type = dependency.type ?? 'FS';
      const lag = dependency.lag ?? 0;

      /** The distance the relation measures, whatever its type. */
      const distance = (startOf: (id: string) => number): number => {
        const startPredecessor = startOf(predecessor);
        const startSuccessor = startOf(task.id);
        const finishPredecessor = startPredecessor + spanOfId(predecessor);
        const finishSuccessor = startSuccessor + spanOfId(task.id);

        switch (type) {
          case 'SS':
            return startSuccessor - startPredecessor;
          case 'FS':
            return startSuccessor - (finishPredecessor + 1);
          case 'FF':
            return finishSuccessor - finishPredecessor;
          case 'SF':
            return finishSuccessor + 1 - startPredecessor;
        }
      };

      constraints.push({
        describe: `${predecessor} ${type}+${String(lag)} ${task.id}`,
        holds: (startOf) => distance(startOf) >= lag,
      });

      if (dependency.maxLag !== undefined) {
        const maxLag = dependency.maxLag;
        constraints.push({
          describe: `${predecessor} ${type} at most ${String(maxLag)} before ${task.id}`,
          holds: (startOf) => distance(startOf) <= maxLag,
        });
      }
    }

    const window = windows.get(task.id);
    if (window === undefined) continue;

    const bounds: [keyof TimeWindow, (start: number) => boolean][] = [
      ['startNotBefore', (start) => start >= (window.startNotBefore ?? 0)],
      ['startNotAfter', (start) => start <= (window.startNotAfter ?? 0)],
      ['finishNotBefore', (start) => start + spanOfId(task.id) >= (window.finishNotBefore ?? 0)],
      ['finishNotAfter', (start) => start + spanOfId(task.id) <= (window.finishNotAfter ?? 0)],
    ];

    for (const [field, holds] of bounds) {
      if (window[field] === undefined) continue;
      constraints.push({
        describe: `${task.id} ${field}`,
        holds: (startOf) => holds(startOf(task.id)),
      });
    }
  }

  return constraints;
}

/** Which constraints a candidate schedule breaks. */
export function violations(
  constraints: readonly Constraint[],
  starts: ReadonlyMap<string, number>,
): string[] {
  const startOf = (id: string): number => starts.get(id) ?? 0;
  return constraints.filter((constraint) => !constraint.holds(startOf)).map((c) => c.describe);
}

/**
 * The earliest schedule there is, found by trying every one.
 *
 * Exhaustive over positions `0..bound`, so it is only usable on a handful of
 * activities — which is the point: it decides feasibility and minimality by
 * definition, with no algorithm to be wrong about.
 */
export function earliestByExhaustion(
  tasks: readonly Task[],
  constraints: readonly Constraint[],
  bound: number,
): Map<string, number> | undefined {
  const ids = tasks.map((task) => task.id);
  const assignment = new Map<string, number>();
  const minimal = new Map<string, number>();

  const walk = (index: number): void => {
    const id = ids[index];
    if (id === undefined) {
      if (violations(constraints, assignment).length > 0) return;
      for (const [key, value] of assignment) {
        const best = minimal.get(key);
        if (best === undefined || value < best) minimal.set(key, value);
      }
      return;
    }

    for (let position = 0; position <= bound; position += 1) {
      assignment.set(id, position);
      walk(index + 1);
    }
    assignment.delete(id);
  };

  walk(0);
  // Nothing was recorded, so no assignment of start days satisfied everything.
  if (minimal.size !== ids.length) return undefined;

  // For a system of differences the pointwise minimum of the feasible schedules
  // is itself feasible; if that ever failed, the check below would catch it.
  return violations(constraints, minimal).length === 0 ? minimal : undefined;
}
