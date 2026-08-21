import { nextWorkingDay, previousWorkingDay, workingIndexOf } from '../calendar/arithmetic.js';
import type { Position, WorkingCalendar } from '../calendar/types.js';
import { parseISODate } from '../day.js';
import { failure, success, type Result } from '../result.js';

import {
  DependencyType,
  type Dependency,
  type ScheduleIssue,
  type Task,
  type TimeWindow,
} from './types.js';

/**
 * The constraint network the schedule is computed on.
 *
 * Every temporal constraint this library understands — any of the four
 * dependency types, with a minimum lag, a maximum lag, or a date window —
 * reduces to one shape:
 *
 *     start(j) - start(i) >= lag
 *
 * an edge from `i` to `j` weighted `lag`. That reduction is the standardization
 * of Bartusch, Möhring and Radermacher (1988), and it is why this library needs
 * one algorithm rather than one per relation type: with every constraint in that
 * form, the earliest start times are the longest paths from the project's start.
 *
 * Positions, not dates, are the unit throughout — see `calendar/types.ts`.
 */

export type NodeKind = 'projectStart' | 'activity';

export interface Node {
  /** The activity's id; for the two synthetic nodes, a name in parentheses. */
  readonly id: string;
  readonly kind: NodeKind;
  readonly duration: number;
  /**
   * Positions from an activity's start to its finish. Durations count
   * inclusively, so a one-day activity — and a milestone — spans zero.
   */
  readonly span: number;
  /**
   * Positions from an activity's start to just past its finish, which is where
   * the next activity may begin. `span + 1`, and never zero, so a milestone
   * still lets its successors follow it.
   */
  readonly endOffset: number;
  readonly outgoing: Edge[];
  /**
   * How many edges arrive here. A count rather than a list: the only thing that
   * ever needed the edges themselves was the walk that orders the network, and
   * counting is all that walk asks of them.
   */
  indegree: number;
  /** Filled in by the longest-path passes; the network is rebuilt per run. */
  earliestStart: Position;
  latestStart: Position;
  /** Longest path from this node to the project's finish. */
  toFinish: number;
  totalFloat: number;
  freeFloat: number;
  /** Scratch space for the topological walk. */
  pending: number;
  /** The edge this node's value last came from, for naming an impossible circle. */
  arrivedBy: Edge | undefined;
}

export interface Edge {
  readonly from: Node;
  readonly to: Node;
  readonly lag: number;
}

export interface Network {
  /**
   * The one synthetic node: the project's start, which upper bounds point back
   * at. It carries no edges of its own unless the schedule has an upper bound
   * somewhere, because "nothing starts before the project" is already the floor
   * every value is computed from.
   */
  readonly projectStart: Node;
  /** The activities, in the order they were given. */
  readonly activities: readonly Node[];
  /** Every node. */
  readonly nodes: readonly Node[];
  /** The last position any activity finishes, filled in by `solveTimes`. */
  finish: Position;
}

/**
 * Builds the network, reporting every problem in the input rather than stopping
 * at the first one.
 */
export function buildNetwork(
  tasks: readonly Task[],
  calendar: WorkingCalendar,
  projectStart: Position,
): Result<Network, ScheduleIssue> {
  const issues: ScheduleIssue[] = [];
  const activities: Node[] = [];
  const byId = new Map<string, Node>();

  for (const task of tasks) {
    if (byId.has(task.id)) {
      issues.push({
        code: 'duplicate-task-id',
        taskId: task.id,
        message: `More than one task uses the id "${task.id}".`,
      });
      continue;
    }

    if (!Number.isInteger(task.duration) || task.duration < 0) {
      issues.push({
        code: 'invalid-duration',
        taskId: task.id,
        duration: task.duration,
        message: `Task "${task.id}" has duration ${String(task.duration)}: expected a whole number of working days, zero or more.`,
      });
      continue;
    }

    const node = createNode(task.id, 'activity', task.duration);
    activities.push(node);
    byId.set(task.id, node);
  }

  const start = createNode('(project start)', 'projectStart', 0);

  const connect = (from: Node, to: Node, lag: number): void => {
    from.outgoing.push({ from, to, lag });
    to.indegree += 1;
  };

  // "Nothing starts before the project" only needs to be an edge where something
  // could push back against it. With no upper bound anywhere, it is already the
  // floor the passes start from, and one edge per activity is not built.
  if (tasks.some(hasUpperBound)) {
    for (const activity of activities) connect(start, activity, 0);
  }

  for (const task of tasks) {
    const successor = byId.get(task.id);
    if (successor === undefined) continue;

    for (const dependency of task.dependencies ?? []) {
      addRelation(dependency, successor, byId, connect, issues);
    }

    if (task.window !== undefined) {
      addWindow(task.window, successor, start, calendar, projectStart, connect, issues);
    }
  }

  if (issues.length > 0) return failure(issues);

  return success({
    projectStart: start,
    activities,
    nodes: [start, ...activities],
    finish: 0,
  });
}

/** Whether anything about this activity can push a constraint backwards. */
function hasUpperBound(task: Task): boolean {
  if ((task.dependencies ?? []).some((dependency) => dependency.maxLag !== undefined)) return true;
  return task.window?.startNotAfter !== undefined || task.window?.finishNotAfter !== undefined;
}

/**
 * The weight of the edge a relation becomes.
 *
 * A relation leaves one end of the predecessor and arrives at one end of the
 * successor, so its weight is: how far the predecessor's chosen end is from its
 * own start, minus how far the successor's chosen end is from its start, plus
 * the lag. The four classical types fall out of that one expression:
 *
 *     start  -> start   lag
 *     finish -> start   endOffset(i) + lag
 *     finish -> finish  endOffset(i) - endOffset(j) + lag
 *     start  -> finish  lag - endOffset(j)
 */
export function lagWeight(
  predecessor: Node,
  successor: Node,
  type: DependencyType,
  lag: number,
): number {
  const fromFinish =
    type === DependencyType.FinishToStart || type === DependencyType.FinishToFinish;
  const toFinish = type === DependencyType.FinishToFinish || type === DependencyType.StartToFinish;

  return (fromFinish ? predecessor.endOffset : 0) - (toFinish ? successor.endOffset : 0) + lag;
}

type Connect = (from: Node, to: Node, lag: number) => void;

function addRelation(
  dependency: Dependency,
  successor: Node,
  byId: ReadonlyMap<string, Node>,
  connect: Connect,
  issues: ScheduleIssue[],
): void {
  const { predecessorId } = dependency;
  const type = dependency.type ?? DependencyType.FinishToStart;
  const lag = dependency.lag ?? 0;
  const taskId = successor.id;

  if (predecessorId === taskId) {
    issues.push({
      code: 'self-dependency',
      taskId,
      message: `Task "${taskId}" depends on itself.`,
    });
    return;
  }

  const predecessor = byId.get(predecessorId);
  if (predecessor === undefined) {
    issues.push({
      code: 'unknown-predecessor',
      taskId,
      predecessorId,
      message: `Task "${taskId}" depends on "${predecessorId}", which is not in the task list.`,
    });
    return;
  }

  if (!Number.isInteger(lag)) {
    issues.push({
      code: 'invalid-lag',
      taskId,
      predecessorId,
      lag,
      message: `The dependency of "${taskId}" on "${predecessorId}" has lag ${String(lag)}: expected a whole number of working days.`,
    });
    return;
  }

  connect(predecessor, successor, lagWeight(predecessor, successor, type, lag));

  if (dependency.maxLag === undefined) return;

  const maxLag = dependency.maxLag;
  if (!Number.isInteger(maxLag)) {
    issues.push({
      code: 'invalid-lag',
      taskId,
      predecessorId,
      lag: maxLag,
      message: `The dependency of "${taskId}" on "${predecessorId}" has maxLag ${String(maxLag)}: expected a whole number of working days.`,
    });
    return;
  }

  if (maxLag < lag) {
    issues.push({
      code: 'contradictory-lag',
      taskId,
      predecessorId,
      lag,
      maxLag,
      message: `The dependency of "${taskId}" on "${predecessorId}" asks for at least ${String(lag)} and at most ${String(maxLag)} working days, which nothing can satisfy.`,
    });
    return;
  }

  // A maximum is the same constraint read backwards: where the minimum pushes
  // the successor away from the predecessor, the maximum pulls the predecessor
  // towards the successor.
  connect(successor, predecessor, -lagWeight(predecessor, successor, type, maxLag));
}

function addWindow(
  window: TimeWindow,
  activity: Node,
  projectStartNode: Node,
  calendar: WorkingCalendar,
  projectStart: Position,
  connect: Connect,
  issues: ScheduleIssue[],
): void {
  /**
   * A window date is moved inward to a working day: a lower bound forward, an
   * upper bound backward, so the window never admits a day the calendar lacks.
   */
  const positionOf = (
    field: keyof TimeWindow,
    value: string,
    direction: 'lower' | 'upper',
  ): Position | undefined => {
    const day = parseISODate(value);
    if (day === undefined) {
      issues.push({
        code: 'invalid-window',
        taskId: activity.id,
        field,
        value,
        message: `"${value}" in ${field} of task "${activity.id}" is not a valid YYYY-MM-DD date.`,
      });
      return undefined;
    }

    const moved =
      direction === 'lower' ? nextWorkingDay(calendar, day) : previousWorkingDay(calendar, day);
    const position = moved === undefined ? undefined : workingIndexOf(calendar, moved);
    if (position === undefined) {
      issues.push({
        code: 'window-outside-calendar',
        taskId: activity.id,
        field,
        value,
        message: `${field} of task "${activity.id}" is ${value}, for which the calendar has no working day.`,
      });
      return undefined;
    }

    return position;
  };

  // start >= t  and  finish >= t, the latter read as start >= t - span.
  if (window.startNotBefore !== undefined) {
    const at = positionOf('startNotBefore', window.startNotBefore, 'lower');
    if (at !== undefined) connect(projectStartNode, activity, at - projectStart);
  }
  if (window.finishNotBefore !== undefined) {
    const at = positionOf('finishNotBefore', window.finishNotBefore, 'lower');
    if (at !== undefined) connect(projectStartNode, activity, at - activity.span - projectStart);
  }

  // start <= t  and  finish <= t, as edges back to the project's start.
  if (window.startNotAfter !== undefined) {
    const at = positionOf('startNotAfter', window.startNotAfter, 'upper');
    if (at !== undefined) connect(activity, projectStartNode, -(at - projectStart));
  }
  if (window.finishNotAfter !== undefined) {
    const at = positionOf('finishNotAfter', window.finishNotAfter, 'upper');
    if (at !== undefined) connect(activity, projectStartNode, -(at - activity.span - projectStart));
  }
}

function createNode(id: string, kind: NodeKind, duration: number): Node {
  const span = Math.max(duration - 1, 0);

  return {
    id,
    kind,
    duration,
    span,
    endOffset: span + 1,
    outgoing: [],
    indegree: 0,
    earliestStart: 0,
    latestStart: 0,
    toFinish: 0,
    totalFloat: 0,
    freeFloat: 0,
    pending: 0,
    arrivedBy: undefined,
  };
}
