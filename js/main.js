// Bootstrap: load data, render the map, compute the budget, then show the menu
// and start the chosen game mode.
import { START, DEST, BUDGET_MULTIPLIER } from './config.js';
import { loadData } from './data.js';
import { cheapestPathCost } from './pathfinding.js';
import { initMap } from './map.js';
import { playVsComputer, playVsHuman } from './game.js';

async function main() {
  await loadData();
  await initMap('#map');

  // Budget = cheapest possible full path x multiplier, rounded to nearest £10.
  const cheapest = cheapestPathCost(START, DEST);
  const budget = Math.round((cheapest * BUDGET_MULTIPLIER) / 10) * 10;

  const menu = document.getElementById('menu');
  const nameEntry = document.getElementById('name-entry');

  document.getElementById('menu-vs-computer').addEventListener('click', () => {
    menu.classList.add('hidden');
    playVsComputer(budget);
  });

  // "Play vs Human" reveals the name fields; "Start race" begins the game.
  document.getElementById('menu-vs-human').addEventListener('click', () => {
    nameEntry.classList.remove('hidden');
  });

  document.getElementById('name-start').addEventListener('click', () => {
    const name1 = document.getElementById('name-1').value.trim() || 'Player 1';
    const name2 = document.getElementById('name-2').value.trim() || 'Player 2';
    menu.classList.add('hidden');
    playVsHuman(budget, name1, name2);
  });
}

main().catch((err) => {
  console.error(err);
  document.getElementById('routes-title').textContent =
    'Failed to load the game. Are you running it via a local web server?';
});
