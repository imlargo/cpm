/**
 * Dates as integers.
 *
 * Every date inside this library is a `Day`: the number of whole days since
 * 1970-01-01. Integers compare with `<`, subtract into day counts and index
 * into arrays, so no `Date` object is ever created to do date arithmetic.
 *
 * The two conversions below are Howard Hinnant's `days_from_civil` and
 * `civil_from_days` — plain integer arithmetic, exact over the whole proleptic
 * Gregorian calendar, and free of the allocation a `Date` costs. Both shift the
 * year to start in March, which puts the leap day last and lets one formula
 * step over it. The derivation is at
 * https://howardhinnant.github.io/date_algorithms.html
 *
 * `Date` appears only in the two interop helpers at the bottom, which exist
 * precisely to convert to and from it.
 */

/** A calendar date, as whole days since 1970-01-01. Negative for earlier dates. */
export type Day = number;

/** A calendar date written as `YYYY-MM-DD`. */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 1970-01-01 was a Thursday. */
const EPOCH_WEEKDAY = 4;

/** Days from 0000-03-01, where the March-first year begins, to 1970-01-01. */
const EPOCH_FROM_CIVIL = 719_468;

/** Days in one 400-year Gregorian era, which is where the calendar repeats. */
const DAYS_PER_ERA = 146_097;

/**
 * Parses `YYYY-MM-DD`. Returns `undefined` when the text is not a well formed
 * date — including calendar-impossible ones such as `2025-02-30`.
 */
export function parseISODate(value: string): Day | undefined {
  if (!ISO_DATE_PATTERN.test(value)) return undefined;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const dayOfMonth = Number(value.slice(8, 10));

  if (month < 1 || month > 12) return undefined;
  if (dayOfMonth < 1 || dayOfMonth > daysInMonth(year, month)) return undefined;

  return dayFromCivil(year, month, dayOfMonth);
}

/** Writes a day as `YYYY-MM-DD`. */
export function formatISODate(day: Day): ISODate {
  const shifted = day + EPOCH_FROM_CIVIL;
  const era = Math.floor(shifted / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;

  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));

  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const dayOfMonth = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(dayOfMonth, 2)}`;
}

/** Day of the week, `0` for Sunday through `6` for Saturday. */
export function weekdayOf(day: Day): number {
  return ((day % 7) + EPOCH_WEEKDAY + 7) % 7;
}

/** Reads the UTC calendar date of a `Date` as a day. */
export function dayFromDate(date: Date): Day | undefined {
  const year = date.getUTCFullYear();
  if (Number.isNaN(year)) return undefined;

  return dayFromCivil(year, date.getUTCMonth() + 1, date.getUTCDate());
}

/** Builds a `Date` at midnight UTC of the given day. */
export function dayToDate(day: Day): Date {
  return new Date(day * MS_PER_DAY);
}

/** The day number of a year, month and day of the Gregorian calendar. */
function dayFromCivil(year: number, month: number, dayOfMonth: number): Day {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;

  const monthFromMarch = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * monthFromMarch + 2) / 5) + dayOfMonth - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * DAYS_PER_ERA + dayOfEra - EPOCH_FROM_CIVIL;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
