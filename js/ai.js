// Balanced, budget-aware computer opponent.
// It prefers faster routes but only takes a route if it can still afford the
// cheapest path to the destination afterwards, so it won't strand itself.
import { DEST } from './config.js';
import { routesFrom } from './data.js';
import { cheapestPathCost } from './pathfinding.js';

// Simulate the opponent's whole journey from `start`, returning a result:
//   { legs: [...], timeElapsed, distanceTravelled, budgetRemaining, reached }
export function runOpponent(start, budget) {
  let current = start;
  let budgetRemaining = budget;
  let timeElapsed = 0;
  let distanceTravelled = 0;
  const legs = [];
  const seen = new Set(); // guard against pathological cycles

  while (current !== DEST) {
    if (seen.has(current)) break;
    seen.add(current);

    const options = routesFrom(current).filter((leg) => leg.cost <= budgetRemaining);
    if (options.length === 0) break; // stranded: no affordable onward route

    // Prefer routes that keep us solvent to the finish; among those, fastest.
    const solvent = options.filter(
      (leg) => leg.cost + cheapestPathCost(leg.to, DEST) <= budgetRemaining
    );
    const pool = solvent.length ? solvent : options;

    let choice = pool[0];
    if (solvent.length) {
      // Fastest among solvent options.
      for (const leg of pool) if (leg.duration < choice.duration) choice = leg;
    } else {
      // No safe option: spend as little as possible and hope.
      for (const leg of pool) if (leg.cost < choice.cost) choice = leg;
    }

    budgetRemaining -= choice.cost;
    timeElapsed += choice.duration;
    distanceTravelled += choice.distance;
    legs.push(choice);
    current = choice.to;
  }

  return {
    legs,
    timeElapsed,
    distanceTravelled,
    budgetRemaining,
    reached: current === DEST,
  };
}
