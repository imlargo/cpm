import type { WorkingCalendar } from '../calendar/types.js';
import type { ISODate } from '../day.js';

/**
 * Kinds of dependency between two tasks. Only finish-to-start is computed in
 * this version; the others are named so that schedules can already carry them,
 * and are reported as unsupported rather than silently ignored.
 */
export const DependencyType = {
  FinishToStart: 'FS',
  StartToStart: 'SS',
  FinishToFinish: 'FF',
  StartToFinish: 'SF',
} as const;

export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];

/** A link from a predecessor task to the task that declares it. */
export interface Dependency {
  readonly predecessorId: string;
  /** Defaults to finish-to-start, the only kind supported in this version. */
  readonly type?: DependencyType;
  /**
   * Working days inserted between the predecessor's finish and this task's
   * start. `0` means the day right after; negative values overlap the tasks.
   */
  readonly lag?: number;
}

export interface Task {
  readonly id: string;
  /** Working days the task takes. `0` marks a milestone. */
  readonly duration: number;
  readonly dependencies?: readonly Dependency[];
}

export interface ScheduleInput {
  readonly tasks: readonly Task[];
  readonly calendar: WorkingCalendar;
  /** No task may start before this date. */
  readonly projectStart: ISODate;
}

export interface ScheduledTask {
  readonly id: string;
  readonly duration: number;
  /** Earliest the task can start without breaking any dependency. */
  readonly earliestStart: ISODate;
  readonly earliestFinish: ISODate;
  /** Latest the task can start without delaying the project. */
  readonly latestStart: ISODate;
  readonly latestFinish: ISODate;
  /** Working days the task can slip before the project finishes later. */
  readonly totalFloat: number;
  /** Working days the task can slip before any successor starts later. */
  readonly freeFloat: number;
  /** True when the task has no total float: any delay delays the project. */
  readonly isCritical: boolean;
}

export interface Schedule {
  readonly start: ISODate;
  readonly finish: ISODate;
  /** Working days from the project's start to its finish, both included. */
  readonly duration: number;
  /** Every task, in the order it was given. */
  readonly tasks: readonly ScheduledTask[];
  /** Ids of the tasks with zero total float, in dependency order. */
  readonly criticalPath: readonly string[];
}

export type ScheduleIssue =
  | {
      readonly code: 'invalid-project-start';
      readonly value: string;
      readonly message: string;
    }
  | {
      readonly code: 'project-start-outside-calendar';
      readonly value: ISODate;
      readonly message: string;
    }
  | {
      readonly code: 'duplicate-task-id';
      readonly taskId: string;
      readonly message: string;
    }
  | {
      readonly code: 'invalid-duration';
      readonly taskId: string;
      readonly duration: number;
      readonly message: string;
    }
  | {
      readonly code: 'invalid-lag';
      readonly taskId: string;
      readonly predecessorId: string;
      readonly lag: number;
      readonly message: string;
    }
  | {
      readonly code: 'unknown-predecessor';
      readonly taskId: string;
      readonly predecessorId: string;
      readonly message: string;
    }
  | {
      readonly code: 'self-dependency';
      readonly taskId: string;
      readonly message: string;
    }
  | {
      readonly code: 'unsupported-dependency-type';
      readonly taskId: string;
      readonly predecessorId: string;
      readonly type: string;
      readonly message: string;
    }
  | {
      readonly code: 'circular-dependency';
      /** The tasks forming the cycle: the last one depends on the first. */
      readonly cycle: readonly string[];
      readonly message: string;
    }
  | {
      readonly code: 'outside-calendar-range';
      readonly taskId: string;
      readonly message: string;
    };
