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
 * successor moves.
 *
 * It starts at the total float and only ever narrows, which covers two cases at
 * once. A task with no successors has nothing but the project's end ahead of it,
 * which total float already measures. And a task whose successor may start
 * before it finishes — a lead, written as a negative lag — could otherwise be
 * told it has more free float than total float, promising room that delaying it
 * would take out of the project's own finish date.
 */
function freeFloatOf(node: Node): number {
  let free = node.totalFloat;

  for (const link of node.successors) {
    const slack = link.successor.earliestStart - startAfter(node.earliestFinish, link.lag);
    if (slack < free) free = slack;
  }

  return free;
}
