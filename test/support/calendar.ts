import {
  defineCalendar,
  parseISODate,
  Weekday,
  type CalendarSpec,
  type Day,
  type WorkingCalendar,
} from '../../src/index.js';

/**
 * A Monday-to-Friday calendar with four holidays around the turn of 2025.
 *
 * The library ships no holidays of its own; these are test data, supplied the
 * way an application supplies them. They are placed where they make the
 * arithmetic interesting: one lands mid-week, one on a Thursday, and two in the
 * first fortnight of January.
 */
export const HOLIDAY_SPEC: CalendarSpec = {
  workingWeekdays: [
    Weekday.Monday,
    Weekday.Tuesday,
    Weekday.Wednesday,
    Weekday.Thursday,
    Weekday.Friday,
  ],
  from: '2025-01-01',
  to: '2027-12-31',
  holidays: ['2025-12-08', '2025-12-25', '2026-01-01', '2026-01-12'],
};

/** The fixture calendar, or an explosion if the fixture itself is wrong. */
export function fixtureCalendar(): WorkingCalendar {
  const result = defineCalendar(HOLIDAY_SPEC);
  if (!result.ok) {
    throw new Error(`fixture calendar is invalid: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
}

/** Parses a date in a test, failing loudly if the literal is wrong. */
export function day(iso: string): Day {
  const parsed = parseISODate(iso);
  if (parsed === undefined) throw new Error(`invalid date literal in test: ${iso}`);
  return parsed;
}
