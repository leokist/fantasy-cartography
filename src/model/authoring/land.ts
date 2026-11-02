// The land of a declared world: continents and countries raise ground where the author put them, and each
// province's relief, climate, water and nature are shaped around the spot the author gave it

import type { ProvinceSeed, Seeds, StateSeed } from "@/model/authoring/world-spec";
import { heightToMeters } from "@/model/units";
import type { Point } from "@/types/global";
import { createNoise } from "@/utils/noise-utils";

// radius in shares of the map's shorter side
const CONTINENT_RADIUS = { small: 0.14, medium: 0.22, large: 0.3, huge: 0.4 };
const COUNTRY_RADIUS = { small: 0.06, medium: 0.09, large: 0.13 };
const CLIMATE_TEMPERATURE = { hot: 28, temperate: 14, cold: -6 }; // °C at sea level

interface Blob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mapSize() {
  const { width, height } = options.map.graph;
  return { width, height, side: Math.min(width, height) };
}

/** A spot in percent of the map, in map pixels */
export const toPoint = ({ x, y }: { x: number; y: number }): Point => {
  const { width, height } = mapSize();
  return [(x / 100) * width, (y / 100) * height];
};

/** Radius in map pixels of a declared country: by its size, or a circle a little larger than its area */
export function countryRadius(state: StateSeed): number {
  const { width, height, side } = mapSize();
  if (state.area !== undefined) return Math.sqrt(((state.area / 100) * width * height * 1.3) / Math.PI);
  return COUNTRY_RADIUS[state.size ?? "medium"] * side;
}

/** The area in map pixels a country sized by area asks for */
export const countryArea = (state: StateSeed): number | undefined =>
  state.area === undefined ? undefined : (state.area / 100) * mapSize().width * mapSize().height;

/**
 * How much a point belongs to a province: 1 over the part of the map nearer its spot than any other province's,
 * blending into the neighbouring province across a ragged border, and fading out far beyond its country's reach
 */
export function provinceWeight(province: ProvinceSeed, seeds: Seeds, noise: Noise, [x, y]: Point): number {
  const { side } = mapSize();
  const warp = 1 + 0.3 * noise.warp(x, y) + 0.1 * noise.detail(x, y);
  const distanceTo = (spot: ProvinceSeed) => {
    const [px, py] = toPoint(spot);
    return Math.hypot(x - px, y - py) * warp;
  };
  const own = distanceTo(province);
  const country = seeds.states[province.state];
  const reach = 2.4 * (country ? countryRadius(country) : COUNTRY_RADIUS.medium * side);
  if (own > reach) return 0;
  let nearestOther = Infinity;
  for (const other of seeds.provinces) if (other !== province) nearestOther = Math.min(nearestOther, distanceTo(other));
  const border = smoothstep(0.5 + (nearestOther - own) / (0.08 * side));
  return border * smoothstep((reach - own) / (0.35 * reach));
}

export interface Noise {
  warp: (x: number, y: number) => number;
  detail: (x: number, y: number) => number;
  ridge: (x: number, y: number) => number;
}

/** The noise fields of a world, from its seed */
export function worldNoise(seed: string): Noise {
  const { side } = mapSize();
  const warp = createNoise(`${seed}-warp`, 3);
  const detail = createNoise(`${seed}-detail`, 4);
  const ridge = createNoise(`${seed}-ridge`, 4);
  return {
    warp: (x, y) => warp(x / (side * 0.12), y / (side * 0.12)),
    detail: (x, y) => detail(x / (side * 0.05), y / (side * 0.05)),
    ridge: (x, y) => 1 - Math.abs(ridge(x / (side * 0.09), y / (side * 0.09))) // 1 along crests
  };
}

// continents as ellipses of random proportions, countries and the bridges between neighbours as circles
function landBlobs(seeds: Seeds, random: () => number): Blob[] {
  const { side } = mapSize();
  const blobs: Blob[] = seeds.continents.map(continent => {
    const radius = CONTINENT_RADIUS[continent.size] * side;
    const stretch = 0.75 + random() * 0.55;
    const [x, y] = toPoint(continent);
    return { x, y, rx: radius * stretch, ry: radius / stretch, angle: random() * Math.PI };
  });
  const circle = ([x, y]: Point, radius: number): Blob => ({ x, y, rx: radius, ry: radius, angle: 0 });

  for (const state of seeds.states) blobs.push(circle(toPoint(state), countryRadius(state)));
  for (const [index, state] of seeds.states.entries()) {
    for (const other of state.neighbors ?? []) {
      if (other <= index || !seeds.states[other]) continue;
      const [ax, ay] = toPoint(state);
      const [bx, by] = toPoint(seeds.states[other]);
      const radius = 0.6 * Math.min(countryRadius(state), countryRadius(seeds.states[other]));
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (radius * 0.8));
      for (let step = 1; step < steps; step++)
        blobs.push(circle([ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps], radius));
    }
  }
  return blobs;
}

/** Heights for the grid from the declared continents, countries and province reliefs; land is 20 and over */
export function shapeLand(seeds: Seeds, points: Point[], noise: Noise, random: () => number): Uint8Array {
  const blobs = landBlobs(seeds, random);
  const heights = new Uint8Array(points.length);

  for (const [cell, [x, y]] of points.entries()) {
    let potential = -Infinity;
    for (const blob of blobs) {
      const cos = Math.cos(blob.angle);
      const sin = Math.sin(blob.angle);
      const dx = x - blob.x;
      const dy = y - blob.y;
      const along = (dx * cos + dy * sin) / blob.rx;
      const across = (-dx * sin + dy * cos) / blob.ry;
      const warp = 1 + 0.4 * noise.warp(x, y) + 0.12 * noise.detail(x, y);
      potential = Math.max(potential, 1 - Math.hypot(along, across) * warp);
    }

    let height: number;
    if (potential > 0) {
      const inland = smoothstep(potential * 2.5);
      const crest = clamp((noise.ridge(x, y) - 0.65) / 0.35);
      height = 20.5 + potential * 22 + noise.detail(x, y) * 5 * inland + crest * 32 * inland;
    } else height = 19 + potential * 30;
    heights[cell] = potential > 0 ? clamp(Math.round(height), 20, 100) : clamp(Math.round(height), 2, 19);
  }

  for (const province of seeds.provinces) if (province.relief || province.water === "lakes") shapeProvince(province);
  return heights;

  function shapeProvince(province: ProvinceSeed): void {
    for (const [cell, point] of points.entries()) {
      if (heights[cell] < 20) continue;
      const weight = provinceWeight(province, seeds, noise, point);
      if (!weight) continue;
      const [x, y] = point;
      const height = heights[cell];
      let target = height;
      if (province.relief === "plains") target = 20.5 + (height - 20) * 0.2;
      else if (province.relief === "hills") target = 31 + 9 * noise.detail(x, y) + 6 * noise.ridge(x, y);
      else if (province.relief === "plateau") target = 46 + 3 * noise.detail(x, y);
      else if (province.relief === "mountains") target = Math.max(height, 52 + 40 * noise.ridge(x, y) ** 1.3);
      let shaped = mix(height, target, weight);
      // lakes: shallow hollows the rivers fill
      if (province.water === "lakes" && noise.detail(x * 2.3, y * 2.3) > 0.25) shaped -= 7 * weight;
      heights[cell] = clamp(Math.round(shaped), 20, 100);
    }
  }
}

/** Temperatures pulled toward each province's climate, cooler with altitude as the generator does it */
export function shapeClimate(
  seeds: Seeds,
  points: Point[],
  heights: ArrayLike<number>,
  temps: Int8Array,
  noise: Noise
) {
  for (const province of seeds.provinces) {
    if (!province.climate) continue;
    const seaLevel = CLIMATE_TEMPERATURE[province.climate];
    for (const [cell, point] of points.entries()) {
      const weight = provinceWeight(province, seeds, noise, point);
      if (!weight) continue;
      const altitude = heights[cell] >= 20 ? (heightToMeters(heights[cell]) / 1000) * 6.5 : 0;
      temps[cell] = clamp(Math.round(mix(temps[cell], seaLevel - altitude, weight)), -128, 127);
    }
  }
}

/** Precipitation scaled by each province's water: dry lands lose it, wet ones and lake lands gain it */
export function shapeWater(seeds: Seeds, points: Point[], prec: Uint8Array, noise: Noise) {
  const factor = { dry: 0.25, normal: 1, wet: 2.2, lakes: 1.6 };
  for (const province of seeds.provinces) {
    if (!province.water || province.water === "normal") continue;
    for (const [cell, point] of points.entries()) {
      const weight = provinceWeight(province, seeds, noise, point);
      if (!weight) continue;
      prec[cell] = clamp(Math.round(prec[cell] * mix(1, factor[province.water], weight) + 4 * weight), 0, 255);
    }
  }
}

/** The biome each province asks for, over its land; the edge is ragged so it blends with its neighbours */
export function shapeBiomes(seeds: Seeds, noise: Noise) {
  const { cells, biomes, features } = pack;
  for (const province of seeds.provinces) {
    if (province.biome === undefined || !biomes[province.biome] || biomes[province.biome].removed) continue;
    for (const cell of cells.i) {
      if (cells.h[cell] < 20 || features[cells.f[cell]]?.type === "lake") continue;
      const point = cells.p[cell];
      const weight = provinceWeight(province, seeds, noise, point);
      if (weight > 0.35 + 0.25 * noise.detail(point[0] * 3, point[1] * 3)) cells.biome[cell] = province.biome;
    }
  }
}
