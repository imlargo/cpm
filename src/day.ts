/**
 * Dates as integers.
 *
 * Every date inside this library is a `Day`: the number of whole days since
 * 1970-01-01. Integers compare with `<`, subtract into day counts and index
 * into arrays, so no `Date` object is ever created inside a loop. `Date` shows
 * up only here, to convert once at the boundary.
 */

/** A calendar date, as whole days since 1970-01-01. Negative for earlier dates. */
export type Day = number;

/** A calendar date written as `YYYY-MM-DD`. */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 1970-01-01 was a Thursday. */
const EPOCH_WEEKDAY = 4;

/**
 * Parses `YYYY-MM-DD`. Returns `undefined` when the text is not a well formed
 * date — including calendar-impossible ones such as `2025-02-30`.
 */
export function parseISODate(value: string): Day | undefined {
  if (!ISO_DATE_PATTERN.test(value)) return undefined;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const dayOfMonth = Number(value.slice(8, 10));

  const timestamp = Date.UTC(year, month - 1, dayOfMonth);
  if (Number.isNaN(timestamp)) return undefined;

  const day = timestamp / MS_PER_DAY;
  // `Date.UTC` rolls impossible components over (2025-02-30 becomes March 2nd)
  // and maps two-digit years into the 1900s. Formatting back rejects both.
  return formatISODate(day) === value ? day : undefined;
}

/** Writes a day as `YYYY-MM-DD`. */
export function formatISODate(day: Day): ISODate {
  const date = new Date(day * MS_PER_DAY);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

/** Reads the UTC calendar date of a `Date` as a day. */
export function dayFromDate(date: Date): Day | undefined {
  const timestamp = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Number.isNaN(timestamp) ? undefined : timestamp / MS_PER_DAY;
}

/** Builds a `Date` at midnight UTC of the given day. */
export function dayToDate(day: Day): Date {
  return new Date(day * MS_PER_DAY);
}

/** Day of the week, `0` for Sunday through `6` for Saturday. */
export function weekdayOf(day: Day): number {
  return ((day % 7) + EPOCH_WEEKDAY + 7) % 7;
}
