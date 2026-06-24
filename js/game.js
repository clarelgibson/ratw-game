// Core game flow: human plays to Delphi (or runs out of money), then the
// computer opponent's journey is simulated and replayed, then the leaderboard.
import { START, DEST, AI_REPLAY_MS } from './config.js';
import { getCity, routesFrom } from './data.js';
import { runOpponent } from './ai.js';
import { rankRacers } from './leaderboard.js';
import {
  animateMarkerTo,
  placeMarkerAt,
  setMarkerKind,
} from './map.js';

const MODE_ICON = { bus: '🚌', train: '🚆', taxi: '🚕', ferry: '⛴️' };

let startingBudget = 0;
let state;
let busy = false; // ignore clicks mid-animation

// --- DOM handles ---
const el = {
  budget: () => document.getElementById('hud-budget'),
  time: () => document.getElementById('hud-time'),
  city: () => document.getElementById('hud-city'),
  distance: () => document.getElementById('hud-distance'),
  routes: () => document.getElementById('routes'),
  routesTitle: () => document.getElementById('routes-title'),
  leaderboard: () => document.getElementById('leaderboard'),
  leaderboardBody: () => document.getElementById('leaderboard-body'),
};

function formatTime(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function formatMoney(amount) {
  return `£${amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

function updateHud() {
  el.budget().textContent = formatMoney(state.budgetRemaining);
  el.time().textContent = formatTime(state.timeElapsed);
  el.city().textContent = state.currentCity;
  const c = getCity(state.currentCity);
  el.distance().textContent =
    state.currentCity === DEST ? '0 km' : `${c.distance_to_checkpoint_km.toLocaleString('en-GB')} km`;
}

function renderRoutes() {
  const container = el.routes();
  container.innerHTML = '';
  el.routesTitle().textContent = `Routes from ${state.currentCity}`;

  const legs = routesFrom(state.currentCity);
  for (const leg of legs) {
    const affordable = leg.cost <= state.budgetRemaining;
    const btn = document.createElement('button');
    btn.className = `route${affordable ? '' : ' unaffordable'}`;
    btn.disabled = !affordable;
    btn.innerHTML = `
      <span class="route-head">${MODE_ICON[leg.mode] || ''} ${leg.mode} to <strong>${leg.to}</strong></span>
      <span class="route-stats">
        <span>${formatMoney(leg.cost)}</span>
        <span>${formatTime(leg.duration)}</span>
        <span>${leg.distance.toLocaleString('en-GB')} km</span>
      </span>`;
    btn.addEventListener('click', () => chooseRoute(leg));
    container.appendChild(btn);
  }
}

async function chooseRoute(leg) {
  if (busy) return;
  busy = true;

  state.budgetRemaining -= leg.cost;
  state.timeElapsed += leg.duration;
  state.distanceTravelled += leg.distance;
  state.currentCity = leg.to;

  el.routes().innerHTML = '';
  await animateMarkerTo(leg.to);
  updateHud();
  busy = false;

  // End conditions.
  if (state.currentCity === DEST) {
    state.reached = true;
    return endHumanTurn();
  }
  const canContinue = routesFrom(state.currentCity).some((r) => r.cost <= state.budgetRemaining);
  if (!canContinue) {
    state.reached = false;
    return endHumanTurn();
  }
  renderRoutes();
}

async function endHumanTurn() {
  el.routesTitle().textContent = state.reached
    ? 'You reached Delphi! The opponent is now travelling…'
    : 'Out of money! Stranded. The opponent is now travelling…';
  el.routes().innerHTML = '';

  const opponent = runOpponent(START, startingBudget);
  await replayOpponent(opponent);
  showLeaderboard(state, opponent);
}

async function replayOpponent(opponent) {
  setMarkerKind('opponent');
  placeMarkerAt(START);
  await new Promise((r) => setTimeout(r, AI_REPLAY_MS));
  for (const leg of opponent.legs) {
    await animateMarkerTo(leg.to);
    await new Promise((r) => setTimeout(r, AI_REPLAY_MS));
  }
}

// Rank human vs opponent and render the leaderboard overlay.
function showLeaderboard(human, opponent) {
  const entries = [
    {
      name: 'You',
      reached: human.reached,
      time: human.timeElapsed,
      distance: human.distanceTravelled,
      budget: human.budgetRemaining,
    },
    {
      name: 'Computer',
      reached: opponent.reached,
      time: opponent.timeElapsed,
      distance: opponent.distanceTravelled,
      budget: opponent.budgetRemaining,
    },
  ];

  const { entries: ranked, winner, bothFailed } = rankRacers(entries);
  const body = el.leaderboardBody();
  body.innerHTML = '';
  ranked.forEach((e, i) => {
    const row = document.createElement('tr');
    if (e.name === 'You') row.className = 'you-row';
    const result = e.reached
      ? `Finished in ${formatTime(e.time)}`
      : `Stranded — travelled ${e.distance.toLocaleString('en-GB')} km`;
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${e.name}</td>
      <td>${result}</td>
      <td>${formatMoney(e.budget)} left</td>`;
    body.appendChild(row);
  });

  const title = el.leaderboard().querySelector('h2');
  if (winner.name === 'You') {
    title.textContent = bothFailed ? 'You win (furthest travelled)!' : 'You win! 🏆';
  } else {
    title.textContent = bothFailed
      ? 'Computer wins (furthest travelled).'
      : 'Computer wins.';
  }

  el.leaderboard().classList.remove('hidden');
}

export function startGame(budget) {
  startingBudget = budget;
  state = {
    currentCity: START,
    budgetRemaining: budget,
    timeElapsed: 0,
    distanceTravelled: 0,
    reached: false,
  };
  setMarkerKind('player');
  placeMarkerAt(START);
  updateHud();
  renderRoutes();
}
