import type { Network, Node } from './network.js';

/**
 * Float: how much room each activity has, in working days.
 */
export function computeFloats(network: Network): void {
  for (const activity of network.activities) {
    // Total float: slipping more than this moves the project's finish.
    activity.totalFloat = activity.latestStart - activity.earliestStart;
    activity.freeFloat = freeFloatOf(activity);
  }
}

/**
 * Free float: how much an activity can slip before anything it constrains has
 * to move.
 *
 * It starts at the total float and only narrows, which covers three cases in one
 * line. An activity with no successors has only the project's end ahead of it —
 * and the edge to the project's finish says exactly that. An activity whose
 * successor may start before it ends could otherwise be told it has room that
 * delaying it would take out of the project's finish date. And an activity with
 * a date of its own cannot slip past it, whatever its successors allow.
 */
function freeFloatOf(activity: Node): number {
  let free = activity.totalFloat;

  for (const edge of activity.outgoing) {
    const slack = edge.to.earliestStart - (activity.earliestStart + edge.lag);
    if (slack < free) free = slack;
  }

  return free;
}
