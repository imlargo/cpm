import { countWorkingDays, nextWorkingDay } from '../calendar/arithmetic.js';
import type { WorkingCalendar } from '../calendar/types.js';
import { formatISODate, parseISODate, type Day } from '../day.js';
import { failure, success, type Result } from '../result.js';

import { backwardPass } from './backward.js';
import { computeFloats } from './float.js';
import { forwardPass } from './forward.js';
import { buildGraph, type Node } from './graph.js';
import { circularDependency } from './issues.js';
import { findCycles, topologicalOrder } from './topology.js';
import type { Schedule, ScheduleInput, ScheduleIssue, ScheduledTask } from './types.js';

/**
 * Runs the Critical Path Method over a set of tasks.
 *
 * The input is only read: the same input always produces the same schedule, and
 * anything wrong with it comes back as issues instead of an exception.
 */
export function calculateSchedule(input: ScheduleInput): Result<Schedule, ScheduleIssue> {
  const { calendar, tasks } = input;

  const requestedStart = parseISODate(input.projectStart);
  if (requestedStart === undefined) {
    return failure([
      {
        code: 'invalid-project-start',
        value: input.projectStart,
        message: `"${input.projectStart}" is not a valid YYYY-MM-DD date.`,
      },
    ]);
  }

  // Work starts on the first working day on or after the requested date.
  const projectStart = nextWorkingDay(calendar, requestedStart);
  if (projectStart === undefined) {
    return failure([
      {
        code: 'project-start-outside-calendar',
        value: input.projectStart,
        message: `The project starts on ${input.projectStart}, for which the calendar has no working day.`,
      },
    ]);
  }

  const graph = buildGraph(tasks);
  if (!graph.ok) return graph;

  const nodes = graph.value;
  if (nodes.length === 0) return success(emptySchedule(projectStart));

  const order = topologicalOrder(nodes);
  if (order === undefined) return failure(findCycles(nodes).map(circularDependency));

  const forwardIssues = forwardPass(order, calendar, projectStart);
  if (forwardIssues.length > 0) return failure(forwardIssues);

  const projectFinish = lastFinishOf(nodes);
  const backwardIssues = backwardPass(order, calendar, projectFinish);
  if (backwardIssues.length > 0) return failure(backwardIssues);

  const floatIssues = computeFloats(order, calendar);
  if (floatIssues.length > 0) return failure(floatIssues);

  return success(assemble(nodes, order, calendar, projectFinish));
}

function assemble(
  nodes: readonly Node[],
  order: readonly Node[],
  calendar: WorkingCalendar,
  projectFinish: Day,
): Schedule {
  const start = firstStartOf(nodes);

  return {
    start: formatISODate(start),
    finish: formatISODate(projectFinish),
    // Both ends are working days of this calendar, so the count is always known.
    duration: countWorkingDays(calendar, start, projectFinish) ?? 0,
    tasks: nodes.map(toScheduledTask),
    criticalPath: order.filter((node) => node.totalFloat === 0).map((node) => node.id),
  };
}

function toScheduledTask(node: Node): ScheduledTask {
  return {
    id: node.id,
    duration: node.duration,
    earliestStart: formatISODate(node.earliestStart),
    earliestFinish: formatISODate(node.earliestFinish),
    latestStart: formatISODate(node.latestStart),
    latestFinish: formatISODate(node.latestFinish),
    totalFloat: node.totalFloat,
    freeFloat: node.freeFloat,
    isCritical: node.totalFloat === 0,
  };
}

function firstStartOf(nodes: readonly Node[]): Day {
  return nodes.reduce(
    (earliest, node) => (node.earliestStart < earliest ? node.earliestStart : earliest),
    Number.POSITIVE_INFINITY,
  );
}

function lastFinishOf(nodes: readonly Node[]): Day {
  return nodes.reduce(
    (latest, node) => (node.earliestFinish > latest ? node.earliestFinish : latest),
    Number.NEGATIVE_INFINITY,
  );
}

function emptySchedule(projectStart: Day): Schedule {
  return {
    start: formatISODate(projectStart),
    finish: formatISODate(projectStart),
    duration: 0,
    tasks: [],
    criticalPath: [],
  };
}
