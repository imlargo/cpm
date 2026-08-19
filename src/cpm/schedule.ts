import { nextWorkingDay, workingDayAt, workingIndexOf } from '../calendar/arithmetic.js';
import type { Position, WorkingCalendar } from '../calendar/types.js';
import { formatISODate, parseISODate, type Day } from '../day.js';
import { failure, success, type Result } from '../result.js';

import { backwardPass } from './backward.js';
import { computeFloats } from './float.js';
import { forwardPass } from './forward.js';
import { buildGraph, type Node } from './graph.js';
import { circularDependency, outsideCalendarRange } from './issues.js';
import { findCycles, topologicalOrder } from './topology.js';
import type { Schedule, ScheduleInput, ScheduleIssue, ScheduledTask } from './types.js';

/**
 * Runs the Critical Path Method over a set of tasks.
 *
 * The input is only read: the same input always produces the same schedule, and
 * anything wrong with it comes back as issues instead of an exception.
 *
 * The calendar is consulted twice — once to place the project's start, once to
 * turn the answer back into dates. Everything in between is arithmetic on
 * working-day positions.
 */
export function calculateSchedule(input: ScheduleInput): Result<Schedule, ScheduleIssue> {
  const { calendar, tasks } = input;

  const projectStart = startPositionOf(calendar, input.projectStart);
  if (!projectStart.ok) return projectStart;

  const graph = buildGraph(tasks);
  if (!graph.ok) return graph;

  const nodes = graph.value;
  if (nodes.length === 0) return success(emptySchedule(projectStart.value.day));

  const order = topologicalOrder(nodes);
  if (order === undefined) return failure(findCycles(nodes).map(circularDependency));

  forwardPass(order, projectStart.value.position);
  backwardPass(order, lastFinishOf(nodes));
  computeFloats(order);

  return assemble(nodes, order, calendar);
}

/** Where the project starts: the first working day on or after the date asked for. */
function startPositionOf(
  calendar: WorkingCalendar,
  projectStart: string,
): Result<{ readonly day: Day; readonly position: Position }, ScheduleIssue> {
  const requested = parseISODate(projectStart);
  if (requested === undefined) {
    return failure([
      {
        code: 'invalid-project-start',
        value: projectStart,
        message: `"${projectStart}" is not a valid YYYY-MM-DD date.`,
      },
    ]);
  }

  const day = nextWorkingDay(calendar, requested);
  const position = day === undefined ? undefined : workingIndexOf(calendar, day);
  if (day === undefined || position === undefined) {
    return failure([
      {
        code: 'project-start-outside-calendar',
        value: projectStart,
        message: `The project starts on ${projectStart}, for which the calendar has no working day.`,
      },
    ]);
  }

  return success({ day, position });
}

/**
 * Turns the positions the passes produced back into dates.
 *
 * This is where a schedule that outgrows its calendar is caught: the backward
 * pass can only land inside it, so anything outside is work running past the
 * calendar's last day.
 */
function assemble(
  nodes: readonly Node[],
  order: readonly Node[],
  calendar: WorkingCalendar,
): Result<Schedule, ScheduleIssue> {
  const issues: ScheduleIssue[] = [];
  const scheduled: ScheduledTask[] = [];

  for (const node of nodes) {
    const task = toScheduledTask(node, calendar);
    if (task === undefined) issues.push(outsideCalendarRange(node.id));
    else scheduled.push(task);
  }

  const start = firstStartOf(nodes);
  const finish = lastFinishOf(nodes);
  const startDay = workingDayAt(calendar, start);
  const finishDay = workingDayAt(calendar, finish);

  if (issues.length > 0 || startDay === undefined || finishDay === undefined) {
    return failure(issues);
  }

  return success({
    start: formatISODate(startDay),
    finish: formatISODate(finishDay),
    duration: finish - start + 1,
    tasks: scheduled,
    criticalPath: order.filter((node) => node.totalFloat === 0).map((node) => node.id),
  });
}

function toScheduledTask(node: Node, calendar: WorkingCalendar): ScheduledTask | undefined {
  const earliestStart = workingDayAt(calendar, node.earliestStart);
  const earliestFinish = workingDayAt(calendar, node.earliestFinish);
  const latestStart = workingDayAt(calendar, node.latestStart);
  const latestFinish = workingDayAt(calendar, node.latestFinish);

  if (
    earliestStart === undefined ||
    earliestFinish === undefined ||
    latestStart === undefined ||
    latestFinish === undefined
  ) {
    return undefined;
  }

  return {
    id: node.id,
    duration: node.duration,
    earliestStart: formatISODate(earliestStart),
    earliestFinish: formatISODate(earliestFinish),
    latestStart: formatISODate(latestStart),
    latestFinish: formatISODate(latestFinish),
    totalFloat: node.totalFloat,
    freeFloat: node.freeFloat,
    isCritical: node.totalFloat === 0,
  };
}

function firstStartOf(nodes: readonly Node[]): Position {
  return nodes.reduce(
    (earliest, node) => (node.earliestStart < earliest ? node.earliestStart : earliest),
    Number.POSITIVE_INFINITY,
  );
}

function lastFinishOf(nodes: readonly Node[]): Position {
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
