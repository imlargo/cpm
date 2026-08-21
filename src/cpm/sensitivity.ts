import { workingIndexOf } from '../calendar/arithmetic.js';
import type { Position, WorkingCalendar } from '../calendar/types.js';
import { parseISODate } from '../day.js';
import { success, type Result } from '../result.js';

import { calculateSchedule } from './schedule.js';
import type { Schedule, ScheduleInput, ScheduleIssue, Task, TaskSensitivity } from './types.js';

/**
 * How the project's duration reacts to each activity taking a day more, or a day
 * less.
 *
 * Worth asking because the answer is not always the obvious one. Once a relation
 * carries a maximum lag, a longer activity can pull the project's finish
 * *earlier*, and a shorter one can push it later — the anomaly Wiest (1981)
 * described and Elmaghraby and Kamburowski (1992) classified. Total float alone
 * cannot tell you which of those you have.
 *
 * The answer is measured, not derived: the schedule is recomputed with each
 * duration nudged by one working day. That is exact, including at the points
 * where the response changes slope, and it costs two schedule computations per
 * activity — pay it deliberately, not in a loop.
 *
 * A direction that leaves no satisfiable schedule at all reports `Infinity`.
 */
export function analyzeSensitivity(
  input: ScheduleInput,
): Result<readonly TaskSensitivity[], ScheduleIssue> {
  const baseline = calculateSchedule(input);
  if (!baseline.ok) return baseline;

  // Measured on the project's finish, not on its span: a date window can push
  // the first activity later, which shortens the span without the project
  // finishing any sooner.
  const reference = finishPositionOf(baseline.value, input.calendar);
  const report: TaskSensitivity[] = [];

  for (const task of input.tasks) {
    report.push({
      id: task.id,
      ifOneDayLonger: change(input, task, task.duration + 1, reference),
      // A milestone has nothing to shorten.
      ifOneDayShorter: task.duration === 0 ? 0 : change(input, task, task.duration - 1, reference),
    });
  }

  return success(report);
}

/** Where the project finishes, with one activity's duration replaced. */
function change(input: ScheduleInput, task: Task, duration: number, reference: Position): number {
  const nudged = calculateSchedule({
    ...input,
    tasks: input.tasks.map((other) => (other.id === task.id ? { ...other, duration } : other)),
  });

  if (!nudged.ok) return Number.POSITIVE_INFINITY;
  return finishPositionOf(nudged.value, input.calendar) - reference;
}

function finishPositionOf(schedule: Schedule, calendar: WorkingCalendar): Position {
  const day = parseISODate(schedule.finish);
  // The date came out of this calendar, so it has a position.
  return (day === undefined ? undefined : workingIndexOf(calendar, day)) ?? 0;
}
