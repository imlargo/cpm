import { formatISODate, parseISODate, weekdayOf, type Day } from '../day.js';
import { failure, success, type Result } from '../result.js';

import type { CalendarIssue, CalendarSpec, WorkingCalendar } from './types.js';

/** Roughly a century. A range longer than this is a mistake, not a project. */
const MAX_RANGE_DAYS = 36_525;

/**
 * Validates a spec and precomputes the calendar index.
 *
 * Do this once and keep the result: the index is what makes every later
 * calendar operation a lookup instead of a walk over the range.
 */
export function defineCalendar(spec: CalendarSpec): Result<WorkingCalendar, CalendarIssue> {
  const issues: CalendarIssue[] = [];

  const workingWeekdays = collectWeekdays(spec, issues);
  const from = parseField(spec.from, 'from', issues);
  const to = parseField(spec.to, 'to', issues);
  const holidays = parseList(spec.holidays, 'holidays', issues);
  const extraWorkingDays = parseList(spec.extraWorkingDays, 'extraWorkingDays', issues);

  for (const day of holidays) {
    if (extraWorkingDays.has(day)) {
      issues.push({
        code: 'conflicting-exception',
        date: formatISODate(day),
        message: `${formatISODate(day)} is listed both as a holiday and as an extra working day.`,
      });
    }
  }

  if (from !== undefined && to !== undefined) {
    if (to < from) {
      issues.push({
        code: 'invalid-range',
        from: spec.from,
        to: spec.to,
        message: `The calendar range ends (${spec.to}) before it starts (${spec.from}).`,
      });
    } else if (to - from + 1 > MAX_RANGE_DAYS) {
      issues.push({
        code: 'range-too-large',
        days: to - from + 1,
        maxDays: MAX_RANGE_DAYS,
        message: `The calendar range spans ${String(to - from + 1)} days, more than the ${String(MAX_RANGE_DAYS)} allowed.`,
      });
    }
  }

  if (issues.length > 0 || from === undefined || to === undefined) {
    return failure(issues);
  }

  const calendar = buildIndex(from, to, workingWeekdays, holidays, extraWorkingDays);

  if (calendar.workingDays.length === 0) {
    return failure([
      {
        code: 'no-working-days',
        message: `The calendar range ${spec.from}..${spec.to} contains no working day at all.`,
      },
    ]);
  }

  return success(calendar);
}

/** Walks the range once, filling the three lookup tables. */
function buildIndex(
  from: Day,
  to: Day,
  workingWeekdays: ReadonlySet<number>,
  holidays: ReadonlySet<Day>,
  extraWorkingDays: ReadonlySet<Day>,
): WorkingCalendar {
  const length = to - from + 1;
  const working = new Uint8Array(length);
  const workingBefore = new Int32Array(length + 1);

  let count = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const day = from + offset;
    workingBefore[offset] = count;
    if (isWorked(day, workingWeekdays, holidays, extraWorkingDays)) {
      working[offset] = 1;
      count += 1;
    }
  }
  workingBefore[length] = count;

  const workingDays = new Int32Array(count);
  let position = 0;
  for (let offset = 0; offset < length; offset += 1) {
    if (working[offset] === 1) {
      workingDays[position] = from + offset;
      position += 1;
    }
  }

  return { from, to, working, workingBefore, workingDays };
}

function isWorked(
  day: Day,
  workingWeekdays: ReadonlySet<number>,
  holidays: ReadonlySet<Day>,
  extraWorkingDays: ReadonlySet<Day>,
): boolean {
  if (extraWorkingDays.has(day)) return true;
  if (holidays.has(day)) return false;
  return workingWeekdays.has(weekdayOf(day));
}

function collectWeekdays(spec: CalendarSpec, issues: CalendarIssue[]): ReadonlySet<number> {
  const weekdays = new Set<number>();

  for (const weekday of spec.workingWeekdays) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      issues.push({
        code: 'invalid-weekday',
        value: weekday,
        message: `${String(weekday)} is not a weekday: expected an integer from 0 (Sunday) to 6 (Saturday).`,
      });
      continue;
    }
    weekdays.add(weekday);
  }

  if (weekdays.size === 0) {
    issues.push({
      code: 'empty-working-week',
      message: 'The calendar has no working weekday: at least one is required.',
    });
  }

  return weekdays;
}

function parseField(value: string, field: 'from' | 'to', issues: CalendarIssue[]): Day | undefined {
  const day = parseISODate(value);
  if (day === undefined) {
    issues.push({
      code: 'invalid-date',
      field,
      value,
      message: `"${value}" in ${field} is not a valid YYYY-MM-DD date.`,
    });
  }
  return day;
}

function parseList(
  values: readonly string[] | undefined,
  field: 'holidays' | 'extraWorkingDays',
  issues: CalendarIssue[],
): ReadonlySet<Day> {
  const days = new Set<Day>();

  for (const value of values ?? []) {
    const day = parseISODate(value);
    if (day === undefined) {
      issues.push({
        code: 'invalid-date',
        field,
        value,
        message: `"${value}" in ${field} is not a valid YYYY-MM-DD date.`,
      });
      continue;
    }
    days.add(day);
  }

  return days;
}
