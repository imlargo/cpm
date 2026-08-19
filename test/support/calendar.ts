import {
  defineCalendar,
  parseISODate,
  Weekday,
  type CalendarSpec,
  type Day,
  type WorkingCalendar,
} from '../../src/index.js';

/**
 * A Monday-to-Friday calendar with the Colombian holidays around the turn of
 * 2025. The library knows no holidays of its own: these are test data, exactly
 * as an application would supply them.
 */
export const COLOMBIA_SPEC: CalendarSpec = {
  workingWeekdays: [
    Weekday.Monday,
    Weekday.Tuesday,
    Weekday.Wednesday,
    Weekday.Thursday,
    Weekday.Friday,
  ],
  from: '2025-01-01',
  to: '2027-12-31',
  holidays: [
    '2025-12-08', // Inmaculada Concepcion
    '2025-12-25', // Navidad
    '2026-01-01', // Ano Nuevo
    '2026-01-12', // Reyes Magos, moved to the following Monday
  ],
};

/** The fixture calendar, or an explosion if the fixture itself is wrong. */
export function colombiaCalendar(): WorkingCalendar {
  const result = defineCalendar(COLOMBIA_SPEC);
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
