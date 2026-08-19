import type { Day, ISODate } from '../day.js';

/** Days of the week, matching `Date#getUTCDay`. */
export const Weekday = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

/**
 * The description of a working calendar.
 *
 * The library ships no holidays of its own: which weekdays are worked and which
 * dates are exceptions is always given by the caller, for any country or site.
 */
export interface CalendarSpec {
  /** Weekdays that are worked, e.g. Monday through Friday. */
  readonly workingWeekdays: readonly Weekday[];
  /** First date covered by the calendar, inclusive. */
  readonly from: ISODate;
  /** Last date covered by the calendar, inclusive. */
  readonly to: ISODate;
  /** Dates that are not worked even though their weekday is: holidays, shutdowns. */
  readonly holidays?: readonly ISODate[];
  /** Dates that are worked even though their weekday is not: recovered Saturdays. */
  readonly extraWorkingDays?: readonly ISODate[];
}

/**
 * A calendar with its index already computed.
 *
 * Built once by {@link defineCalendar}, then reused: every calendar operation is
 * an array lookup, never a walk over the range. Treat the fields as opaque.
 */
export interface WorkingCalendar {
  /** First day covered, inclusive. */
  readonly from: Day;
  /** Last day covered, inclusive. */
  readonly to: Day;
  /** `1` when the day at that offset from `from` is worked, `0` otherwise. */
  readonly working: Uint8Array;
  /**
   * `workingBefore[offset]` is how many working days lie strictly before that
   * offset. One entry longer than `working`, so both ends of a span are indexable.
   */
  readonly workingBefore: Int32Array;
  /** Every working day of the range, ascending. */
  readonly workingDays: Int32Array;
}

export type CalendarIssue =
  | {
      readonly code: 'invalid-date';
      readonly field: keyof CalendarSpec;
      readonly value: string;
      readonly message: string;
    }
  | {
      readonly code: 'invalid-weekday';
      readonly value: number;
      readonly message: string;
    }
  | {
      readonly code: 'empty-working-week';
      readonly message: string;
    }
  | {
      readonly code: 'invalid-range';
      readonly from: ISODate;
      readonly to: ISODate;
      readonly message: string;
    }
  | {
      readonly code: 'range-too-large';
      readonly days: number;
      readonly maxDays: number;
      readonly message: string;
    }
  | {
      readonly code: 'conflicting-exception';
      readonly date: ISODate;
      readonly message: string;
    }
  | {
      readonly code: 'no-working-days';
      readonly message: string;
    };
