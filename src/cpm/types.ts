import type { WorkingCalendar } from '../calendar/types.js';
import type { ISODate } from '../day.js';

/**
 * Which end of an activity a relation attaches to.
 *
 * The four classical dependency types are just the four ways of pairing the two
 * ends: a relation leaves the predecessor's start or finish, and arrives at the
 * successor's start or finish.
 */
export const DependencyType = {
  FinishToStart: 'FS',
  StartToStart: 'SS',
  FinishToFinish: 'FF',
  StartToFinish: 'SF',
} as const;

export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];

/** A temporal relation between two activities. */
export interface Dependency {
  readonly predecessorId: string;
  /** Defaults to finish-to-start. */
  readonly type?: DependencyType;
  /**
   * The *minimum* distance the relation imposes, in working days. `0` is the
   * tightest the relation allows; negative values overlap the two activities.
   */
  readonly lag?: number;
  /**
   * The *maximum* distance the relation allows, in working days, if it is
   * bounded. Where `lag` says "no sooner than", this says "no later than", and
   * the pair together is a time window. Omit it for the usual one-sided
   * relation.
   */
  readonly maxLag?: number;
}

/**
 * Dates an activity is pinned between, if any.
 *
 * Each of the four is an ordinary temporal constraint against the project's
 * start, so they cost nothing extra: the engine turns them into the same kind of
 * edge a relation becomes. A date that is not a working day is moved inward to
 * the nearest one, so a window never admits a day the calendar does not have.
 */
export interface TimeWindow {
  readonly startNotBefore?: ISODate;
  readonly startNotAfter?: ISODate;
  readonly finishNotBefore?: ISODate;
  readonly finishNotAfter?: ISODate;
}

export interface Task {
  readonly id: string;
  /** Working days the activity takes. `0` marks a milestone. */
  readonly duration: number;
  readonly dependencies?: readonly Dependency[];
  readonly window?: TimeWindow;
}

export interface ScheduleInput {
  readonly tasks: readonly Task[];
  readonly calendar: WorkingCalendar;
  /** No activity may start before this date. */
  readonly projectStart: ISODate;
}

export interface ScheduledTask {
  readonly id: string;
  readonly duration: number;
  /** Earliest the activity can start with every constraint satisfied. */
  readonly earliestStart: ISODate;
  readonly earliestFinish: ISODate;
  /** Latest it can start without moving the project's finish. */
  readonly latestStart: ISODate;
  readonly latestFinish: ISODate;
  /** Working days it can slip before the project's finish moves. */
  readonly totalFloat: number;
  /** Working days it can slip before any successor has to move. */
  readonly freeFloat: number;
  /** True when the activity has no total float. */
  readonly isCritical: boolean;
}

export interface Schedule {
  readonly start: ISODate;
  readonly finish: ISODate;
  /** Working days from the project's start to its finish, both included. */
  readonly duration: number;
  /** Every activity, in the order it was given. */
  readonly tasks: readonly ScheduledTask[];
  /** Ids of the activities with zero total float, in dependency order. */
  readonly criticalPath: readonly string[];
}

/**
 * How the project's duration reacts to one activity taking a day more or a day
 * less. See `analyzeSensitivity`.
 */
export interface TaskSensitivity {
  readonly id: string;
  /** Change in project duration if this activity took one working day more. */
  readonly ifOneDayLonger: number;
  /**
   * Change in project duration if it took one working day less, or `0` for a
   * milestone, which cannot be shortened.
   */
  readonly ifOneDayShorter: number;
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
      readonly code: 'contradictory-lag';
      readonly taskId: string;
      readonly predecessorId: string;
      readonly lag: number;
      readonly maxLag: number;
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
      readonly code: 'invalid-window';
      readonly taskId: string;
      readonly field: keyof TimeWindow;
      readonly value: string;
      readonly message: string;
    }
  | {
      readonly code: 'window-outside-calendar';
      readonly taskId: string;
      readonly field: keyof TimeWindow;
      readonly value: ISODate;
      readonly message: string;
    }
  | {
      /**
       * The activities depend on each other in a circle that cannot be
       * satisfied. Not every circle is one: a loop whose lags cancel out is a
       * legitimate pair of activities pinned to each other.
       */
      readonly code: 'circular-dependency';
      readonly cycle: readonly string[];
      /** Working days by which the circle overshoots being satisfiable. */
      readonly excess: number;
      readonly message: string;
    }
  | {
      /** A date window that no schedule can meet. */
      readonly code: 'impossible-time-window';
      readonly cycle: readonly string[];
      /** Working days by which the window is missed. */
      readonly excess: number;
      readonly message: string;
    }
  | {
      readonly code: 'outside-calendar-range';
      readonly taskId: string;
      readonly message: string;
    };
