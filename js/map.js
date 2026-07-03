// Renders the monochrome world map and the gliding player marker.
// d3 (full bundle) and topojson-client are vendored as globals `d3` / `topojson`.
import { START, DEST, GLIDE_MS } from './config.js';
import { getCities, getCity } from './data.js';

const WIDTH = 960;
const HEIGHT = 480; // equirectangular world is 2:1
const PAD = 48; // px padding so edge city labels aren't clipped

let projection;
let svg;
let markerEl;

// Project a city to [x, y] pixel coordinates using the same projection as the map.
function projectCity(name) {
  const c = getCity(name);
  return projection([c.longitude, c.latitude]);
}

export async function initMap(svgSelector) {
  svg = d3.select(svgSelector).attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.selectAll('*').remove();

  const world = await (await fetch('assets/world-110m.json')).json();
  const land = topojson.feature(world, world.objects.countries);

  // Zoom the view to just fit the named cities (with padding for labels). The
  // world land still renders behind through the same projection as backdrop.
  const cityPoints = {
    type: 'MultiPoint',
    coordinates: getCities().map((c) => [c.longitude, c.latitude]),
  };
  projection = d3
    .geoEquirectangular()
    .fitExtent([[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]], cityPoints);
  const path = d3.geoPath(projection);

  // Ocean background.
  svg
    .append('rect')
    .attr('class', 'ocean')
    .attr('width', WIDTH)
    .attr('height', HEIGHT);

  // Landmasses (monochrome).
  svg
    .append('g')
    .attr('class', 'land')
    .selectAll('path')
    .data(land.features)
    .join('path')
    .attr('d', path);

  // City markers + labels — only cities present in cities.yml.
  const cityGroup = svg.append('g').attr('class', 'cities');
  for (const c of getCities()) {
    const [x, y] = projection([c.longitude, c.latitude]);
    const isStart = c.name === START;
    const isDest = c.name === DEST;
    const endpoint = isStart || isDest;

    cityGroup
      .append('circle')
      .attr('class', `city-dot${endpoint ? ' endpoint' : ''}`)
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', endpoint ? 5 : 3);

    cityGroup
      .append('text')
      .attr('class', `city-label${endpoint ? ' endpoint' : ''}`)
      .attr('x', x + 6)
      .attr('y', y + 3)
      .text(endpoint ? `${c.name}${isStart ? ' (start)' : ' (finish)'}` : c.name);
  }

  // Player marker (red), starts on the start city.
  const [sx, sy] = projectCity(START);
  markerEl = svg
    .append('circle')
    .attr('class', 'player-marker')
    .attr('cx', sx)
    .attr('cy', sy)
    .attr('r', 6);
}

// Glide the player marker from its current position to `cityName`. Resolves when done.
export function animateMarkerTo(cityName) {
  const [tx, ty] = projectCity(cityName);
  const x0 = +markerEl.attr('cx');
  const y0 = +markerEl.attr('cy');

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      markerEl.attr('cx', tx).attr('cy', ty); // snap to exact target
      resolve();
    };
    const start = performance.now();
    function frame(now) {
      if (done) return;
      const t = Math.min(1, (now - start) / GLIDE_MS);
      // ease-in-out
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      markerEl.attr('cx', x0 + (tx - x0) * e).attr('cy', y0 + (ty - y0) * e);
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    }
    requestAnimationFrame(frame);
    // Safety net: if rAF is throttled (e.g. a backgrounded tab), still complete.
    setTimeout(finish, GLIDE_MS + 300);
  });
}

// Instantly place the marker (used to reset the marker for the opponent replay).
export function placeMarkerAt(cityName) {
  const [x, y] = projectCity(cityName);
  markerEl.attr('cx', x).attr('cy', y);
}

// Swap the marker colour (player = red, opponent replay = blue).
export function setMarkerKind(kind) {
  markerEl.attr('class', kind === 'opponent' ? 'opponent-marker' : 'player-marker');
}
