import { addWorkingDays } from '../calendar/arithmetic.js';
import type { WorkingCalendar } from '../calendar/types.js';
import type { Day } from '../day.js';

/**
 * How a duration relates its start to its finish.
 *
 * Durations count working days inclusively: a task of one working day starts and
 * finishes the same day, and a milestone — duration zero — does too.
 */

/** The day a task finishes, given the day it starts. */
export function finishOf(calendar: WorkingCalendar, start: Day, duration: number): Day | undefined {
  return duration <= 1 ? start : addWorkingDays(calendar, start, duration - 1);
}

/** The day a task starts, given the day it finishes. */
export function startOf(calendar: WorkingCalendar, finish: Day, duration: number): Day | undefined {
  return duration <= 1 ? finish : addWorkingDays(calendar, finish, -(duration - 1));
}
