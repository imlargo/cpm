import type { Node } from './graph.js';
import { startAfter } from './rules.js';

/**
 * Float: how much room each task has to slip, in working days.
 */
export function computeFloats(order: readonly Node[]): void {
  for (const node of order) {
    // Total float: slipping more than this pushes the project's finish date.
    node.totalFloat = node.latestStart - node.earliestStart;
    node.freeFloat = freeFloatOf(node);
  }
}

/**
 * Free float: how much a task can slip before the earliest start of any
 * successor moves. A task with no successors has only the project's end ahead
 * of it, which is what its total float already measures.
 */
function freeFloatOf(node: Node): number {
  let free: number | undefined;

  for (const link of node.successors) {
    const slack = link.successor.earliestStart - startAfter(node.earliestFinish, link.lag);
    if (free === undefined || slack < free) free = slack;
  }

  return free ?? node.totalFloat;
}
