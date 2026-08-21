import { nextWorkingDay, workingDayAt, workingIndexOf } from '../calendar/arithmetic.js';
import type { Position, WorkingCalendar } from '../calendar/types.js';
import { formatISODate, parseISODate, type Day } from '../day.js';
import { failure, success, type Result } from '../result.js';

import { computeFloats } from './float.js';
import { solveTimes } from './longest-path.js';
import { buildNetwork, type Network, type Node } from './network.js';
import type { Schedule, ScheduleInput, ScheduleIssue, ScheduledTask } from './types.js';

/**
 * Runs the Critical Path Method over a set of activities.
 *
 * The input is only read: the same input always produces the same schedule, and
 * anything wrong with it comes back as issues instead of an exception.
 *
 * The calendar is consulted twice — once to place the project's start, once to
 * turn the answer back into dates. Everything in between is integer arithmetic
 * on working-day positions.
 */
export function calculateSchedule(input: ScheduleInput): Result<Schedule, ScheduleIssue> {
  const { calendar, tasks } = input;

  const projectStart = startPositionOf(calendar, input.projectStart);
  if (!projectStart.ok) return projectStart;

  const network = buildNetwork(tasks, calendar, projectStart.value.position);
  if (!network.ok) return network;

  if (network.value.activities.length === 0) {
    return success(emptySchedule(projectStart.value.day));
  }

  const issues = solveTimes(network.value);
  if (issues.length > 0) return failure(issues);

  computeFloats(network.value);

  return assemble(network.value, calendar, projectStart.value.position);
}

/** Where the project starts: the first working day on or after the date asked for. */
export function startPositionOf(
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
 * Network positions count from the project's start, so this is where they become
 * absolute — and where a schedule that outgrows its calendar is caught.
 */
function assemble(
  network: Network,
  calendar: WorkingCalendar,
  origin: Position,
): Result<Schedule, ScheduleIssue> {
  const issues: ScheduleIssue[] = [];
  const scheduled: ScheduledTask[] = [];

  for (const activity of network.activities) {
    const task = toScheduledTask(activity, calendar, origin);
    if (task === undefined) {
      issues.push({
        code: 'outside-calendar-range',
        taskId: activity.id,
        message: `Task "${activity.id}" runs past the end of the calendar: widen its range to cover the whole project.`,
      });
    } else {
      scheduled.push(task);
    }
  }

  const start = network.activities.reduce(
    (earliest, activity) => Math.min(earliest, activity.earliestStart),
    Number.POSITIVE_INFINITY,
  );
  const finish = network.finish;
  const startDay = workingDayAt(calendar, origin + start);
  const finishDay = workingDayAt(calendar, origin + finish);

  if (issues.length > 0 || startDay === undefined || finishDay === undefined) {
    return failure(issues);
  }

  return success({
    start: formatISODate(startDay),
    finish: formatISODate(finishDay),
    duration: finish - start + 1,
    tasks: scheduled,
    criticalPath: criticalPathOf(network),
  });
}

/**
 * The activities without float, earliest first.
 *
 * Dependency order would say the same thing while the network is acyclic, but a
 * maximum lag can make circles legitimate, and then there is no such order.
 * Reading them by their earliest start always works and agrees with dependency
 * order wherever both are defined. Sorting is stable, so activities that start
 * on the same day keep the order they were given.
 */
function criticalPathOf(network: Network): string[] {
  return network.activities
    .filter((activity) => activity.totalFloat === 0)
    .sort((left, right) => left.earliestStart - right.earliestStart)
    .map((activity) => activity.id);
}

function toScheduledTask(
  activity: Node,
  calendar: WorkingCalendar,
  origin: Position,
): ScheduledTask | undefined {
  const earliestStart = workingDayAt(calendar, origin + activity.earliestStart);
  const earliestFinish = workingDayAt(calendar, origin + activity.earliestStart + activity.span);
  const latestStart = workingDayAt(calendar, origin + activity.latestStart);
  const latestFinish = workingDayAt(calendar, origin + activity.latestStart + activity.span);

  if (
    earliestStart === undefined ||
    earliestFinish === undefined ||
    latestStart === undefined ||
    latestFinish === undefined
  ) {
    return undefined;
  }

  return {
    id: activity.id,
    duration: activity.duration,
    earliestStart: formatISODate(earliestStart),
    earliestFinish: formatISODate(earliestFinish),
    latestStart: formatISODate(latestStart),
    latestFinish: formatISODate(latestFinish),
    totalFloat: activity.totalFloat,
    freeFloat: activity.freeFloat,
    isCritical: activity.totalFloat === 0,
  };
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
