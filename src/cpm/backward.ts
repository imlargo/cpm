import { addWorkingDays } from '../calendar/arithmetic.js';
import type { WorkingCalendar } from '../calendar/types.js';
import type { Day } from '../day.js';

import type { Node } from './graph.js';
import { startOf } from './span.js';
import { outsideCalendarRange } from './issues.js';
import type { ScheduleIssue } from './types.js';

/**
 * Backward pass: the latest each task can start and finish without pushing the
 * project's finish date.
 *
 * Walking the tasks in reverse dependency order, a task must finish early enough
 * for every successor to still start on time; a task with no successors only has
 * to be done by the end of the project.
 *
 * Fills `latestStart` and `latestFinish` on the nodes, and returns the issues
 * found, empty when all went well.
 */
export function backwardPass(
  order: readonly Node[],
  calendar: WorkingCalendar,
  projectFinish: Day,
): ScheduleIssue[] {
  for (const node of [...order].reverse()) {
    let finish = projectFinish;
    let constrained = false;

    for (const link of node.successors) {
      const required = latestFinishBefore(calendar, link.successor.latestStart, link.lag);
      if (required === undefined) return [outsideCalendarRange(node.id)];
      if (!constrained || required < finish) {
        finish = required;
        constrained = true;
      }
    }

    const start = startOf(calendar, finish, node.duration);
    if (start === undefined) return [outsideCalendarRange(node.id)];

    node.latestFinish = finish;
    node.latestStart = start;
  }

  return [];
}

/**
 * The last day a predecessor may finish for its successor to still start on the
 * given day. The mirror image of the forward pass's rule.
 */
function latestFinishBefore(
  calendar: WorkingCalendar,
  successorStart: Day,
  lag: number,
): Day | undefined {
  return addWorkingDays(calendar, successorStart, -(1 + lag));
}
