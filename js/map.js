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
let contentG; // zoom/pan target: holds land, cities and the marker
let markerEl;
let cityNodes = [];
let resizeBound = false;
let zoomBehavior;
let zoomK = 1; // current zoom scale; labels/dots counter-scale by this

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

  // Ocean background — stays fixed behind the zoomable content.
  svg
    .append('rect')
    .attr('class', 'ocean')
    .attr('width', WIDTH)
    .attr('height', HEIGHT);

  // Everything below zooms/pans together.
  contentG = svg.append('g').attr('class', 'content');

  // Landmasses (monochrome).
  contentG
    .append('g')
    .attr('class', 'land')
    .selectAll('path')
    .data(land.features)
    .join('path')
    .attr('d', path);

  // City markers + labels — only cities present in cities.yml.
  const cityGroup = contentG.append('g').attr('class', 'cities');
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
  markerEl = contentG
    .append('circle')
    .attr('class', 'player-marker')
    .attr('cx', sx)
    .attr('cy', sy);

  setupZoom();

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

// Zoom & pan. A plain transform would magnify labels along with positions, so
// on every zoom we re-size labels/dots to stay a constant screen size while the
// city positions spread apart — which is what actually separates clusters.
function setupZoom() {
  zoomBehavior = d3
    .zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [WIDTH, HEIGHT]]) // can't pan outside the fitted view
    .filter((event) => {
      // Desktop: wheel + double-click zoom, left-drag pan.
      if (event.type === 'wheel' || event.type === 'dblclick') return true;
      if (event.touches) {
        // Pinch (2 fingers) always; one-finger pan only once zoomed in, so at
        // the default zoom a single-finger swipe still scrolls the page.
        return event.touches.length >= 2 || zoomK > 1;
      }
      return !event.button;
    })
    .on('zoom', (event) => {
      contentG.attr('transform', event.transform);
      zoomK = event.transform.k;
      applyResponsiveSizes();
    });

  svg.call(zoomBehavior);

  const zoomBy = (factor) =>
    svg.transition().duration(250).call(zoomBehavior.scaleBy, factor);
  document.getElementById('zoom-in')?.addEventListener('click', () => zoomBy(1.6));
  document.getElementById('zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.6));
  document
    .getElementById('zoom-reset')
    ?.addEventListener('click', () =>
      svg.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity)
    );
}

// Convert the target on-screen px sizes to viewBox units for the current
// display scale, so labels/dots/marker stay legible at any viewport width.
// Right-edge labels are anchored inward so they don't clip off the map.
function applyResponsiveSizes() {
  if (!svg) return;
  const displayedWidth = svg.node().getBoundingClientRect().width;
  if (!displayedWidth) return;
  // px → viewBox units, divided by the zoom scale so on-screen size stays
  // constant as you zoom (positions spread apart, labels don't grow).
  const s = (px) => (px * WIDTH) / (displayedWidth * zoomK);
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
      if (d.endpoint) {
        d3.select(this).text(d.name + (wide ? (d.isStart ? ' (start)' : ' (finish)') : ''));
      }
    });

  layoutLabels(s);

  if (markerEl) markerEl.attr('r', s(SIZES.markerPx));
}

// De-clutter labels: place each beside its dot, then push overlapping labels
// apart vertically and draw a thin leader line for any that had to move. Runs
// in viewBox units, so as zoom spreads the dots out the labels relax back home.
function layoutLabels(s) {
  const gap = s(SIZES.labelGapPx);
  const pad = s(2.5); // vertical breathing room between labels (px)

  // Measure each label and seed its box beside the dot.
  const boxes = [];
  svg.selectAll('.city-label').each(function (d) {
    const el = d3.select(this);
    const w = this.getComputedTextLength();
    const h = parseFloat(el.style('fontSize')) || s(SIZES.labelPx);
    const side = d.x > WIDTH * 0.7 ? -1 : 1; // right-edge labels sit to the left
    const startX = d.x + side * gap;
    const cx = side > 0 ? startX + w / 2 : startX - w / 2;
    boxes.push({ el, d, side, startX, cx, w, h, y: d.y, anchorY: d.y });
  });

  // Iteratively separate labels whose boxes overlap in both axes.
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (Math.abs(a.cx - b.cx) >= (a.w + b.w) / 2) continue; // columns don't overlap
        const minDist = (a.h + b.h) / 2 + pad;
        const dy = b.y - a.y;
        if (Math.abs(dy) >= minDist) continue;
        const push = (minDist - Math.abs(dy)) / 2 + 0.01;
        const sign = dy === 0 ? 1 : Math.sign(dy);
        a.y -= push * sign;
        b.y += push * sign;
      }
    }
    for (const bx of boxes) bx.y += (bx.anchorY - bx.y) * 0.06; // weak pull home
  }

  // Apply positions and collect leader lines for displaced labels.
  const lines = [];
  for (const bx of boxes) {
    bx.el
      .attr('text-anchor', bx.side > 0 ? 'start' : 'end')
      .attr('x', bx.startX)
      .attr('y', bx.y);
    if (Math.abs(bx.y - bx.anchorY) > bx.h * 0.6) {
      lines.push({ x1: bx.d.x, y1: bx.d.y, x2: bx.startX, y2: bx.y });
    }
  }

  let leaders = contentG.select('g.leaders');
  if (leaders.empty()) leaders = contentG.insert('g', 'g.cities').attr('class', 'leaders');
  leaders
    .selectAll('line')
    .data(lines)
    .join('line')
    .attr('x1', (d) => d.x1)
    .attr('y1', (d) => d.y1)
    .attr('x2', (d) => d.x2)
    .attr('y2', (d) => d.y2)
    .attr('stroke-width', s(0.7));
}

// Pan the map so [x, y] is centred, keeping the current zoom. Only acts when
// zoomed in — at the default zoom the whole map is visible (and translateExtent
// would clamp it to a no-op anyway), so the view stays still.
function followCamera(x, y) {
  if (!zoomBehavior || zoomK <= 1.02) return;
  svg
    .transition()
    .duration(GLIDE_MS)
    .ease(d3.easeCubicInOut)
    .call(zoomBehavior.translateTo, x, y);
}

// Glide the player marker from its current position to `cityName`. Resolves when done.
export function animateMarkerTo(cityName) {
  const [tx, ty] = projectCity(cityName);
  const x0 = +markerEl.attr('cx');
  const y0 = +markerEl.attr('cy');

  // Let the camera follow the marker to its destination.
  followCamera(tx, ty);

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
