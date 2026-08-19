import type { Node } from './graph.js';

/**
 * Orders the tasks so that every task comes after all of its predecessors.
 *
 * Returns `undefined` when no such order exists, which happens exactly when the
 * graph has a cycle. Use {@link findCycles} to describe it.
 */
export function topologicalOrder(nodes: readonly Node[]): Node[] | undefined {
  const pending = new Map<Node, number>();
  const queue: Node[] = [];

  for (const node of nodes) {
    pending.set(node, node.predecessors.length);
    if (node.predecessors.length === 0) queue.push(node);
  }

  // The queue is appended to while it is walked; an array iterator picks those
  // up, so this drains the queue rather than only its initial contents.
  const order: Node[] = [];
  for (const node of queue) {
    order.push(node);
    for (const link of node.successors) {
      const left = (pending.get(link.successor) ?? 0) - 1;
      pending.set(link.successor, left);
      if (left === 0) queue.push(link.successor);
    }
  }

  return order.length === nodes.length ? order : undefined;
}

/**
 * Finds the circular dependencies of the graph.
 *
 * Each cycle is the list of task ids that form it: the last one depends on the
 * first. The same cycle is reported once, whichever node it was reached from.
 */
export function findCycles(nodes: readonly Node[]): string[][] {
  const visited = new Map<Node, 'visiting' | 'done'>();
  const path: Node[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const record = (cycle: string[]): void => {
    const key = canonicalKey(cycle);
    if (seen.has(key)) return;
    seen.add(key);
    cycles.push(cycle);
  };

  const visit = (node: Node): void => {
    const state = visited.get(node);
    if (state === 'done') return;

    if (state === 'visiting') {
      const start = path.indexOf(node);
      if (start >= 0) record(path.slice(start).map((member) => member.id));
      return;
    }

    visited.set(node, 'visiting');
    path.push(node);
    for (const link of node.successors) visit(link.successor);
    path.pop();
    visited.set(node, 'done');
  };

  for (const node of nodes) visit(node);

  return cycles;
}

/**
 * A key that is the same for every rotation of a cycle, so that a cycle reached
 * from one member is not reported again when reached from another.
 */
function canonicalKey(cycle: readonly string[]): string {
  const rotations = cycle.map((_, index) =>
    [...cycle.slice(index), ...cycle.slice(0, index)].join(' '),
  );

  let smallest = rotations[0] ?? '';
  for (const rotation of rotations) {
    if (rotation < smallest) smallest = rotation;
  }
  return smallest;
}
