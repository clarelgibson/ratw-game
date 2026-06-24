// Dijkstra over the directed travel graph, weighted by either cost or duration.
import { routesFrom } from './data.js';

function shortestPath(from, to, weightKey) {
  const dist = new Map();
  dist.set(from, 0);
  // Simple array-based priority selection; the graph is tiny so this is fine.
  const visited = new Set();
  const queue = new Set([from]);

  while (queue.size) {
    // Pick the unvisited node with the smallest known distance.
    let current = null;
    let best = Infinity;
    for (const node of queue) {
      const d = dist.get(node);
      if (d < best) {
        best = d;
        current = node;
      }
    }
    if (current === null) break;
    queue.delete(current);
    if (current === to) return best;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const leg of routesFrom(current)) {
      if (visited.has(leg.to)) continue;
      const nd = best + leg[weightKey];
      if (nd < (dist.get(leg.to) ?? Infinity)) {
        dist.set(leg.to, nd);
      }
      queue.add(leg.to);
    }
  }

  return dist.has(to) ? dist.get(to) : Infinity;
}

// Minimum total GBP cost to travel from `from` to `to`.
export function cheapestPathCost(from, to) {
  return shortestPath(from, to, 'cost');
}

// Minimum total duration (hours) to travel from `from` to `to`.
export function fastestPathDuration(from, to) {
  return shortestPath(from, to, 'duration');
}
