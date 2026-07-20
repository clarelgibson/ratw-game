// Renders the monochrome world map and the gliding player marker.
// d3 (full bundle) and topojson-client are vendored as globals `d3` / `topojson`.
import { START, DEST, GLIDE_MS } from './config.js';
import { getCities, getCity } from './data.js';

const WIDTH = 960;
const HEIGHT = 480; // equirectangular world is 2:1
const PAD = 48; // px padding so edge city labels aren't clipped

// Target on-screen sizes (CSS px). Because the SVG scales to fit its container
// (heavily on mobile), these are converted to viewBox units each render so the
// map reads at a consistent, legible size on any device.
const SIZES = {
  labelPx: 11,
  endpointLabelPx: 12,
  dotPx: 3.5,
  endpointDotPx: 5.5,
  markerPx: 7,
  labelGapPx: 6,
};

let projection;
let svg;
let markerEl;
let cityNodes = [];
let resizeBound = false;

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
  cityNodes = getCities().map((c) => {
    const [x, y] = projection([c.longitude, c.latitude]);
    const isStart = c.name === START;
    const endpoint = isStart || c.name === DEST;
    return { x, y, endpoint, isStart, name: c.name };
  });

  cityGroup
    .selectAll('circle')
    .data(cityNodes)
    .join('circle')
    .attr('class', (d) => `city-dot${d.endpoint ? ' endpoint' : ''}`)
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y);

  cityGroup
    .selectAll('text')
    .data(cityNodes)
    .join('text')
    .attr('class', (d) => `city-label${d.endpoint ? ' endpoint' : ''}`)
    .attr('dominant-baseline', 'central')
    .text((d) => d.name);

  // Player marker (red), starts on the start city.
  const [sx, sy] = projectCity(START);
  markerEl = svg
    .append('circle')
    .attr('class', 'player-marker')
    .attr('cx', sx)
    .attr('cy', sy);

  // Size everything for the current viewport, and keep it sized on resize.
  applyResponsiveSizes();
  if (!resizeBound) {
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(applyResponsiveSizes, 120);
    });
    resizeBound = true;
  }
}

// Convert the target on-screen px sizes to viewBox units for the current
// display scale, so labels/dots/marker stay legible at any viewport width.
// Right-edge labels are anchored inward so they don't clip off the map.
function applyResponsiveSizes() {
  if (!svg) return;
  const displayedWidth = svg.node().getBoundingClientRect().width;
  if (!displayedWidth) return;
  const s = (px) => (px * WIDTH) / displayedWidth; // px → viewBox units
  // On a wide map, spell out the start/finish suffix; on narrow screens the
  // gold colour (and the header) already convey it, so keep labels short.
  const wide = displayedWidth >= 560;

  svg
    .selectAll('.city-dot')
    .attr('r', (d) => s(d.endpoint ? SIZES.endpointDotPx : SIZES.dotPx));

  svg
    .selectAll('.city-label')
    .style('font-size', (d) => `${s(d.endpoint ? SIZES.endpointLabelPx : SIZES.labelPx)}px`)
    .each(function (d) {
      const sel = d3.select(this);
      if (d.endpoint) {
        sel.text(d.name + (wide ? (d.isStart ? ' (start)' : ' (finish)') : ''));
      }
      const rightSide = d.x > WIDTH * 0.7;
      const gap = s(SIZES.labelGapPx);
      sel
        .attr('text-anchor', rightSide ? 'end' : 'start')
        .attr('x', d.x + (rightSide ? -gap : gap))
        .attr('y', d.y);
    });

  if (markerEl) markerEl.attr('r', s(SIZES.markerPx));
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
