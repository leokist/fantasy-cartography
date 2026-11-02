// Add to a map already generated, without regenerating it: what is locked stays exactly as it is,
// and only unlocked, generated entities make room for the newcomer

import { type AuthorableCollection, Authoring } from "@/model/authoring/authoring";
import {
  foundCities,
  foundProvinces,
  growToArea,
  joinBorders,
  makePeople,
  nearestCell,
  settleLand
} from "@/model/authoring/country";
import { countryArea, countryRadius, shapeBiomes, shapeLand, toPoint, worldNoise } from "@/model/authoring/land";
import { EXPANSIONISM, plantSpecies } from "@/model/authoring/seeds";
import type { Seeds, SpeciesSeed, StateSeed } from "@/model/authoring/world-spec";
import { MapRestoration } from "@/model/map-restoration";
import { Burgs } from "@/model/political/burgs-generator";
import { Provinces } from "@/model/political/provinces-generator";
import { States } from "@/model/political/states-generator";
import { Cultures } from "@/model/society/cultures-generator";
import type { PictureEmblem } from "@/types/emblems";

class AdditionsModule {
  /**
   * Put the country declared as state seed `index` on the map on screen: where its spot is sea or too small,
   * land is raised for it first; then it is founded, grows to its size, joins the countries it should border and
   * gets its people, cities and provinces. Locked countries stay as they are. Returns its id
   */
  addCountry(seeds: Seeds, index: number): number {
    const seed = seeds.states[index];
    const own = { ...seeds, states: [seed], provinces: seeds.provinces.filter(p => p.state === index) };
    const ownSeeds = { ...own, continents: [], provinces: own.provinces.map(p => ({ ...p, state: 0 })) };
    const noise = worldNoise(String(options.map.seed));
    this.raiseLand(ownSeeds, noise);

    const id = this.addState(seed);
    const named = (name: string) => pack.states.find(state => state.i && !state.removed && state.name === name)?.i;
    Authoring.untracked(() => {
      for (const other of seed.neighbors ?? []) joinBorders(id, named(seeds.states[other]?.name ?? ""));
      this.addPeople(id, seed);
      for (const burg of foundCities(seed, id)) Authoring.markAuthored("burgs", burg);
      for (const province of foundProvinces(ownSeeds, 0, id, noise)) Authoring.markAuthored("provinces", province);
      shapeBiomes(ownSeeds, noise);
      States.getPoles();
      States.findNeighbors();
      States.collectStatistics();
    });
    return id;
  }

  // the country's land where the map has sea, keeping all the land already there; the map is rebuilt around it
  private raiseLand(seeds: Seeds, noise: ReturnType<typeof worldNoise>): void {
    const [cx, cy] = toPoint(seeds.states[0]);
    const reach = countryRadius(seeds.states[0]) * 1.5;
    const shaped = shapeLand(seeds, grid.points, noise, Math.random);
    const heights = grid.cells.h.slice();
    let changed = false;
    for (const [cell, [x, y]] of grid.points.entries()) {
      if (Math.hypot(x - cx, y - cy) > reach || shaped[cell] <= heights[cell]) continue;
      if (heights[cell] < 20 || seeds.provinces.some(province => province.relief)) {
        heights[cell] = shaped[cell];
        changed = true;
      }
    }
    if (!changed) return;
    MapRestoration.applyHeights(heights, { erosion: false });
    settleLand();
  }

  /** Found a declared state at its spot and let it take land from unlocked states. Returns its id */
  addState(seed: StateSeed): number {
    const { cells, burgs } = pack;
    const free = (cell: number) => cells.h[cell] >= 20 && !burgs[cells.burg[cell]]?.capital;
    const locked = (cell: number) => pack.states[cells.state[cell]]?.lock;
    // settled land near the spot first; land raised just now for the country has no people yet
    const [px, py] = toPoint(seed);
    const settled = nearestCell(seed, c => free(c) && !locked(c) && cells.s[c] > 0 && cells.culture[c] > 0);
    const near = (c: number | undefined) =>
      c !== undefined && Math.hypot(cells.p[c][0] - px, cells.p[c][1] - py) < countryRadius(seed);
    const cell = near(settled) ? settled : (nearestCell(seed, c => free(c) && !locked(c)) ?? settled);
    if (cell === undefined) throw new Error(`No free land for ${seed.name}`);

    const [x, y] = cells.p[cell];
    const id = Authoring.untracked(() => States.add(x, y));
    const capital = pack.states[id].capital;
    Authoring.untracked(() => {
      States.rename(id, seed.name);
      if (seed.form) States.setForm(id, seed.form);
      if (seed.color) States.recolor(id, seed.color);
      if (seed.capital) Burgs.rename(capital, seed.capital);
    });
    if (seed.emblem) pack.states[id].coa = { icon: seed.emblem } as PictureEmblem;
    pack.states[id].expansionism = EXPANSIONISM[seed.size ?? "medium"];

    Authoring.markAuthored("states", id);
    Authoring.markAuthored("burgs", capital);
    const area = countryArea(seed);
    const recalculate =
      area === undefined
        ? () => this.recalculateStates()
        : () => {
            // only the newcomer grows, taking land from unlocked countries and no capital
            const canTake = (c: number) => !locked(c) && !burgs[cells.burg[c]]?.capital;
            growToArea(new Map([[id, area]]), canTake);
            this.refreshStates();
          };
    this.grow("states", id, recalculate);
    return id;
  }

  // a new culture for the country, centered on its capital or the nearest of its cells free of a culture center
  private addPeople(stateId: number, seed: StateSeed): void {
    const { cells, cultures, burgs, states } = pack;
    const centers = new Set(cultures.filter(c => c.i && !c.removed).map(culture => culture.center));
    const capital = burgs[states[stateId].capital].cell;
    const own = Array.from(cells.i).filter(cell => cells.state[cell] === stateId && cells.h[cell] >= 20);
    const center = [capital, ...own].find(cell => !centers.has(cell));
    if (center === undefined) return;
    const [x, y] = cells.p[center];
    const id = Cultures.add(x, y);
    makePeople(stateId, id, seed);
    Authoring.markAuthored("cultures", id);
  }

  /** Put a declared species in the catalogue of the map on screen. Returns its id */
  addSpecies(seed: SpeciesSeed): number {
    const id = Authoring.untracked(() => plantSpecies(seed));
    Authoring.markAuthored("species", id);
    return id;
  }

  // like States.recalculate, but rebuilding provinces keeps the locked ones and those of locked states
  private recalculateStates(): void {
    States.expandStates();
    this.refreshStates();
  }

  private refreshStates(): void {
    Provinces.generate(true);
    Provinces.getPoles();
    States.getPoles();
    States.findNeighbors();
    States.collectStatistics();
  }

  // recalculation leaves locked entities alone, so the newcomer is unlocked while it grows
  private grow(collection: AuthorableCollection, id: number, recalculate: () => void): void {
    const entity = Authoring.find(collection, id);
    if (!entity) return;
    entity.lock = false;
    try {
      Authoring.untracked(recalculate);
    } finally {
      entity.lock = true;
    }
  }
}

export const Additions = new AdditionsModule();
