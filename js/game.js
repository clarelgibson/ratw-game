// Core game flow. A reusable per-player turn drives both modes:
//   • vs Computer: you play, then the random AI's journey is replayed.
//   • vs Human: player 1 plays, the laptop is passed, player 2 plays.
// Either way both results go to the shared leaderboard.
import { START, DEST, AI_REPLAY_MS, WALK_SPEED_KMH } from './config.js';
import { getCity, routesFrom, walkableFrom } from './data.js';
import { runOpponent } from './ai.js';
import { rankRacers } from './leaderboard.js';
import {
  animateMarkerTo,
  placeMarkerAt,
  setMarkerKind,
} from './map.js';

const MODE_ICON = { bus: '🚌', train: '🚆', taxi: '🚕', ferry: '⛴️', walk: '🚶' };

// Build a free "walk" leg to a neighbouring city (very slow — distance / speed).
function walkLeg(to, distance) {
  return { to, mode: 'walk', duration: distance / WALK_SPEED_KMH, distance, cost: 0 };
}

let startingBudget = 0;
let state; // current player's turn state
let busy = false; // ignore clicks mid-animation
let resolveTurn = null; // resolves the in-progress playTurn promise

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
  pass: () => document.getElementById('pass'),
  passName: () => document.getElementById('pass-name'),
  passBtn: () => document.getElementById('pass-btn'),
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
  el.routesTitle().textContent = `${state.label} — routes from ${state.currentCity}`;

  const legs = routesFrom(state.currentCity);
  const anyAffordable = legs.some((leg) => leg.cost <= state.budgetRemaining);

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

  // Out of money? Offer to walk any land route — free, but painfully slow.
  if (!anyAffordable) {
    const walks = walkableFrom(state.currentCity);
    if (walks.length) {
      const note = document.createElement('p');
      note.className = 'broke-note';
      note.textContent = "Out of money! You can only walk from here — free, but very slow.";
      container.appendChild(note);
      for (const w of walks) {
        const leg = walkLeg(w.to, w.distance);
        const btn = document.createElement('button');
        btn.className = 'route walk';
        btn.innerHTML = `
          <span class="route-head">${MODE_ICON.walk} walk to <strong>${leg.to}</strong></span>
          <span class="route-stats">
            <span>Free</span>
            <span>${formatTime(leg.duration)}</span>
            <span>${leg.distance.toLocaleString('en-GB')} km</span>
          </span>`;
        btn.addEventListener('click', () => chooseRoute(leg));
        container.appendChild(btn);
      }
    }
  }
}

async function chooseRoute(leg) {
  if (busy) return;
  busy = true;

  state.budgetRemaining -= leg.cost;
  state.timeElapsed += leg.duration;
  state.distanceTravelled += leg.distance;
  state.currentCity = leg.to;
  state.legs.push(leg);

  el.routes().innerHTML = '';
  await animateMarkerTo(leg.to);
  updateHud();
  busy = false;

  // End conditions: reached the finish, or truly stuck — can't afford any route
  // AND can't walk anywhere (only water crossings / dead-ends ahead).
  const reached = state.currentCity === DEST;
  const affordablePaid = routesFrom(state.currentCity).some((r) => r.cost <= state.budgetRemaining);
  const canWalk = walkableFrom(state.currentCity).length > 0;
  if (reached || (!affordablePaid && !canWalk)) return finishTurn(reached);

  renderRoutes();
}

function finishTurn(reached) {
  const result = {
    name: state.label,
    reached,
    time: state.timeElapsed,
    distance: state.distanceTravelled,
    budget: state.budgetRemaining,
    legs: state.legs,
  };
  const done = resolveTurn;
  resolveTurn = null;
  done(result);
}

// Play one human player's whole turn; resolves with their result.
function playTurn({ label, markerKind }) {
  state = {
    label,
    currentCity: START,
    budgetRemaining: startingBudget,
    timeElapsed: 0,
    distanceTravelled: 0,
    legs: [],
  };
  setMarkerKind(markerKind);
  placeMarkerAt(START);
  updateHud();
  renderRoutes();
  return new Promise((resolve) => {
    resolveTurn = resolve;
  });
}

// "Pass the laptop" interstitial; resolves when the next player is ready.
function passLaptop(toName) {
  el.passName().textContent = toName;
  el.pass().classList.remove('hidden');
  return new Promise((resolve) => {
    const btn = el.passBtn();
    const handler = () => {
      btn.removeEventListener('click', handler);
      el.pass().classList.add('hidden');
      resolve();
    };
    btn.addEventListener('click', handler);
  });
}

async function replayOpponent(opponent) {
  setMarkerKind('opponent');
  placeMarkerAt(START);
  el.routesTitle().textContent = 'Computer is travelling…';
  await new Promise((r) => setTimeout(r, AI_REPLAY_MS));
  for (const leg of opponent.legs) {
    await animateMarkerTo(leg.to);
    await new Promise((r) => setTimeout(r, AI_REPLAY_MS));
  }
}

// Rank the two results and render the leaderboard overlay.
function showLeaderboard(results) {
  const { entries: ranked, winner, bothFailed } = rankRacers(results);
  const body = el.leaderboardBody();
  body.innerHTML = '';
  ranked.forEach((e, i) => {
    const row = document.createElement('tr');
    if (e === winner) row.className = 'you-row';
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

  const suffix = bothFailed ? ' (furthest travelled)' : '';
  const title = el.leaderboard().querySelector('h2');
  title.textContent =
    winner.name === 'You' ? `You win!${suffix} 🏆` : `${winner.name} wins!${suffix}`;

  el.leaderboard().classList.remove('hidden');
}

// --- Mode orchestrators (called by main.js) ---

export async function playVsComputer(budget) {
  startingBudget = budget;
  const you = await playTurn({ label: 'You', markerKind: 'player' });
  const computer = runOpponent(START, budget);
  await replayOpponent(computer);
  showLeaderboard([
    you,
    {
      name: 'Computer',
      reached: computer.reached,
      time: computer.timeElapsed,
      distance: computer.distanceTravelled,
      budget: computer.budgetRemaining,
    },
  ]);
}

export async function playVsHuman(budget, name1, name2) {
  startingBudget = budget;
  const p1 = await playTurn({ label: name1, markerKind: 'player' });
  await passLaptop(name2);
  const p2 = await playTurn({ label: name2, markerKind: 'opponent' });
  showLeaderboard([p1, p2]);
}
