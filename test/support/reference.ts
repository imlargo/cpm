import type { CalendarSpec, Task } from '../../src/index.js';

/**
 * A deliberately naive reference implementation, written to disagree.
 *
 * It shares no code with the library and takes a different route to the same
 * answer: working days come from stepping over `Date` objects one at a time, and
 * the passes are fixpoint relaxation — repeat until nothing moves — rather than
 * a topological walk. Slow, obvious, and easy to check by hand.
 */

const MS_PER_DAY = 86_400_000;

export interface ReferenceTask {
  readonly earliestStart: string;
  readonly earliestFinish: string;
  readonly latestStart: string;
  readonly latestFinish: string;
  readonly totalFloat: number;
  readonly freeFloat: number;
  readonly isCritical: boolean;
}

/** Every working day of a calendar spec, as `YYYY-MM-DD`, by walking dates. */
export function workingDaysOf(spec: CalendarSpec): string[] {
  const holidays = new Set(spec.holidays ?? []);
  const extra = new Set(spec.extraWorkingDays ?? []);
  const weekdays = new Set<number>(spec.workingWeekdays);
  const days: string[] = [];

  const last = Date.parse(`${spec.to}T00:00:00Z`);
  for (let time = Date.parse(`${spec.from}T00:00:00Z`); time <= last; time += MS_PER_DAY) {
    const date = new Date(time);
    const iso = date.toISOString().slice(0, 10);
    const worked = extra.has(iso) || (weekdays.has(date.getUTCDay()) && !holidays.has(iso));
    if (worked) days.push(iso);
  }

  return days;
}

interface Reference {
  readonly id: string;
  readonly duration: number;
  readonly links: { readonly to: Reference; readonly lag: number }[];
  start: number;
  finish: number;
  latestStart: number;
  latestFinish: number;
}

/** Schedules the tasks over the given working days, in positions then dates. */
export function referenceSchedule(
  tasks: readonly Task[],
  workingDays: readonly string[],
  projectStart: string,
): Map<string, ReferenceTask> {
  const projectStartPosition = workingDays.findIndex((day) => day >= projectStart);
  const refs = buildReferences(tasks);
  const span = (duration: number): number => Math.max(duration - 1, 0);

  for (const ref of refs.values()) {
    ref.start = projectStartPosition;
    ref.finish = projectStartPosition + span(ref.duration);
  }

  // Forward: push every task later until no dependency is violated any more.
  for (let round = 0; round <= refs.size; round += 1) {
    let moved = false;
    for (const ref of refs.values()) {
      for (const link of ref.links) {
        const required = ref.finish + 1 + link.lag;
        if (link.to.start < required) {
          link.to.start = required;
          link.to.finish = required + span(link.to.duration);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  const projectFinish = Math.max(...[...refs.values()].map((ref) => ref.finish));

  for (const ref of refs.values()) {
    ref.latestFinish = projectFinish;
    ref.latestStart = projectFinish - span(ref.duration);
  }

  // Backward: pull every task earlier until no successor is squeezed any more.
  for (let round = 0; round <= refs.size; round += 1) {
    let moved = false;
    for (const ref of refs.values()) {
      for (const link of ref.links) {
        const allowed = link.to.latestStart - 1 - link.lag;
        if (ref.latestFinish > allowed) {
          ref.latestFinish = allowed;
          ref.latestStart = allowed - span(ref.duration);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  const dateAt = (position: number): string =>
    workingDays[position] ?? `out-of-range:${String(position)}`;
  const scheduled = new Map<string, ReferenceTask>();

  for (const ref of refs.values()) {
    const totalFloat = ref.latestStart - ref.start;
    // Free float is capped by total float: a lead can leave a task room its
    // successors do not mind but the project's own finish date does.
    const slacks = [
      totalFloat,
      ...ref.links.map((link) => link.to.start - (ref.finish + 1 + link.lag)),
    ];

    scheduled.set(ref.id, {
      earliestStart: dateAt(ref.start),
      earliestFinish: dateAt(ref.finish),
      latestStart: dateAt(ref.latestStart),
      latestFinish: dateAt(ref.latestFinish),
      totalFloat,
      freeFloat: Math.min(...slacks),
      isCritical: totalFloat === 0,
    });
  }

  return scheduled;
}

function buildReferences(tasks: readonly Task[]): Map<string, Reference> {
  const refs = new Map<string, Reference>(
    tasks.map((task) => [
      task.id,
      {
        id: task.id,
        duration: task.duration,
        links: [],
        start: 0,
        finish: 0,
        latestStart: 0,
        latestFinish: 0,
      },
    ]),
  );

  for (const task of tasks) {
    const successor = refs.get(task.id);
    if (successor === undefined) continue;

    for (const dependency of task.dependencies ?? []) {
      const predecessor = refs.get(dependency.predecessorId);
      if (predecessor === undefined) continue;

      predecessor.links.push({ to: successor, lag: dependency.lag ?? 0 });
    }
  }

  return refs;
}
