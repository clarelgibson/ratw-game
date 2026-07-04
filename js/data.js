// Loads and parses the YAML data, then exposes the travel graph + helpers.
// js-yaml is vendored and loaded globally as `jsyaml` (see index.html).

let cityList = [];
let cityByName = new Map();
let routeList = [];
// adjacency: from-city name -> array of flattened legs {to, mode, duration, distance, cost}
let adjacency = new Map();

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.text();
}

// Flatten the YAML route shape into simple legs. Each route has:
//   { from, to, modes: [ { bus: {duration, distance, cost} }, ... ] }
function flattenRoutes(rawRoutes) {
  const legs = [];
  for (const route of rawRoutes) {
    for (const modeEntry of route.modes) {
      const mode = Object.keys(modeEntry)[0];
      const m = modeEntry[mode];
      legs.push({
        from: route.from,
        to: route.to,
        mode,
        duration: Number(m.duration),
        distance: Number(m.distance),
        cost: Number(m.cost),
      });
    }
  }
  return legs;
}

export async function loadData() {
  const [citiesText, routesText] = await Promise.all([
    fetchText('data/cities.yml'),
    fetchText('data/routes.yml'),
  ]);

  cityList = jsyaml.load(citiesText).cities;
  routeList = flattenRoutes(jsyaml.load(routesText).routes);

  cityByName = new Map(cityList.map((c) => [c.name, c]));

  adjacency = new Map();
  for (const c of cityList) adjacency.set(c.name, []);
  for (const leg of routeList) {
    if (!adjacency.has(leg.from)) adjacency.set(leg.from, []);
    adjacency.get(leg.from).push(leg);
  }

  return { cities: cityList, routes: routeList };
}

export function getCities() {
  return cityList;
}

export function getCity(name) {
  return cityByName.get(name);
}

// All outgoing legs from a city (one entry per available transport mode).
export function routesFrom(name) {
  return adjacency.get(name) || [];
}

// Destinations reachable on foot from a city: one per outgoing route that has a
// non-ferry (land) mode, using the shortest land distance for that route.
// Ferry-only routes are sea crossings and cannot be walked.
export function walkableFrom(name) {
  const byDest = new Map();
  for (const leg of routesFrom(name)) {
    if (leg.mode === 'ferry') continue;
    const prev = byDest.get(leg.to);
    if (!prev || leg.distance < prev.distance) byDest.set(leg.to, leg.distance);
  }
  return [...byDest.entries()].map(([to, distance]) => ({ to, distance }));
}
