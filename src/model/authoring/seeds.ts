// What the author declared before generating: cultures and states placed by approximate position, applied as
// pipeline steps right after the generator makes the random ones, so everything downstream builds on them

import { Authoring } from "@/model/authoring/authoring";
import type { Seeds } from "@/model/authoring/world-spec";
import { Burgs } from "@/model/political/burgs-generator";
import { States } from "@/model/political/states-generator";
import { Cultures } from "@/model/society/cultures-generator";
import { Names } from "@/model/society/names-generator";
import type { PictureEmblem } from "@/types/emblems";
import { log } from "@/utils/logger";

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

class WorldSeedsModule {
  private plan: Seeds | null = null;
  private seededCultures: number[] = [];
  private seededStates: number[] = [];

  /** The next generated map takes these seeds; `finish` releases them */
  planNext(seeds: Seeds): void {
    this.plan = structuredClone(seeds);
    this.seededCultures = [];
    this.seededStates = [];
  }

  get planned(): Seeds | null {
    return this.plan;
  }

  /** After `cultures`: seed k renames culture k and moves its center; it grows from there in `culturesExpand` */
  applyCultures(): void {
    if (!this.plan?.cultures.length) return;
    const { cells, cultures } = pack;

    for (const [index, seed] of this.plan.cultures.entries()) {
      const culture = cultures[index + 1];
      if (!culture || culture.removed || culture.lock) {
        log.warn(`Culture seed ${seed.name}: no culture`);
        continue;
      }
      const taken = new Set(
        cultures.map(c => c.center).filter(center => center !== undefined && center !== culture.center)
      );
      const center = nearestCell(seed, cell => cells.s[cell] > 0 && !taken.has(cell));
      if (center === undefined) {
        log.warn(`Culture seed ${seed.name}: no populated land`);
        continue;
      }

      if (culture.center !== undefined && cells.culture[culture.center] === culture.i)
        cells.culture[culture.center] = 0;
      culture.center = center;
      cells.culture[center] = culture.i;
      Cultures.rename(culture.i, seed.name);
      if (seed.color) Cultures.recolor(culture.i, seed.color);
      if (seed.base !== undefined && seed.base < Names.nameBases.length) Cultures.setBase(culture.i, seed.base);
      this.seededCultures[index] = culture.i;
    }
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
      const culture = seed.culture === undefined ? undefined : this.seededCultures[seed.culture];
      burg.culture = culture ?? cells.culture[cell];
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

  /** Last step: what was seeded is the author's, and the plan is spent */
  finish(): void {
    if (!this.plan) return;
    for (const id of this.seededCultures) if (id !== undefined) Authoring.markAuthored("cultures", id);
    for (const id of this.seededStates) {
      if (id === undefined) continue;
      Authoring.markAuthored("states", id);
      Authoring.markAuthored("burgs", id); // state k's capital is burg k
    }
    this.plan = null;
  }
}

export const WorldSeeds = new WorldSeedsModule();
