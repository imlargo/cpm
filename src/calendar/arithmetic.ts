import type { Day } from '../day.js';

import type { WorkingCalendar } from './types.js';

/**
 * Date arithmetic over a working calendar.
 *
 * Every function here is a lookup into the index built by `defineCalendar`,
 * so cost does not grow with the distance being moved. All of them return
 * `undefined` when the answer would fall outside the calendar's range — the
 * caller decides what that means, nothing is thrown.
 */

/** Whether the day falls inside the calendar's range at all. */
export function containsDay(calendar: WorkingCalendar, day: Day): boolean {
  return day >= calendar.from && day <= calendar.to;
}

/** Whether the day is worked. Days outside the calendar's range are not. */
export function isWorkingDay(calendar: WorkingCalendar, day: Day): boolean {
  return containsDay(calendar, day) && calendar.working[day - calendar.from] === 1;
}

/**
 * Position of a working day in the calendar's sequence of working days, counting
 * from `0`. Subtracting two positions gives the working days between two dates,
 * which is how float is measured. `undefined` if the day is not worked.
 */
export function workingIndexOf(calendar: WorkingCalendar, day: Day): number | undefined {
  if (!isWorkingDay(calendar, day)) return undefined;
  return calendar.workingBefore[day - calendar.from];
}

/** The first working day on or after `day`. */
export function nextWorkingDay(calendar: WorkingCalendar, day: Day): Day | undefined {
  if (!containsDay(calendar, day)) return undefined;
  const workingDaysBefore = calendar.workingBefore[day - calendar.from];
  if (workingDaysBefore === undefined) return undefined;
  return workingDayAt(calendar, workingDaysBefore);
}

/** The last working day on or before `day`. */
export function previousWorkingDay(calendar: WorkingCalendar, day: Day): Day | undefined {
  if (!containsDay(calendar, day)) return undefined;
  if (isWorkingDay(calendar, day)) return day;
  const workingDaysBefore = calendar.workingBefore[day - calendar.from];
  if (workingDaysBefore === undefined) return undefined;
  return workingDayAt(calendar, workingDaysBefore - 1);
}

/**
 * Moves `count` working days away from `day`, forward or backward.
 *
 * The day itself is not counted: one working day after a Friday of a Monday-to-
 * Friday week is the next Monday. A `day` that is not worked is snapped first —
 * forward for a non-negative `count`, backward for a negative one.
 */
export function addWorkingDays(
  calendar: WorkingCalendar,
  day: Day,
  count: number,
): Day | undefined {
  if (!Number.isInteger(count)) return undefined;

  const reference = count >= 0 ? nextWorkingDay(calendar, day) : previousWorkingDay(calendar, day);
  if (reference === undefined) return undefined;

  const index = workingIndexOf(calendar, reference);
  if (index === undefined) return undefined;

  return workingDayAt(calendar, index + count);
}

/**
 * How many working days the span from `from` to `to` holds, both ends included.
 * A span that ends before it starts holds none.
 */
export function countWorkingDays(
  calendar: WorkingCalendar,
  from: Day,
  to: Day,
): number | undefined {
  if (!containsDay(calendar, from) || !containsDay(calendar, to)) return undefined;
  if (to < from) return 0;

  const before = calendar.workingBefore[from - calendar.from];
  const throughEnd = calendar.workingBefore[to - calendar.from + 1];
  if (before === undefined || throughEnd === undefined) return undefined;

  return throughEnd - before;
}

/** The working day at the given position in the calendar's sequence. */
function workingDayAt(calendar: WorkingCalendar, index: number): Day | undefined {
  if (index < 0 || index >= calendar.workingDays.length) return undefined;
  return calendar.workingDays[index];
}
