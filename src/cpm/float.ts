import { workingIndexOf } from '../calendar/arithmetic.js';
import type { WorkingCalendar } from '../calendar/types.js';

import { earliestStartAfter } from './forward.js';
import type { Node } from './graph.js';
import { outsideCalendarRange } from './issues.js';
import type { ScheduleIssue } from './types.js';

/**
 * Float: how much room each task has to slip.
 *
 * Both kinds are measured in working days, as the distance between two dates in
 * the calendar's sequence of working days.
 *
 * Fills `totalFloat` and `freeFloat` on the nodes, and returns the issues found,
 * empty when all went well.
 */
export function computeFloats(order: readonly Node[], calendar: WorkingCalendar): ScheduleIssue[] {
  for (const node of order) {
    const earliest = workingIndexOf(calendar, node.earliestStart);
    const latest = workingIndexOf(calendar, node.latestStart);
    if (earliest === undefined || latest === undefined) return [outsideCalendarRange(node.id)];

    // Total float: slipping more than this pushes the project's finish date.
    node.totalFloat = latest - earliest;

    const free = freeFloatOf(node, calendar);
    if (free === undefined) return [outsideCalendarRange(node.id)];
    node.freeFloat = free;
  }

  return [];
}

/**
 * Free float: how much a task can slip before the earliest start of any
 * successor moves. A task with no successors has only the project's end ahead
 * of it, which is what its total float already measures.
 */
function freeFloatOf(node: Node, calendar: WorkingCalendar): number | undefined {
  let free: number | undefined;

  for (const link of node.successors) {
    const allowed = earliestStartAfter(calendar, node.earliestFinish, link.lag);
    if (allowed === undefined) return undefined;

    const allowedIndex = workingIndexOf(calendar, allowed);
    const successorIndex = workingIndexOf(calendar, link.successor.earliestStart);
    if (allowedIndex === undefined || successorIndex === undefined) return undefined;

    const slack = successorIndex - allowedIndex;
    if (free === undefined || slack < free) free = slack;
  }

  return free ?? node.totalFloat;
}
