import { addWorkingDays } from '../calendar/arithmetic.js';
import type { WorkingCalendar } from '../calendar/types.js';
import type { Day } from '../day.js';

import type { Node } from './graph.js';
import { finishOf } from './span.js';
import { outsideCalendarRange } from './issues.js';
import type { ScheduleIssue } from './types.js';

/**
 * Forward pass: the earliest each task can start and finish.
 *
 * Walking the tasks in dependency order, a task starts as soon as the project
 * allows and as soon as every predecessor allows — whichever comes later.
 *
 * Fills `earliestStart` and `earliestFinish` on the nodes, and returns the
 * issues found, empty when all went well.
 */
export function forwardPass(
  order: readonly Node[],
  calendar: WorkingCalendar,
  projectStart: Day,
): ScheduleIssue[] {
  for (const node of order) {
    let start = projectStart;

    for (const link of node.predecessors) {
      const allowed = earliestStartAfter(calendar, link.predecessor.earliestFinish, link.lag);
      if (allowed === undefined) return [outsideCalendarRange(node.id)];
      if (allowed > start) start = allowed;
    }

    const finish = finishOf(calendar, start, node.duration);
    if (finish === undefined) return [outsideCalendarRange(node.id)];

    node.earliestStart = start;
    node.earliestFinish = finish;
  }

  return [];
}

/**
 * The first day a successor may start once its predecessor finishes: the next
 * working day, plus the lag. A negative lag pulls the successor earlier.
 */
export function earliestStartAfter(
  calendar: WorkingCalendar,
  predecessorFinish: Day,
  lag: number,
): Day | undefined {
  return addWorkingDays(calendar, predecessorFinish, 1 + lag);
}
