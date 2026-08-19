import type { Position } from '../calendar/types.js';
import { failure, success, type Result } from '../result.js';

import { DependencyType, type Dependency, type ScheduleIssue, type Task } from './types.js';

/**
 * The run-local graph the passes work on.
 *
 * `buildGraph` is called once per run and builds fresh nodes, so the passes can
 * fill their results straight into them. The caller's tasks are only read.
 *
 * The four dates are working-day positions while the passes run; `schedule.ts`
 * turns them into calendar dates once, at the end.
 */
export interface Node {
  readonly id: string;
  readonly duration: number;
  readonly predecessors: Link[];
  readonly successors: Link[];
  earliestStart: Position;
  earliestFinish: Position;
  latestStart: Position;
  latestFinish: Position;
  totalFloat: number;
  freeFloat: number;
}

export interface Link {
  readonly predecessor: Node;
  readonly successor: Node;
  readonly lag: number;
}

/**
 * Turns the given tasks into a graph, reporting every problem it finds rather
 * than stopping at the first one.
 */
export function buildGraph(tasks: readonly Task[]): Result<Node[], ScheduleIssue> {
  const issues: ScheduleIssue[] = [];
  const nodes: Node[] = [];
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

    const node = createNode(task.id, task.duration);
    nodes.push(node);
    byId.set(task.id, node);
  }

  for (const task of tasks) {
    const successor = byId.get(task.id);
    if (successor === undefined) continue;

    for (const dependency of task.dependencies ?? []) {
      const link = buildLink(task.id, dependency, successor, byId, issues);
      if (link === undefined) continue;
      link.predecessor.successors.push(link);
      successor.predecessors.push(link);
    }
  }

  return issues.length > 0 ? failure(issues) : success(nodes);
}

function buildLink(
  taskId: string,
  dependency: Dependency,
  successor: Node,
  byId: ReadonlyMap<string, Node>,
  issues: ScheduleIssue[],
): Link | undefined {
  const { predecessorId } = dependency;
  const type = dependency.type ?? DependencyType.FinishToStart;
  const lag = dependency.lag ?? 0;

  if (predecessorId === taskId) {
    issues.push({
      code: 'self-dependency',
      taskId,
      message: `Task "${taskId}" depends on itself.`,
    });
    return undefined;
  }

  const predecessor = byId.get(predecessorId);
  if (predecessor === undefined) {
    issues.push({
      code: 'unknown-predecessor',
      taskId,
      predecessorId,
      message: `Task "${taskId}" depends on "${predecessorId}", which is not in the task list.`,
    });
    return undefined;
  }

  if (type !== DependencyType.FinishToStart) {
    issues.push({
      code: 'unsupported-dependency-type',
      taskId,
      predecessorId,
      type,
      message: `Task "${taskId}" declares a "${type}" dependency on "${predecessorId}": only finish-to-start ("FS") is supported.`,
    });
    return undefined;
  }

  if (!Number.isInteger(lag)) {
    issues.push({
      code: 'invalid-lag',
      taskId,
      predecessorId,
      lag,
      message: `The dependency of "${taskId}" on "${predecessorId}" has lag ${String(lag)}: expected a whole number of working days.`,
    });
    return undefined;
  }

  return { predecessor, successor, lag };
}

function createNode(id: string, duration: number): Node {
  return {
    id,
    duration,
    predecessors: [],
    successors: [],
    earliestStart: 0,
    earliestFinish: 0,
    latestStart: 0,
    latestFinish: 0,
    totalFloat: 0,
    freeFloat: 0,
  };
}
