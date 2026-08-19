import type { Position } from '../calendar/types.js';

import type { Node } from './graph.js';
import { spanOf, startAfter } from './rules.js';

/**
 * Forward pass: the earliest each task can start and finish.
 *
 * Walking the tasks in dependency order, a task starts as soon as the project
 * allows and as soon as every predecessor allows — whichever comes later.
 */
export function forwardPass(order: readonly Node[], projectStart: Position): void {
  for (const node of order) {
    let start = projectStart;

    for (const link of node.predecessors) {
      const allowed = startAfter(link.predecessor.earliestFinish, link.lag);
      if (allowed > start) start = allowed;
    }

    node.earliestStart = start;
    node.earliestFinish = start + spanOf(node.duration);
  }
}
