// The Godot package terrain: cell heights turned into a smooth raster in meters, with lakes, roads and river beds shaped into it

import Delaunator from "delaunator";

type Point = [number, number];

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Everything the raster needs from the map, as plain data a worker can receive */
export interface TerrainSource {
  width: number;
  height: number;
  points: Point[]; // cell centers
  heights: ArrayLike<number>; // generator scale, 0-100, sea below 20
  biomes: ArrayLike<number>;
  heightExponent: number;
  seed: string;
  lakes: { ring: Point[]; surface: number }[]; // surface on the generator scale
  roads: { points: Point[]; width: number }[]; // smoothed, width in meters
  rivers: { points: Point[]; widths: number[] }[]; // widths in map units, per point
}

export interface TerrainSettings {
  region: Region;
  columns: number;
  metersPerPixel: number;
  maxAltitude: number; // meters of the highest possible land
  seaDepth: number; // meters of the deepest sea
  detail: number; // 0-1, strength of the seeded relief detail
}

export interface TerrainRaster {
  columns: number;
  rows: number;
  heights: Float32Array; // meters, sea level at 0
  biomes: Uint8Array;
  blendBiomes: Uint8Array; // the neighbouring biome a pixel fades into
  blendWeights: Uint8Array; // its share, 0-255: about half on the border
  masks: Record<MaskName, Uint8Array>;
  lakeSurfaces: number[]; // meters, per source lake
  roadHeights: number[][]; // meters, per source road point
  riverSurfaces: number[][]; // meters, per source river point
}

export type MaskName = "sea" | "lakes" | "rivers" | "roads" | "coast";

const SEA_LEVEL = 20;
const SHORE_STEP = 0.4; // meters between the shore and the water

/** The pixel grid of a region: its size and the map units one pixel covers */
export function rasterGrid({ region, columns }: Pick<TerrainSettings, "region" | "columns">) {
  const unit = (region.x1 - region.x0) / columns;
  const rows = Math.max(1, Math.round((region.y1 - region.y0) / unit));
  const toPixel = ([x, y]: Point): Point => [(x - region.x0) / unit - 0.5, (y - region.y0) / unit - 0.5];
  return { unit, rows, toPixel };
}

/** Generator height to meters: land reaches maxAltitude at 100, the sea floor seaDepth at 0 */
export function heightScale(exponent: number, maxAltitude: number, seaDepth: number) {
  const base = 2 ** exponent;
  const top = 82 ** exponent - base;
  return (h: number) =>
    h >= SEA_LEVEL ? (((h - 18) ** exponent - base) / top) * maxAltitude : -((SEA_LEVEL - h) / SEA_LEVEL) * seaDepth;
}

export function buildTerrain(source: TerrainSource, settings: TerrainSettings): TerrainRaster {
  const { columns } = settings;
  const { unit, rows, toPixel } = rasterGrid(settings);
  const size = columns * rows;
  const cellSpacing = Math.sqrt((source.width * source.height) / source.points.length); // map units

  const field = new Float32Array(size);
  const biomes = new Uint8Array(size);
  interpolate(source, settings, toPixel, rows, field, biomes);
  const sharp = field.slice();
  boxBlur(field, columns, rows, Math.max(1, Math.round((cellSpacing * 0.35) / unit)), 2);
  for (let i = 0; i < size; i++) {
    // smoothing must not move the coastline the map draws
    if (sharp[i] >= SEA_LEVEL && field[i] < SEA_LEVEL) field[i] = SEA_LEVEL + 0.05;
    else if (sharp[i] < SEA_LEVEL && field[i] >= SEA_LEVEL) field[i] = SEA_LEVEL - 0.05;
  }

  const toMeters = heightScale(source.heightExponent, settings.maxAltitude, settings.seaDepth);
  const sea = new Uint8Array(size);
  const heights = new Float32Array(size);
  const wavelength = cellSpacing * 1.2;
  const octaves = Math.max(1, Math.min(5, Math.floor(Math.log2(wavelength / (unit * 4))) + 1)); // finest wave spans 4+ pixels
  const noise = createNoise(source.seed, octaves);
  const fade = Math.max(2, (cellSpacing * 0.3) / unit); // pixels from the border to a pure biome
  const { blendBiomes, blendWeights } = blendBiomeBorders(biomes, columns, rows, fade, (column, row) =>
    noise((settings.region.x0 + column * unit) / (fade * unit), (settings.region.y0 + row * unit) / (fade * unit))
  );
  const frequency = 1 / wavelength;
  const amplitude = settings.detail * settings.maxAltitude * 0.06;
  for (let row = 0, i = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++, i++) {
      const h = field[i];
      if (h < SEA_LEVEL) sea[i] = 255;
      const x = settings.region.x0 + (column + 0.5) * unit;
      const y = settings.region.y0 + (row + 0.5) * unit;
      const shore = Math.min(1, Math.abs(h - SEA_LEVEL) / 4); // the coastline stays where the map draws it
      const relief = h >= SEA_LEVEL ? 0.35 + (h - SEA_LEVEL) / 80 : 0.2;
      const height = toMeters(h) + noise(x * frequency, y * frequency) * amplitude * shore * relief;
      heights[i] = h >= SEA_LEVEL ? Math.max(height, SHORE_STEP) : Math.min(height, -SHORE_STEP); // no land flush with the water
    }
  }

  const pixelMeters = settings.metersPerPixel;
  const lakes = new Uint8Array(size);
  const lakeSurfaces = source.lakes.map(lake => {
    const surface = toMeters(lake.surface);
    shapeLake(lake.ring.map(toPixel), surface, heights, lakes, columns, rows, pixelMeters, settings.maxAltitude);
    return surface;
  });

  const roads = new Uint8Array(size);
  const roadHeights = source.roads.map(road =>
    flattenRoad(road.points.map(toPixel), road.width / pixelMeters, heights, roads, columns, rows)
  );

  const rivers = new Uint8Array(size);
  const riverSurfaces = source.rivers.map(river =>
    carveRiver(
      river.points.map(toPixel),
      river.widths.map(width => width / unit),
      pixelMeters,
      heights,
      rivers,
      columns,
      rows
    )
  );

  const coast = coastMask(sea, columns, rows, Math.max(2, Math.round(40 / pixelMeters)));
  return {
    columns,
    rows,
    heights,
    biomes,
    blendBiomes,
    blendWeights,
    masks: { sea, lakes, rivers, roads, coast },
    lakeSurfaces,
    roadHeights,
    riverSurfaces
  };
}

/** Bilinear height in meters at a pixel position */
export function sampleHeight(raster: Pick<TerrainRaster, "heights" | "columns" | "rows">, [px, py]: Point): number {
  const { heights, columns, rows } = raster;
  const x = Math.min(Math.max(px, 0), columns - 1);
  const y = Math.min(Math.max(py, 0), rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, columns - 1);
  const y1 = Math.min(y0 + 1, rows - 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = heights[y0 * columns + x0] * (1 - fx) + heights[y0 * columns + x1] * fx;
  const bottom = heights[y1 * columns + x0] * (1 - fx) + heights[y1 * columns + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// heights linearly across the Delaunay triangles of cell centers, biome of the nearest center
function interpolate(
  source: TerrainSource,
  settings: TerrainSettings,
  toPixel: (point: Point) => Point,
  rows: number,
  field: Float32Array,
  biomes: Uint8Array
): void {
  const { columns } = settings;
  const points = [...source.points];
  const heights = Array.from(source.heights);
  const biomeOf = Array.from(source.biomes);
  // a frame around the map so its edges are covered too
  const steps = 24;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    for (const point of [
      [t * source.width, -1],
      [t * source.width, source.height + 1],
      [-1, t * source.height],
      [source.width + 1, t * source.height]
    ] as Point[]) {
      const nearest = nearestPoint(source.points, point);
      points.push(point);
      heights.push(source.heights[nearest]);
      biomeOf.push(source.biomes[nearest]);
    }
  }

  const pixels = points.map(toPixel);
  const { triangles } = Delaunator.from(pixels);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t];
    const b = triangles[t + 1];
    const c = triangles[t + 2];
    const [ax, ay] = pixels[a];
    const [bx, by] = pixels[b];
    const [cx, cy] = pixels[c];
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (!area) continue;
    const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx)));
    const maxX = Math.min(columns - 1, Math.floor(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy)));
    const maxY = Math.min(rows - 1, Math.floor(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const wa = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
        const wb = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
        const wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const i = y * columns + x;
        field[i] = wa * heights[a] + wb * heights[b] + wc * heights[c];
        biomes[i] = biomeOf[wa >= wb && wa >= wc ? a : wb >= wc ? b : c];
      }
    }
  }
}

function nearestPoint(points: Point[], [x, y]: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach(([px, py], i) => {
    const distance = (px - x) ** 2 + (py - y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  });
  return best;
}

// repeated separable box blur, close to a gaussian
function boxBlur(values: Float32Array, columns: number, rows: number, radius: number, passes: number): void {
  const buffer = new Float32Array(Math.max(columns, rows));
  const blurLine = (start: number, stride: number, length: number) => {
    for (let i = 0; i < length; i++) buffer[i] = values[start + i * stride];
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += buffer[Math.min(Math.max(i, 0), length - 1)];
    for (let i = 0; i < length; i++) {
      values[start + i * stride] = sum / (radius * 2 + 1);
      sum += buffer[Math.min(i + radius + 1, length - 1)] - buffer[Math.max(i - radius, 0)];
    }
  };
  for (let pass = 0; pass < passes; pass++) {
    for (let row = 0; row < rows; row++) blurLine(row * columns, 1, columns);
    for (let column = 0; column < columns; column++) blurLine(column, columns, rows);
  }
}

// seeded value noise, summed over octaves into -1..1
function createNoise(seed: string, octaves: number): (x: number, y: number) => number {
  let hashSeed = 2166136261;
  for (let i = 0; i < seed.length; i++) hashSeed = Math.imul(hashSeed ^ seed.charCodeAt(i), 16777619);
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + hashSeed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
    const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
    return top + (bottom - top) * fy;
  };
  return (x, y) => {
    let sum = 0;
    let weight = 0;
    for (let octave = 0, amplitude = 1, scale = 1; octave < octaves; octave++, amplitude *= 0.5, scale *= 2) {
      sum += (value(x * scale + octave * 17.3, y * scale - octave * 9.1) * 2 - 1) * amplitude;
      weight += amplitude;
    }
    return sum / weight;
  };
}

// even-odd scanline fill of a polygon in pixel space
function fillPolygon(ring: Point[], columns: number, rows: number, plot: (i: number) => void): void {
  const minY = Math.max(0, Math.ceil(Math.min(...ring.map(([, y]) => y))));
  const maxY = Math.min(rows - 1, Math.floor(Math.max(...ring.map(([, y]) => y))));
  for (let y = minY; y <= maxY; y++) {
    const crossings: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y) crossings.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k]));
      const to = Math.min(columns - 1, Math.floor(crossings[k + 1]));
      for (let x = from; x <= to; x++) plot(y * columns + x);
    }
  }
}

// a bowl under the lake surface, deeper away from the shore, with the shore kept above the water
function shapeLake(
  ring: Point[],
  surface: number,
  heights: Float32Array,
  mask: Uint8Array,
  columns: number,
  rows: number,
  pixelMeters: number,
  maxAltitude: number
): void {
  const inside = new Uint8Array(columns * rows);
  let count = 0;
  fillPolygon(ring, columns, rows, i => {
    inside[i] = 1;
    count++;
  });
  if (!count) return;
  const fromShore = distanceField(inside, columns, rows, 1);
  const toShore = distanceField(inside, columns, rows, 0);
  const maxDepth = Math.max(2, maxAltitude * 0.02);
  const slope = 0.08 * pixelMeters;
  for (let i = 0; i < inside.length; i++) {
    if (inside[i]) {
      heights[i] = Math.min(heights[i], surface - Math.min(maxDepth, 0.4 + fromShore[i] * slope));
      mask[i] = 255;
    } else if (toShore[i] <= 2) heights[i] = Math.max(heights[i], surface + 0.3 * toShore[i]);
  }
}

// for each pixel the nearest other biome and how much of it shows: a soft, ragged border instead of a pixel step
function blendBiomeBorders(
  biomes: Uint8Array,
  columns: number,
  rows: number,
  fade: number,
  wobble: (column: number, row: number) => number
) {
  const far = 1e9;
  const distance = new Float32Array(biomes.length).fill(far);
  const blendBiomes = new Uint8Array(biomes.length);
  const water = (biome: number) => biome === 0; // marine: the shore keeps its land biome
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x;
      if (water(biomes[i])) continue;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const other = biomes[ny * columns + nx];
        if (other === biomes[i] || water(other)) continue;
        distance[i] = 1.5; // half a pixel, in chamfer steps of a third
        blendBiomes[i] = other;
      }
    }
  }
  // spread the nearest other biome inside each biome area (chamfer 3-4)
  const relax = (i: number, x: number, y: number, step: number) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return;
    const j = y * columns + x;
    if (biomes[j] !== biomes[i] || distance[j] + step >= distance[i]) return;
    distance[i] = distance[j] + step;
    blendBiomes[i] = blendBiomes[j];
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x;
      relax(i, x - 1, y, 3);
      relax(i, x, y - 1, 3);
      relax(i, x - 1, y - 1, 4);
      relax(i, x + 1, y - 1, 4);
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = columns - 1; x >= 0; x--) {
      const i = y * columns + x;
      relax(i, x + 1, y, 3);
      relax(i, x, y + 1, 3);
      relax(i, x + 1, y + 1, 4);
      relax(i, x - 1, y + 1, 4);
    }
  }
  const blendWeights = new Uint8Array(biomes.length);
  for (let y = 0, i = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++, i++) {
      if (distance[i] >= far) continue;
      const side = biomes[i] < blendBiomes[i] ? 1 : -1; // the wobble pushes the border into one biome or the other
      const pixels = distance[i] / 3 + side * wobble(x, y) * fade * 0.7;
      blendWeights[i] = Math.round(255 * Math.min(1, Math.max(0, 0.5 * (1 - pixels / fade))));
    }
  }
  return { blendBiomes, blendWeights };
}

// distance in pixels from each pixel of the given value to the nearest pixel of the other one (chamfer 3-4)
function distanceField(mask: Uint8Array, columns: number, rows: number, value: number): Float32Array {
  const far = 1e9;
  const distance = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) distance[i] = mask[i] === value ? far : 0;
  const relax = (i: number, x: number, y: number, step: number) => {
    if (x < 0 || y < 0 || x >= columns || y >= rows) return;
    const candidate = distance[y * columns + x] + step;
    if (candidate < distance[i]) distance[i] = candidate;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x;
      if (!distance[i]) continue;
      relax(i, x - 1, y, 3);
      relax(i, x, y - 1, 3);
      relax(i, x - 1, y - 1, 4);
      relax(i, x + 1, y - 1, 4);
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = columns - 1; x >= 0; x--) {
      const i = y * columns + x;
      if (!distance[i]) continue;
      relax(i, x + 1, y, 3);
      relax(i, x, y + 1, 3);
      relax(i, x + 1, y + 1, 4);
      relax(i, x - 1, y + 1, 4);
    }
  }
  for (let i = 0; i < distance.length; i++) distance[i] = distance[i] >= far ? columns + rows : distance[i] / 3;
  return distance;
}

// visit pixels near a polyline: distance to it, and the position along it (segment index plus fraction)
function nearPolyline(
  points: Point[],
  reach: (along: number) => number,
  columns: number,
  rows: number,
  visit: (i: number, distance: number, along: number) => void
): void {
  for (let s = 0; s + 1 < points.length; s++) {
    const [ax, ay] = points[s];
    const [bx, by] = points[s + 1];
    const r = Math.max(reach(s), reach(s + 1));
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const maxX = Math.min(columns - 1, Math.ceil(Math.max(ax, bx) + r));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const maxY = Math.min(rows - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length));
        const distance = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        if (distance <= reach(s + t)) visit(y * columns + x, distance, s + t);
      }
    }
  }
}

const lerpAlong = (values: number[], along: number) => {
  const index = Math.min(Math.floor(along), values.length - 1);
  const next = Math.min(index + 1, values.length - 1);
  return values[index] + (values[next] - values[index]) * (along - index);
};

// a level strip along the road at an eased grade, blended into the slopes beside it
function flattenRoad(
  points: Point[],
  width: number,
  heights: Float32Array,
  mask: Uint8Array,
  columns: number,
  rows: number
): number[] {
  const raster = { heights, columns, rows };
  const sampled = points.map(point => Math.max(0.2, sampleHeight(raster, point)));
  const window = 6;
  const grade = sampled.map((_, i) => {
    const slice = sampled.slice(Math.max(0, i - window), i + window + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
  const half = Math.max(0.75, width / 2);
  const shoulder = half + Math.max(1.5, half);
  const original = new Map<number, number>();
  nearPolyline(
    points,
    () => shoulder,
    columns,
    rows,
    (i, distance, along) => {
      if (!original.has(i)) original.set(i, heights[i]);
      const target = lerpAlong(grade, along);
      const blend = distance <= half ? 1 : 1 - (distance - half) / (shoulder - half);
      const shaped = (original.get(i) as number) * (1 - blend) + target * blend;
      if (Math.abs(shaped - target) < Math.abs(heights[i] - target)) heights[i] = shaped;
      const paved = Math.min(1, Math.max(0, half + 1 - distance)); // the road itself, not its shoulders
      mask[i] = Math.max(mask[i], Math.round(255 * paved));
    }
  );
  return grade;
}

// a channel below a water surface that never runs uphill, with soft banks
function carveRiver(
  points: Point[],
  widths: number[],
  pixelMeters: number,
  heights: Float32Array,
  mask: Uint8Array,
  columns: number,
  rows: number
): number[] {
  const raster = { heights, columns, rows };
  const surfaces: number[] = [];
  for (const point of points) {
    const ground = sampleHeight(raster, point) - 0.3;
    surfaces.push(surfaces.length ? Math.min(surfaces[surfaces.length - 1], ground) : ground);
  }
  const halves = widths.map(width => Math.max(0.8, width / 2));
  const depths = halves.map(half => Math.min(6, Math.max(0.8, half * pixelMeters * 0.25)));
  const bank = (along: number) => lerpAlong(halves, along) + Math.max(2, lerpAlong(halves, along));
  nearPolyline(points, bank, columns, rows, (i, distance, along) => {
    const half = lerpAlong(halves, along);
    const surface = lerpAlong(surfaces, along);
    const depth = lerpAlong(depths, along);
    let target: number;
    if (distance <= half) {
      target = surface - depth * (1 - (distance / half) ** 2);
      mask[i] = 255;
    } else {
      const t = (distance - half) / (bank(along) - half);
      target = surface + t * Math.max(0, heights[i] - surface);
      mask[i] = Math.max(mask[i], Math.round(255 * (1 - t) * 0.5));
    }
    if (target < heights[i]) heights[i] = target;
  });
  return surfaces;
}

// a band along the shoreline, strongest at the water line
function coastMask(sea: Uint8Array, columns: number, rows: number, band: number): Uint8Array {
  const land = new Uint8Array(sea.length);
  for (let i = 0; i < sea.length; i++) land[i] = sea[i] ? 0 : 1;
  const fromLand = distanceField(land, columns, rows, 0); // sea pixels: distance to land
  const fromSea = distanceField(land, columns, rows, 1); // land pixels: distance to sea
  const coast = new Uint8Array(sea.length);
  for (let i = 0; i < sea.length; i++) {
    const distance = land[i] ? fromSea[i] : fromLand[i];
    coast[i] = Math.round(255 * Math.max(0, 1 - distance / band));
  }
  return coast;
}
