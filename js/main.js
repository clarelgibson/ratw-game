// Bootstrap: load data, render the map, compute the budget, start the race.
import { START, DEST, BUDGET_MULTIPLIER } from './config.js';
import { loadData } from './data.js';
import { cheapestPathCost } from './pathfinding.js';
import { initMap } from './map.js';
import { startGame } from './game.js';

async function main() {
  await loadData();
  await initMap('#map');

  // Budget = cheapest possible full path x multiplier, rounded to nearest £10.
  const cheapest = cheapestPathCost(START, DEST);
  const budget = Math.round((cheapest * BUDGET_MULTIPLIER) / 10) * 10;

  startGame(budget);
}

main().catch((err) => {
  console.error(err);
  document.getElementById('routes-title').textContent =
    'Failed to load the game. Are you running it via a local web server?';
});
