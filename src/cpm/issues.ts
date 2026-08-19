import type { ScheduleIssue } from './types.js';

/** Raised when a task's dates would fall outside the calendar's range. */
export function outsideCalendarRange(taskId: string): ScheduleIssue {
  return {
    code: 'outside-calendar-range',
    taskId,
    message: `Task "${taskId}" is scheduled outside the calendar's range: widen the calendar to cover it.`,
  };
}

/** Raised when the tasks depend on each other in a circle. */
export function circularDependency(cycle: readonly string[]): ScheduleIssue {
  return {
    code: 'circular-dependency',
    cycle,
    message: `The tasks ${cycle.map((id) => `"${id}"`).join(' -> ')} depend on each other in a circle.`,
  };
}
