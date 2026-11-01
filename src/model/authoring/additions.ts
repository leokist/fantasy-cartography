// Add to a map already generated, without regenerating it: what is locked stays exactly as it is,
// and only unlocked, generated entities make room for the newcomer

import { type AuthorableCollection, Authoring } from "@/model/authoring/authoring";
import { nearestCell } from "@/model/authoring/seeds";
import type { CultureSeed, StateSeed } from "@/model/authoring/world-spec";
import { Burgs } from "@/model/political/burgs-generator";
import { Provinces } from "@/model/political/provinces-generator";
import { States } from "@/model/political/states-generator";
import { Cultures } from "@/model/society/cultures-generator";
import { Names } from "@/model/society/names-generator";
import type { PictureEmblem } from "@/types/emblems";

class AdditionsModule {
  /** Found a declared state at its spot and let it take land from unlocked states. Returns its id */
  addState(seed: StateSeed): number {
    const { cells, burgs } = pack;
    const free = (cell: number) => cells.s[cell] > 0 && cells.culture[cell] > 0 && !burgs[cells.burg[cell]]?.capital;
    const cell = nearestCell(seed, free);
    if (cell === undefined) throw new Error(`No populated land for ${seed.name}`);

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

    Authoring.markAuthored("states", id);
    Authoring.markAuthored("burgs", capital);
    this.grow("states", id, () => this.recalculateStates());
    return id;
  }

  /** Found a declared culture at its spot and let it spread over land of unlocked cultures. Returns its id */
  addCulture(seed: CultureSeed): number {
    const { cells, cultures } = pack;
    const centers = new Set(cultures.map(culture => culture.center));
    const cell = nearestCell(seed, cell => cells.s[cell] > 0 && !centers.has(cell));
    if (cell === undefined) throw new Error(`No populated land for ${seed.name}`);

    const [x, y] = cells.p[cell];
    const id = Authoring.untracked(() => {
      const added = Cultures.add(x, y);
      Cultures.rename(added, seed.name);
      if (seed.color) Cultures.recolor(added, seed.color);
      if (seed.base !== undefined && seed.base < Names.nameBases.length) Cultures.setBase(added, seed.base);
      return added;
    });

    Authoring.markAuthored("cultures", id);
    this.grow("cultures", id, () => Cultures.recalculate());
    return id;
  }

  // like States.recalculate, but rebuilding provinces keeps the locked ones and those of locked states
  private recalculateStates(): void {
    States.expandStates();
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
