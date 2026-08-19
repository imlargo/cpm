import type { ScheduleIssue } from './types.js';

/** Raised when a task is scheduled past the end of the calendar it was given. */
export function outsideCalendarRange(taskId: string): ScheduleIssue {
  return {
    code: 'outside-calendar-range',
    taskId,
    message: `Task "${taskId}" runs past the end of the calendar: widen its range to cover the whole project.`,
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
