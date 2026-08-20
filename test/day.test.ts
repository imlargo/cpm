import { describe, expect, it } from 'vitest';

import { dayFromDate, dayToDate, formatISODate, parseISODate, weekdayOf } from '../src/index.js';

describe('parseISODate', () => {
  it('counts days from the epoch', () => {
    expect(parseISODate('1970-01-01')).toBe(0);
    expect(parseISODate('1970-01-02')).toBe(1);
    expect(parseISODate('1969-12-31')).toBe(-1);
  });

  it('round-trips through formatISODate', () => {
    for (const iso of ['2025-12-29', '2026-01-01', '2024-02-29', '2100-03-01']) {
      const parsed = parseISODate(iso);
      expect(parsed).toBeTypeOf('number');
      expect(formatISODate(parsed ?? 0)).toBe(iso);
    }
  });

  it('rejects malformed text', () => {
    expect(parseISODate('')).toBeUndefined();
    expect(parseISODate('not a date')).toBeUndefined();
    expect(parseISODate('2025-1-3')).toBeUndefined();
    expect(parseISODate('2025/01/03')).toBeUndefined();
    expect(parseISODate('2025-01-03T00:00:00Z')).toBeUndefined();
  });

  it('rejects dates the calendar does not have', () => {
    expect(parseISODate('2025-02-30')).toBeUndefined();
    expect(parseISODate('2025-13-01')).toBeUndefined();
    expect(parseISODate('2025-00-10')).toBeUndefined();
    expect(parseISODate('2023-02-29')).toBeUndefined();
  });
});

describe('weekdayOf', () => {
  it('agrees with the Gregorian calendar on both sides of the epoch', () => {
    expect(weekdayOf(0)).toBe(4); // 1970-01-01 was a Thursday
    expect(weekdayOf(parseISODate('2026-01-01') ?? 0)).toBe(4);
    expect(weekdayOf(parseISODate('2025-12-27') ?? 0)).toBe(6); // Saturday
    expect(weekdayOf(parseISODate('1969-12-28') ?? 0)).toBe(0); // Sunday
  });
});

describe('the calendar arithmetic', () => {
  const MS_PER_DAY = 86_400_000;
  /** What `Date` says, which is what the arithmetic has to agree with. */
  const reference = (day: number): string => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

  it('agrees with Date over a century, in both directions', () => {
    const mismatches: string[] = [];

    // 1950 through 2050, every single day.
    for (let day = -7305; day <= 29_220; day += 1) {
      const iso = formatISODate(day);
      if (iso !== reference(day)) mismatches.push(`format ${String(day)}: ${iso}`);
      if (parseISODate(iso) !== day) mismatches.push(`parse ${iso}`);
      if (weekdayOf(day) !== new Date(day * MS_PER_DAY).getUTCDay()) {
        mismatches.push(`weekday ${iso}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('follows the Gregorian century rule for leap days', () => {
    expect(parseISODate('2000-02-29')).toBeTypeOf('number'); // divisible by 400
    expect(parseISODate('2400-02-29')).toBeTypeOf('number');
    expect(parseISODate('1900-02-29')).toBeUndefined(); // divisible by 100, not 400
    expect(parseISODate('2100-02-29')).toBeUndefined();
    expect(parseISODate('2024-02-29')).toBeTypeOf('number');
    expect(parseISODate('2023-02-29')).toBeUndefined();
  });

  it('knows how long each month is', () => {
    expect(parseISODate('2025-04-31')).toBeUndefined();
    expect(parseISODate('2025-06-31')).toBeUndefined();
    expect(parseISODate('2025-09-31')).toBeUndefined();
    expect(parseISODate('2025-11-31')).toBeUndefined();
    expect(parseISODate('2025-01-31')).toBeTypeOf('number');
    expect(parseISODate('2025-12-31')).toBeTypeOf('number');
  });

  it('handles dates far outside any plausible schedule', () => {
    for (const iso of ['0001-01-01', '0099-12-31', '1600-02-29', '9999-12-31']) {
      const day = parseISODate(iso);
      expect(day, iso).toBeTypeOf('number');
      expect(formatISODate(day ?? 0)).toBe(iso);
    }
  });
});

describe('Date interoperability', () => {
  it('reads and writes the UTC calendar date of a Date', () => {
    const day = dayFromDate(new Date('2025-12-29T13:45:00Z'));
    expect(day).toBe(parseISODate('2025-12-29'));
    expect(dayToDate(day ?? 0).toISOString()).toBe('2025-12-29T00:00:00.000Z');
  });

  it('reports an invalid Date instead of returning a broken day', () => {
    expect(dayFromDate(new Date('nope'))).toBeUndefined();
  });
});
