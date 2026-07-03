// Fully random computer opponent.
// At each city it picks uniformly at random among the routes it can currently
// afford — ignoring whether it can still reach the finish — so it travels a
// different way every game and often strands itself (easy to beat).
import { DEST } from './config.js';
import { routesFrom } from './data.js';

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

    // Pick uniformly at random among the affordable options.
    const choice = options[Math.floor(Math.random() * options.length)];

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
