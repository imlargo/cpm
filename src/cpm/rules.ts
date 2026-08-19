import type { Position } from '../calendar/types.js';

/**
 * The scheduling rules of a finish-to-start dependency, in one place.
 *
 * Everything here is arithmetic on working-day positions: no dates, no
 * calendar. When start-to-start and the rest arrive, they arrive next to these.
 */

/** Working days a task of this duration covers after its first one. */
export function spanOf(duration: number): number {
  // Durations count inclusively: one working day, and zero, both end where they
  // start, which is what makes a milestone a milestone.
  return duration <= 1 ? 0 : duration - 1;
}

/** The first position a successor may start, once its predecessor has finished. */
export function startAfter(predecessorFinish: Position, lag: number): Position {
  return predecessorFinish + 1 + lag;
}

/** The last position a predecessor may finish, for its successor to start then. */
export function finishBefore(successorStart: Position, lag: number): Position {
  return successorStart - 1 - lag;
}
