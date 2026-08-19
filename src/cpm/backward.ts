import type { Position } from '../calendar/types.js';

import type { Node } from './graph.js';
import { finishBefore, spanOf } from './rules.js';

/**
 * Backward pass: the latest each task can start and finish without pushing the
 * project's finish date.
 *
 * Walking the tasks in reverse dependency order, a task must finish early enough
 * for every successor to still start on time — and, whatever room its successors
 * leave it, early enough not to outlast the project itself.
 */
export function backwardPass(order: readonly Node[], projectFinish: Position): void {
  for (const node of [...order].reverse()) {
    let finish = projectFinish;

    for (const link of node.successors) {
      const required = finishBefore(link.successor.latestStart, link.lag);
      if (required < finish) finish = required;
    }

    node.latestFinish = finish;
    node.latestStart = finish - spanOf(node.duration);
  }
}
