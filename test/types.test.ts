import { describe, expectTypeOf, it } from 'vitest';

import {
  calculateSchedule,
  defineCalendar,
  type Schedule,
  type ScheduleIssue,
  type Task,
} from '../src/index.js';

import { colombiaCalendar } from './support/calendar.js';

const calendar = colombiaCalendar();

describe('the public types', () => {
  it('requires every task to carry a duration', () => {
    // @ts-expect-error a task without a duration cannot be scheduled
    const task: Task = { id: 'a' };
    void task;
  });

  it('only accepts the dependency types it knows about', () => {
    const task: Task = {
      id: 'a',
      duration: 1,
      // @ts-expect-error "finish-to-start" is not one of the four dependency codes
      dependencies: [{ predecessorId: 'b', type: 'finish-to-start' }],
    };
    void task;
  });

  it('hands back a schedule that cannot be edited in place', () => {
    const result = calculateSchedule({ calendar, projectStart: '2026-02-02', tasks: [] });
    if (!result.ok) return;

    // @ts-expect-error the schedule is a read-only view of the answer
    result.value.criticalPath[0] = 'a';
  });

  it('narrows a result to its value or its issues', () => {
    const result = calculateSchedule({ calendar, projectStart: '2026-02-02', tasks: [] });

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<Schedule>();
    } else {
      expectTypeOf(result.issues).toEqualTypeOf<readonly ScheduleIssue[]>();
    }
  });

  it('narrows an issue by its code', () => {
    const result = defineCalendar({ workingWeekdays: [], from: 'x', to: 'y' });
    if (result.ok) return;

    for (const issue of result.issues) {
      if (issue.code === 'invalid-date') {
        expectTypeOf(issue.value).toEqualTypeOf<string>();
      }
    }
  });
});
