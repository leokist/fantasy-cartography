// A declared country on a generated map: its borders with the countries it should touch, its cities and its
// provinces, each where the author put it

import { type Noise, provinceWeight, toPoint } from "@/model/authoring/land";
import type { Seeds, StateSeed } from "@/model/authoring/world-spec";
import { Burgs } from "@/model/political/burgs-generator";
import { Provinces } from "@/model/political/provinces-generator";

interface Spot {
  x: number;
  y: number;
}

/** The cell nearest to a spot given in percent of the map, among those `accept` allows */
export function nearestCell({ x, y }: Spot, accept: (cell: number) => boolean): number | undefined {
  const { width, height } = options.map.graph;
  const [px, py] = [(x / 100) * width, (y / 100) * height];
  let best: number | undefined;
  let bestDistance = Infinity;
  for (const cell of pack.cells.i) {
    if (!accept(cell)) continue;
    const [cx, cy] = pack.cells.p[cell];
    const distance = (cx - px) ** 2 + (cy - py) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [cell, distance];
  }
  return best;
}

/** Give the land between two countries to them, half each, until they share a border */
export function joinBorders(a: number | undefined, b: number | undefined): void {
  const { cells, states } = pack;
  if (!a || !b || a === b) return;
  const touches = (cell: number) => cells.c[cell].some(next => cells.state[next] === b);
  const owned = cells.i.filter(cell => cells.state[cell] === a);
  if (owned.some(touches)) return;

  const canCross = (cell: number) =>
    cells.h[cell] >= 20 && !states[cells.state[cell]]?.lock && !cells.burg[cell] && cells.state[cell] !== b;
  const from = new Map<number, number>(owned.map(cell => [cell, -1]));
  const queue = [...owned];
  let end = -1;
  while (queue.length && end < 0) {
    const cell = queue.shift() as number;
    for (const next of cells.c[cell]) {
      if (from.has(next) || cells.h[next] < 20) continue;
      if (cells.state[next] === b) {
        end = cell;
        break;
      }
      if (!canCross(next)) continue;
      from.set(next, cell);
      queue.push(next);
    }
  }
  if (end < 0) return; // nothing joins them by land the author did not lock

  const path: number[] = [];
  for (let cell = end; cell >= 0 && cells.state[cell] !== a; cell = from.get(cell) ?? -1) path.push(cell);
  path.reverse();
  path.forEach((cell, step) => {
    cells.state[cell] = step < path.length / 2 ? a : b;
  });
}

/** A country's declared cities as burgs, on its land nearest where the author put each. Returns the burg ids */
export function foundCities(seed: StateSeed, stateId: number | undefined): number[] {
  const { cells } = pack;
  const ids: number[] = [];
  for (const city of seed.cities ?? []) {
    const own = (cell: number) => cells.h[cell] >= 20 && !cells.burg[cell] && cells.state[cell] === stateId;
    const cell = nearestCell(city, own) ?? nearestCell(city, c => cells.h[c] >= 20 && !cells.burg[c]);
    if (cell === undefined) continue;
    const burgId = Burgs.add(...cells.p[cell]);
    pack.burgs[burgId].name = city.name;
    ids.push(burgId);
  }
  return ids;
}

/** A country divided into the provinces declared for state seed `index`, each around its spot. Returns their ids */
export function foundProvinces(seeds: Seeds, index: number, stateId: number | undefined, noise: Noise): number[] {
  const { cells, provinces } = pack;
  const declared = seeds.provinces.filter(province => province.state === index);
  if (!stateId || !declared.length) return [];
  for (const province of provinces)
    if (province.i && !province.removed && province.state === stateId) Provinces.remove(province.i);

  const ids: (number | undefined)[] = []; // aligned with the declared provinces
  for (const seed of declared) {
    const taken = new Set(ids.map(id => id !== undefined && provinces[id].center));
    const center = nearestCell(seed, cell => cells.state[cell] === stateId && !taken.has(cell));
    if (center === undefined) {
      ids.push(undefined);
      continue;
    }
    const id = Provinces.add(...cells.p[center]);
    Provinces.rename(id, seed.name);
    ids.push(id);
  }
  const founded = ids.filter((id): id is number => id !== undefined);
  if (!founded.length) return [];

  // each cell goes to the province it belongs to most, by the same ragged weights the land was shaped with
  const shares = new Map<number, number[]>(founded.map(id => [id, []]));
  const centers = new Map(founded.map(id => [provinces[id].center, id]));
  for (const cell of cells.i) {
    if (cells.state[cell] !== stateId) continue;
    const center = centers.get(cell);
    if (center !== undefined) {
      shares.get(center)?.push(cell);
      continue;
    }
    const [x, y] = cells.p[cell];
    let best = 0;
    let bestScore = -Infinity;
    for (const [k, seed] of declared.entries()) {
      if (ids[k] === undefined) continue;
      const [px, py] = toPoint(seed);
      // the weight decides; distance breaks ties where every weight has faded
      const score = provinceWeight(seed, seeds, noise, [x, y]) - Math.hypot(x - px, y - py) / 1e4;
      if (score > bestScore) [best, bestScore] = [k, score];
    }
    const owner = ids[best];
    if (owner !== undefined) shares.get(owner)?.push(cell);
  }
  for (const [id, owned] of shares) if (owned.length) Provinces.setCells(id, owned);
  return founded;
}

/** Land no culture reached, such as an island raised for a country, takes the culture nearest to it, over sea too */
export function settleLand(): void {
  const { cells } = pack;
  const carried = new Uint16Array(cells.i.length); // the culture each cell passes on; water passes it without taking it
  const queue = Array.from(cells.i).filter(cell => cells.h[cell] >= 20 && cells.culture[cell]);
  for (const cell of queue) carried[cell] = cells.culture[cell];
  for (let next = 0; next < queue.length; next++) {
    const cell = queue[next];
    for (const neighbor of cells.c[cell]) {
      if (carried[neighbor]) continue;
      carried[neighbor] = carried[cell];
      if (cells.h[neighbor] >= 20) cells.culture[neighbor] = carried[cell];
      queue.push(neighbor);
    }
  }
}
