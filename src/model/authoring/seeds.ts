// What the author declared before generating: continents, countries (each its own people), provinces, cities and species
// placed by approximate position, applied as pipeline steps right after the generator makes its own, so everything
// downstream builds on them

import { Authoring } from "@/model/authoring/authoring";
import {
  foundCities,
  foundProvinces,
  joinBorders,
  makePeople,
  nearestCell,
  settleLand
} from "@/model/authoring/country";
import {
  type Noise,
  provinceWeight,
  shapeBiomes,
  shapeClimate,
  shapeLand,
  shapeWater,
  worldNoise
} from "@/model/authoring/land";
import type { Seeds, SpeciesSeed } from "@/model/authoring/world-spec";
import { SpeciesCatalogue } from "@/model/nature/species-generator";
import { Burgs } from "@/model/political/burgs-generator";
import { States } from "@/model/political/states-generator";
import { Cultures } from "@/model/society/cultures-generator";
import { Names } from "@/model/society/names-generator";
import type { PictureEmblem } from "@/types/emblems";
import { log } from "@/utils/logger";

/** A declared species joins the catalogue, or takes over the default one of the same name and kind. Returns its id */
export function plantSpecies(seed: SpeciesSeed): number {
  const same = pack.species.find(
    item => item.kind === seed.kind && item.name.toLowerCase() === seed.name.toLowerCase()
  );
  const id = same ? same.i : SpeciesCatalogue.add(seed.kind, seed.name);
  SpeciesCatalogue.rename(id, seed.name);
  SpeciesCatalogue.setBiomes(
    id,
    seed.biomes.filter(biome => pack.biomes[biome] && !pack.biomes[biome].removed)
  );
  if (seed.rarity) SpeciesCatalogue.setRarity(id, seed.rarity);
  if (seed.danger && seed.kind === "fauna") SpeciesCatalogue.setDanger(id, seed.danger);
  if (seed.description) SpeciesCatalogue.setDescription(id, seed.description);
  return id;
}

// how far a country reaches from its capital before it stops taking land
export const EXPANSIONISM = { small: 0.7, medium: 1.4, large: 2.6 };

/** Whether the land is built from the seeds rather than a template: continents or countries were declared */
export const buildsLand = (seeds: Seeds): boolean => seeds.continents.length > 0 || seeds.states.length > 0;

class WorldSeedsModule {
  private plan: Seeds | null = null;
  private noise: Noise | null = null;
  private seededCultures: number[] = [];
  private seededStates: number[] = [];
  private seededSpecies: number[] = [];
  private seededBurgs: number[] = [];
  private seededProvinces: number[] = [];

  /** The next generated map takes these seeds; `finish` releases them */
  planNext(seeds: Seeds): void {
    this.plan = structuredClone(seeds);
    this.noise = null;
    this.seededCultures = [];
    this.seededStates = [];
    this.seededSpecies = [];
    this.seededBurgs = [];
    this.seededProvinces = [];
  }

  get planned(): Seeds | null {
    return this.plan;
  }

  private worldNoise(): Noise {
    this.noise ??= worldNoise(String(options.map.seed));
    return this.noise;
  }

  /** After `heightmap`: when continents or countries were declared, the land is theirs, not the template's */
  applyLand(): void {
    if (!this.plan || !buildsLand(this.plan)) return;
    grid.cells.h = shapeLand(this.plan, grid.points, this.worldNoise(), Math.random);
  }

  /** After `culturesExpand`: land of the author's that no culture reached, such as a lone island, is settled */
  applySettlement(): void {
    if (this.plan && buildsLand(this.plan)) settleLand();
  }

  /** After `temperatures`: each province's climate */
  applyClimate(): void {
    if (!this.plan?.provinces.length) return;
    shapeClimate(this.plan, grid.points, grid.cells.h, grid.cells.temp, this.worldNoise());
  }

  /** After `precipitation`: each province's water */
  applyWater(): void {
    if (!this.plan?.provinces.length) return;
    shapeWater(this.plan, grid.points, grid.cells.prec, this.worldNoise());
  }

  /** After `biomes`: the nature each province asks for */
  applyBiomes(): void {
    if (!this.plan?.provinces.length) return;
    shapeBiomes(this.plan, this.worldNoise());
  }

  /** After `cultures`: culture k starts at country k's spot and grows from there in `culturesExpand` */
  applyCultures(): void {
    if (!this.plan?.states.length) return;
    const { cells, cultures } = pack;

    for (const [index, seed] of this.plan.states.entries()) {
      const culture = cultures[index + 1];
      if (!culture || culture.removed || culture.lock) {
        log.warn(`Country ${seed.name}: no culture for its people`);
        continue;
      }
      const taken = new Set(
        cultures.map(c => c.center).filter(center => center !== undefined && center !== culture.center)
      );
      const center = nearestCell(seed, cell => cells.s[cell] > 0 && !taken.has(cell));
      if (center === undefined) continue;

      if (culture.center !== undefined && cells.culture[culture.center] === culture.i)
        cells.culture[culture.center] = 0;
      culture.center = center;
      cells.culture[center] = culture.i;
      // the language now, so burgs are named in it
      if (seed.language !== undefined && Names.nameBases[seed.language]) Cultures.setBase(culture.i, seed.language);
      this.seededCultures[index] = culture.i;
    }
  }

  /** After `species`: a declared species joins the catalogue, or takes over the default one of the same name */
  applySpecies(): void {
    if (!this.plan?.species.length) return;
    for (const seed of this.plan.species) this.seededSpecies.push(plantSpecies(seed));
  }

  /** After `burgs`: seed k moves capital k, so state k is founded where the author asked */
  applyCapitals(): void {
    if (!this.plan?.states.length) return;
    const { cells, burgs } = pack;

    for (const [index, seed] of this.plan.states.entries()) {
      const burg = burgs[index + 1];
      if (!burg?.capital) {
        log.warn(`State seed ${seed.name}: no capital to place`);
        continue;
      }
      const free = (cell: number) =>
        cells.s[cell] > 0 && cells.culture[cell] > 0 && (!cells.burg[cell] || cell === burg.cell);
      const cell = nearestCell(seed, free);
      if (cell === undefined) {
        log.warn(`State seed ${seed.name}: no populated land`);
        continue;
      }

      cells.burg[burg.cell] = 0;
      cells.burg[cell] = burg.i;
      burg.cell = cell;
      [burg.x, burg.y] = cells.p[cell];
      burg.feature = cells.f[cell];
      burg.culture = this.seededCultures[index] ?? cells.culture[cell];
      if (seed.capital) burg.name = seed.capital;
      this.seededStates[index] = burg.i;
    }
    Burgs.assignPorts();
  }

  /** After `stateForms`, which would otherwise rename them: the declared names, forms, colors and emblems */
  applyStates(): void {
    if (!this.plan?.states.length) return;

    for (const [index, seed] of this.plan.states.entries()) {
      const id = this.seededStates[index];
      const state = id === undefined ? undefined : pack.states[id];
      if (!state || state.removed || state.capital !== id) continue;
      States.rename(id, seed.name);
      if (seed.form) States.setForm(id, seed.form);
      if (seed.color) States.recolor(id, seed.color);
      if (seed.emblem) state.coa = { icon: seed.emblem } as PictureEmblem;
    }
  }

  /** After `states`: each country grows as large as declared, then touches the countries it should border */
  applySizes(): void {
    if (!this.plan?.states.length) return;
    const { states } = pack;
    for (const [index, seed] of this.plan.states.entries()) {
      const state = states[this.seededStates[index]];
      if (state && !state.removed) state.expansionism = EXPANSIONISM[seed.size ?? "medium"];
    }
    States.expandStates();
    States.normalize();
    this.claimProvinces();
    for (const [index, seed] of this.plan.states.entries())
      for (const other of seed.neighbors ?? []) joinBorders(this.seededStates[index], this.seededStates[other]);
    for (const [index, seed] of this.plan.states.entries()) {
      const state = this.seededStates[index];
      const culture = this.seededCultures[index];
      if (state !== undefined && culture !== undefined) makePeople(state, culture, seed);
    }
    States.getPoles();
    States.findNeighbors();
  }

  // the land of a declared province belongs to its country even where growth stopped short, as on high mountains
  private claimProvinces(): void {
    if (!this.plan?.provinces.length) return;
    const { cells } = pack;
    const noise = this.worldNoise();
    for (const province of this.plan.provinces) {
      const stateId = this.seededStates[province.state];
      if (!stateId) continue;
      for (const cell of cells.i) {
        if (cells.h[cell] < 20 || cells.state[cell] || cells.burg[cell]) continue;
        if (provinceWeight(province, this.plan, noise, cells.p[cell]) > 0.45) cells.state[cell] = stateId;
      }
    }
  }

  /** After `routes`: the declared cities of each country, as burgs where the author put them */
  applyCities(): void {
    if (!this.plan?.states.length) return;
    for (const [index, seed] of this.plan.states.entries())
      this.seededBurgs.push(...foundCities(seed, this.seededStates[index]));
  }

  /** After `provinces`: a country with declared provinces is divided into them, each around its spot */
  applyProvinces(): void {
    if (!this.plan?.provinces.length) return;
    for (const [index] of this.plan.states.entries())
      this.seededProvinces.push(...foundProvinces(this.plan, index, this.seededStates[index], this.worldNoise()));
  }

  /** Last step: what was seeded is the author's, and the plan is spent */
  finish(): void {
    if (!this.plan) return;
    for (const id of this.seededBurgs) Authoring.markAuthored("burgs", id);
    for (const id of this.seededProvinces) Authoring.markAuthored("provinces", id);
    for (const id of this.seededCultures) if (id !== undefined) Authoring.markAuthored("cultures", id);
    for (const id of this.seededSpecies) Authoring.markAuthored("species", id);
    for (const id of this.seededStates) {
      if (id === undefined) continue;
      Authoring.markAuthored("states", id);
      Authoring.markAuthored("burgs", id); // state k's capital is burg k
    }
    this.plan = null;
    this.noise = null;
  }
}

export const WorldSeeds = new WorldSeedsModule();
