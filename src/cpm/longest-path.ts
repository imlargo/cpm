import type { Edge, Network, Node } from './network.js';
import type { ScheduleIssue } from './types.js';

/**
 * Solving the constraint network.
 *
 * With every constraint written as `start(j) - start(i) >= lag`, the earliest
 * start times are the longest paths from the project's start, and the latest
 * start times are the project's finish minus the longest paths to the end. That
 * is the whole of the Critical Path Method, and of its generalisation to the
 * other relation types: only the edge weights differ.
 *
 * Two algorithms, chosen by the shape of the network:
 *
 * - Only minimum lags, and no upper date bounds, leaves the network acyclic. One
 *   pass in dependency order then suffices, in time linear in the network.
 * - A maximum lag or an upper date bound adds an edge pointing backwards, and
 *   circles become both possible and legitimate. Longest paths then need rounds
 *   of relaxation, which also answer the question circles raise: the constraints
 *   are satisfiable unless some circle has positive length.
 *
 * Both start from a floor rather than from minus infinity, which is not a
 * shortcut: no activity starts before the project, and none is finished before
 * its own last day, so those are floors the answers are above. It also keeps
 * every value a whole number from beginning to end.
 */
export function solveTimes(network: Network): ScheduleIssue[] {
  const order = topologicalOrder(network.nodes);
  const issues = order === undefined ? relaxInRounds(network) : passInOrder(network, order);
  if (issues.length > 0) return issues;

  // The project is finished when its last activity is.
  let finish = 0;
  for (const activity of network.activities) {
    const end = activity.earliestStart + activity.span;
    if (end > finish) finish = end;
  }
  network.finish = finish;

  for (const node of network.nodes) {
    node.latestStart = finish - node.toFinish;
  }

  return [];
}

/**
 * Orders the nodes so that each comes after everything it depends on, or reports
 * that no such order exists — which happens exactly when the network has a
 * circle, whether or not that circle is a problem.
 */
export function topologicalOrder(nodes: readonly Node[]): Node[] | undefined {
  const queue: Node[] = [];

  for (const node of nodes) {
    node.pending = node.indegree;
    if (node.pending === 0) queue.push(node);
  }

  // The queue is appended to while it is walked; an array iterator picks those
  // up, so this drains the queue rather than only its initial contents.
  const order: Node[] = [];
  for (const node of queue) {
    order.push(node);
    for (const edge of node.outgoing) {
      edge.to.pending -= 1;
      if (edge.to.pending === 0) queue.push(edge.to);
    }
  }

  return order.length === nodes.length ? order : undefined;
}

/** Every value starts from the lowest it could possibly be. */
function seedFloors(network: Network): void {
  for (const node of network.nodes) {
    node.earliestStart = 0;
    node.toFinish = node.span;
    node.arrivedBy = undefined;
  }
}

/** The acyclic case: one pass forward, one pass back. */
function passInOrder(network: Network, order: readonly Node[]): ScheduleIssue[] {
  seedFloors(network);

  for (const node of order) {
    for (const edge of node.outgoing) {
      const candidate = node.earliestStart + edge.lag;
      if (candidate > edge.to.earliestStart) edge.to.earliestStart = candidate;
    }
  }

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index];
    if (node === undefined) continue;

    for (const edge of node.outgoing) {
      const candidate = edge.lag + edge.to.toFinish;
      if (candidate > node.toFinish) node.toFinish = candidate;
    }
  }

  return [];
}

/**
 * The general case: relax every edge, round after round.
 *
 * Longest paths use at most one edge per node, so after that many rounds nothing
 * can still improve — unless improvements are coming from a circle that gains
 * length on every lap, which is exactly a set of constraints nothing satisfies.
 * Rounds are what makes that argument hold: a scheme that relaxes in whatever
 * order comes to hand can improve a node many more times than there are nodes
 * without any circle being to blame.
 *
 * Rounds stop as soon as one changes nothing, so a network that settles quickly
 * costs little more than the passes above.
 */
function relaxInRounds(network: Network): ScheduleIssue[] {
  seedFloors(network);

  const forward = relax(network, (edge) => {
    const candidate = edge.from.earliestStart + edge.lag;
    if (candidate <= edge.to.earliestStart) return undefined;
    edge.to.earliestStart = candidate;
    return edge.to;
  });
  if (forward !== undefined) return [forward];

  for (const node of network.nodes) node.arrivedBy = undefined;

  // A circle's length does not depend on the direction it is walked, so this
  // cannot find one the pass above missed. It is checked all the same.
  const backward = relax(network, (edge) => {
    const candidate = edge.to.toFinish + edge.lag;
    if (candidate <= edge.from.toFinish) return undefined;
    edge.from.toFinish = candidate;
    return edge.from;
  });
  return backward === undefined ? [] : [backward];
}

/**
 * Rounds of relaxation in whichever direction `improve` works, followed by the
 * one extra round that tells a settled network from an impossible one.
 */
function relax(
  network: Network,
  improve: (edge: Edge) => Node | undefined,
): ScheduleIssue | undefined {
  const limit = network.nodes.length;

  for (let round = 1; round < limit; round += 1) {
    let last: Node | undefined;

    // Sweeps alternate direction. A maximum lag points a constraint back the way
    // the network was written, and a one-way sweep would carry it one activity
    // per round; going the other way on every second round carries it the length
    // of the chain at once.
    const forwards = round % 2 === 1;
    for (let index = 0; index < network.nodes.length; index += 1) {
      const node = network.nodes[forwards ? index : network.nodes.length - 1 - index];
      if (node === undefined) continue;

      for (const edge of node.outgoing) {
        const improved = improve(edge);
        if (improved === undefined) continue;
        improved.arrivedBy = edge;
        last = improved;
      }
    }

    // Nothing moved: the longest paths are settled.
    if (last === undefined) return undefined;

    // Every value came from somewhere, and those edges form a forest — unless
    // the constraints are impossible, in which case they close into a circle.
    // Finding it here rather than waiting out the rounds is what keeps a network
    // whose circle is thousands of activities long from costing nodes x edges.
    //
    // Looked for on rounds 1, 2, 4, 8 and so on: the search walks the whole
    // network, so doing it every round would itself cost nodes x rounds, while
    // doubling never leaves it more than one round late in relative terms.
    if ((round & (round - 1)) === 0) {
      const inside = circleInArrivals(last, limit);
      if (inside !== undefined) return unsatisfiable(inside, limit);
    }
  }

  // A longest path visits each node once, so nothing should still be improving.
  for (const node of network.nodes) {
    for (const edge of node.outgoing) {
      const improved = improve(edge);
      if (improved === undefined) continue;
      improved.arrivedBy = edge;
      return unsatisfiable(improved, limit);
    }
  }

  return undefined;
}

/**
 * Walks back along the edges values arrived by, looking for a node twice.
 *
 * A circle among those edges is always positive, which is why finding one is
 * proof on its own. Each of its nodes took its value from the next, so all those
 * equations hold at once; the one set most recently improved on what its own
 * predecessor had recorded, and that single strict step makes the lags around the
 * circle sum to more than zero.
 */
function circleInArrivals(from: Node, limit: number): Node | undefined {
  const seen = new Set<Node>();
  let node: Node = from;

  for (let step = 0; step <= limit; step += 1) {
    if (seen.has(node)) return node;
    seen.add(node);

    const edge: Edge | undefined = node.arrivedBy;
    if (edge === undefined) return undefined;
    node = otherEnd(edge, node);
  }

  return undefined;
}

/** The end of the edge that is not this node. */
function otherEnd(edge: Edge, node: Node): Node {
  return edge.to === node ? edge.from : edge.to;
}

/**
 * Names the circle that cannot be satisfied.
 *
 * Walking back along the edges the nodes arrived by, as many steps as the
 * network has nodes, is certain to land inside the circle; one more lap from
 * there collects it, and the lags of the edges walked add up to the length by
 * which it overshoots.
 */
function unsatisfiable(detected: Node, nodeCount: number): ScheduleIssue {
  const stepBack = (node: Node): Node | undefined => {
    const edge = node.arrivedBy;
    return edge === undefined ? undefined : otherEnd(edge, node);
  };

  let inside = detected;
  for (let step = 0; step < nodeCount; step += 1) {
    const previous = stepBack(inside);
    if (previous === undefined) break;
    inside = previous;
  }

  const walked: Node[] = [];
  let excess = 0;
  let walker: Node | undefined = inside;

  do {
    walked.push(walker);
    const edge = walker.arrivedBy;
    if (edge === undefined) break;
    excess += edge.lag;
    walker = stepBack(walker);
  } while (walker !== undefined && walker !== inside);

  // The walk went against the direction of the edges, so the circle reads the
  // other way round.
  walked.reverse();

  const synthetic = walked.some((node) => node.kind !== 'activity');
  const activities = walked.filter((node) => node.kind === 'activity').map((node) => node.id);
  const named = activities.length > 0 ? activities : walked.map((node) => node.id);
  const days = `${String(excess)} working ${excess === 1 ? 'day' : 'days'}`;

  if (synthetic) {
    return {
      code: 'impossible-time-window',
      cycle: named,
      excess,
      message: `The dates required of ${named.map((id) => `"${id}"`).join(', ')} cannot all be met: they are missed by ${days}.`,
    };
  }

  return {
    code: 'circular-dependency',
    cycle: named,
    excess,
    message: `The tasks ${named.map((id) => `"${id}"`).join(' -> ')} constrain each other in a circle that overshoots by ${days}.`,
  };
}
