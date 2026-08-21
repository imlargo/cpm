import { describe, expect, it } from 'vitest';

import {
  addWorkingDays,
  countWorkingDays,
  defineCalendar,
  formatISODate,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
  Weekday,
  workingDayAt,
  workingIndexOf,
  type CalendarSpec,
} from '../src/index.js';

import { fixtureCalendar, HOLIDAY_SPEC, day } from './support/calendar.js';

const calendar = fixtureCalendar();

/** Reads a calendar answer back as a date, so failures print dates. */
function iso(value: number | undefined): string | undefined {
  return value === undefined ? undefined : formatISODate(value);
}

describe('countWorkingDays', () => {
  it('counts the working days across a holiday and two weekends', () => {
    // 29, 30 and 31 December plus 2 January: the 1st is a holiday.
    expect(countWorkingDays(calendar, day('2025-12-29'), day('2026-01-02'))).toBe(4);
  });

  it('counts across two weekends and a holiday', () => {
    expect(countWorkingDays(calendar, day('2025-12-26'), day('2026-01-09'))).toBe(10);
  });

  it('includes both ends', () => {
    expect(countWorkingDays(calendar, day('2026-02-02'), day('2026-02-02'))).toBe(1);
    expect(countWorkingDays(calendar, day('2026-02-07'), day('2026-02-08'))).toBe(0);
  });

  it('counts nothing when the span ends before it starts', () => {
    expect(countWorkingDays(calendar, day('2026-02-05'), day('2026-02-02'))).toBe(0);
  });

  it('reports spans that leave the calendar', () => {
    expect(countWorkingDays(calendar, day('2024-12-31'), day('2025-01-10'))).toBeUndefined();
    expect(countWorkingDays(calendar, day('2027-12-30'), day('2028-01-03'))).toBeUndefined();
  });
});

describe('isWorkingDay', () => {
  it('follows the working week', () => {
    expect(isWorkingDay(calendar, day('2026-02-06'))).toBe(true); // Friday
    expect(isWorkingDay(calendar, day('2026-02-07'))).toBe(false); // Saturday
    expect(isWorkingDay(calendar, day('2026-02-08'))).toBe(false); // Sunday
  });

  it('follows the holidays it was given', () => {
    expect(isWorkingDay(calendar, day('2026-01-01'))).toBe(false);
    expect(isWorkingDay(calendar, day('2026-01-12'))).toBe(false);
    expect(isWorkingDay(calendar, day('2026-01-06'))).toBe(true); // a Tuesday, not listed
  });

  it('is false outside the calendar', () => {
    expect(isWorkingDay(calendar, day('2028-01-03'))).toBe(false);
  });

  it('honours extra working days over weekends and holidays', () => {
    const result = defineCalendar({
      ...HOLIDAY_SPEC,
      extraWorkingDays: ['2026-02-07'], // a recovered Saturday
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(isWorkingDay(result.value, day('2026-02-07'))).toBe(true);
    expect(countWorkingDays(result.value, day('2026-02-02'), day('2026-02-08'))).toBe(6);
  });
});

describe('nextWorkingDay and previousWorkingDay', () => {
  it('leaves working days where they are', () => {
    expect(iso(nextWorkingDay(calendar, day('2026-02-05')))).toBe('2026-02-05');
    expect(iso(previousWorkingDay(calendar, day('2026-02-05')))).toBe('2026-02-05');
  });

  it('skips over weekends and holidays', () => {
    expect(iso(nextWorkingDay(calendar, day('2026-02-07')))).toBe('2026-02-09');
    expect(iso(previousWorkingDay(calendar, day('2026-02-07')))).toBe('2026-02-06');
    expect(iso(nextWorkingDay(calendar, day('2026-01-01')))).toBe('2026-01-02');
    expect(iso(previousWorkingDay(calendar, day('2026-01-01')))).toBe('2025-12-31');
  });

  it('reports days outside the calendar', () => {
    expect(nextWorkingDay(calendar, day('2028-01-03'))).toBeUndefined();
    expect(previousWorkingDay(calendar, day('2024-12-31'))).toBeUndefined();
  });
});

describe('addWorkingDays', () => {
  it('moves forward without counting the day it starts on', () => {
    expect(iso(addWorkingDays(calendar, day('2026-02-06'), 1))).toBe('2026-02-09');
    expect(iso(addWorkingDays(calendar, day('2026-02-02'), 0))).toBe('2026-02-02');
    expect(iso(addWorkingDays(calendar, day('2025-12-29'), 3))).toBe('2026-01-02');
  });

  it('moves backward with a negative count', () => {
    expect(iso(addWorkingDays(calendar, day('2026-02-09'), -1))).toBe('2026-02-06');
    expect(iso(addWorkingDays(calendar, day('2026-01-02'), -3))).toBe('2025-12-29');
  });

  it('snaps a non-working day in the direction of travel', () => {
    expect(iso(addWorkingDays(calendar, day('2026-02-07'), 0))).toBe('2026-02-09');
    expect(iso(addWorkingDays(calendar, day('2026-02-07'), -0))).toBe('2026-02-09');
    expect(iso(addWorkingDays(calendar, day('2026-02-07'), -1))).toBe('2026-02-05');
  });

  it('undoes itself', () => {
    const start = day('2026-03-02');
    const moved = addWorkingDays(calendar, start, 37);
    expect(iso(addWorkingDays(calendar, moved ?? 0, -37))).toBe('2026-03-02');
  });

  it('reports moves that leave the calendar', () => {
    expect(addWorkingDays(calendar, day('2027-12-31'), 1)).toBeUndefined();
    expect(addWorkingDays(calendar, day('2025-01-01'), -1)).toBeUndefined();
    expect(addWorkingDays(calendar, day('2026-02-02'), 1.5)).toBeUndefined();
  });
});

describe('workingIndexOf and workingDayAt', () => {
  it('are inverses of each other', () => {
    const position = workingIndexOf(calendar, day('2026-02-05'));
    expect(position).toBeTypeOf('number');
    expect(iso(workingDayAt(calendar, position ?? -1))).toBe('2026-02-05');
  });

  it('count working days only, skipping what is not worked', () => {
    const friday = workingIndexOf(calendar, day('2026-02-06')) ?? 0;
    // The next position is the Monday: the weekend has no position at all.
    expect(iso(workingDayAt(calendar, friday + 1))).toBe('2026-02-09');
    expect(workingIndexOf(calendar, day('2026-02-07'))).toBeUndefined();
  });

  it('report positions outside the calendar', () => {
    expect(workingDayAt(calendar, -1)).toBeUndefined();
    expect(workingDayAt(calendar, 10_000_000)).toBeUndefined();
  });
});

describe('defineCalendar', () => {
  it('reports every problem at once instead of throwing', () => {
    const result = defineCalendar({
      workingWeekdays: [],
      from: '2026-13-01',
      to: '2026-01-01',
      holidays: ['nope'],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      'empty-working-week',
      'invalid-date',
      'invalid-date',
    ]);
  });

  it('rejects a range that ends before it starts', () => {
    const result = defineCalendar({ ...HOLIDAY_SPEC, from: '2026-06-01', to: '2026-01-01' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('invalid-range');
  });

  it('rejects a date that is both a holiday and an extra working day', () => {
    const result = defineCalendar({
      ...HOLIDAY_SPEC,
      holidays: ['2026-01-01'],
      extraWorkingDays: ['2026-01-01'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('conflicting-exception');
  });

  it('rejects a range with no working day in it', () => {
    const spec: CalendarSpec = {
      workingWeekdays: [Weekday.Sunday],
      from: '2026-02-02',
      to: '2026-02-06',
    };
    const result = defineCalendar(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('no-working-days');
  });

  it('rejects a range longer than a century', () => {
    const result = defineCalendar({ ...HOLIDAY_SPEC, from: '1900-01-01', to: '2100-01-01' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe('range-too-large');
  });

  it('ignores exceptions that fall outside the range', () => {
    const result = defineCalendar({ ...HOLIDAY_SPEC, holidays: ['2019-07-20'] });
    expect(result.ok).toBe(true);
  });
});
