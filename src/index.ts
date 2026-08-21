/**
 * Critical Path Method engine.
 *
 * Pure functions, no runtime dependencies, no global state. Dates travel in and
 * out as `YYYY-MM-DD` strings and are integers inside. Problems in the input
 * come back as issues, never as exceptions.
 */

export { failure, success, type Failure, type Result, type Success } from './result.js';

export {
  dayFromDate,
  dayToDate,
  formatISODate,
  parseISODate,
  weekdayOf,
  type Day,
  type ISODate,
} from './day.js';

export { defineCalendar } from './calendar/define.js';
export {
  Weekday,
  type CalendarIssue,
  type CalendarSpec,
  type Position,
  type WorkingCalendar,
} from './calendar/types.js';
export {
  addWorkingDays,
  containsDay,
  countWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
  workingDayAt,
  workingIndexOf,
} from './calendar/arithmetic.js';

export { calculateSchedule } from './cpm/schedule.js';
export { analyzeSensitivity } from './cpm/sensitivity.js';
export {
  DependencyType,
  type Dependency,
  type Schedule,
  type ScheduleInput,
  type ScheduleIssue,
  type ScheduledTask,
  type Task,
  type TaskSensitivity,
  type TimeWindow,
} from './cpm/types.js';
