/**
 * Every operation in this library that can fail returns a `Result` instead of
 * throwing: a problem in the input is a value the caller inspects, never an
 * exception that unwinds the stack.
 */
export type Result<T, E> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly ok: false;
  /** Every problem found, not just the first one. */
  readonly issues: readonly E[];
}

export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function failure<E>(issues: readonly E[]): Failure<E> {
  return { ok: false, issues };
}
