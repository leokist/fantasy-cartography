// Fauna and flora: a catalogue of species, each living in some biomes and linked to the goods it yields

import {
  DANGERS,
  type Danger,
  getDefaultSpecies,
  RARITIES,
  type Rarity,
  SPECIES_KINDS,
  type SpeciesKind,
  USES,
  type Use
} from "@/data/species";
import type { EntityOrigin } from "@/model/authoring/authoring";
import { requireName, requireOneOf } from "@/utils/validation-utils";

export interface Species {
  i: number;
  name: string;
  kind: SpeciesKind;
  icon: string; // an emoji or an icon id
  biomes: number[];
  rarity: Rarity;
  danger?: Danger; // fauna
  domesticable?: boolean; // fauna
  uses?: Use[]; // flora
  goods: number[];
  description?: string;
  lock?: boolean;
  origin?: EntityOrigin;
}

class SpeciesModule {
  /** The default catalogue for the biomes on the map; locked species are kept as they are */
  generate(): void {
    const kept = (pack.species ?? []).filter(species => species.lock);
    const present = new Set(Array.from(pack.cells.biome));
    const catalogue: Species[] = kept.map((species, i) => ({ ...species, i }));
    const names = new Set(kept.map(species => species.name));

    for (const entry of getDefaultSpecies()) {
      if (names.has(entry.name)) continue;
      const biomes = entry.biomes.filter(biome => present.has(biome) && pack.biomes[biome]?.name);
      if (!biomes.length) continue;
      catalogue.push({ ...entry, i: catalogue.length, biomes, goods: this.goodsByName(entry.goods ?? []) });
    }
    pack.species = catalogue;
  }

  /** Living species of a biome */
  ofBiome(biomeId: number): Species[] {
    return (pack.species ?? []).filter(species => species.biomes.includes(biomeId));
  }

  /** Add a species; it lives nowhere until given biomes. Returns its id */
  add(kind: SpeciesKind, name: string): number {
    if (!pack.species) pack.species = [];
    const list = pack.species;
    const i = list.length ? Math.max(...list.map(species => species.i)) + 1 : 0;
    const base = {
      i,
      name: requireName(name),
      kind: requireOneOf(kind, SPECIES_KINDS, "The kind"),
      biomes: [],
      goods: []
    };
    const extra = kind === "fauna" ? { danger: "harmless" as Danger, domesticable: false } : { uses: [] as Use[] };
    list.push({ ...base, icon: kind === "fauna" ? "🐾" : "🌱", rarity: "common", ...extra });
    return i;
  }

  rename(speciesId: number, name: string): void {
    this.living(speciesId).name = requireName(name);
  }

  setKind(speciesId: number, kind: string): void {
    const species = this.living(speciesId);
    species.kind = requireOneOf(kind, SPECIES_KINDS, "The kind");
    if (species.kind === "fauna") {
      delete species.uses;
      species.danger ??= "harmless";
      species.domesticable ??= false;
    } else {
      delete species.danger;
      delete species.domesticable;
      species.uses ??= [];
    }
  }

  setIcon(speciesId: number, icon: string): void {
    this.living(speciesId).icon = requireName(icon);
  }

  setBiomes(speciesId: number, biomeIds: number[]): void {
    const unknown = biomeIds.find(id => !pack.biomes[id] || pack.biomes[id].removed);
    if (unknown !== undefined) throw new Error(`Biome ${unknown} does not exist`);
    this.living(speciesId).biomes = [...new Set(biomeIds)].sort((a, b) => a - b);
  }

  setRarity(speciesId: number, rarity: string): void {
    this.living(speciesId).rarity = requireOneOf(rarity, RARITIES, "The rarity");
  }

  setDanger(speciesId: number, danger: string): void {
    this.fauna(speciesId).danger = requireOneOf(danger, DANGERS, "The danger");
  }

  setDomesticable(speciesId: number, domesticable: boolean): void {
    this.fauna(speciesId).domesticable = Boolean(domesticable);
  }

  setUses(speciesId: number, uses: string[]): void {
    const species = this.living(speciesId);
    if (species.kind !== "flora") throw new Error("Only flora has uses");
    species.uses = [...new Set(uses.map(use => requireOneOf(use, USES, "A use")))];
  }

  setGoods(speciesId: number, goodIds: number[]): void {
    const unknown = goodIds.find(id => !pack.goods?.some(good => good.i === id));
    if (unknown !== undefined) throw new Error(`Good ${unknown} does not exist`);
    this.living(speciesId).goods = [...new Set(goodIds)];
  }

  setDescription(speciesId: number, description: string): void {
    const species = this.living(speciesId);
    const text = typeof description === "string" ? description.trim() : "";
    if (text) species.description = text;
    else delete species.description;
  }

  setLocked(speciesId: number, locked: boolean): void {
    const species = this.living(speciesId);
    if (locked) species.lock = true;
    else delete species.lock;
  }

  remove(speciesId: number): void {
    this.living(speciesId);
    pack.species = pack.species.filter(species => species.i !== speciesId);
  }

  private living(speciesId: number): Species {
    const species = pack.species?.find(item => item.i === speciesId);
    if (!species) throw new Error(`Species ${speciesId} does not exist`);
    return species;
  }

  private fauna(speciesId: number): Species {
    const species = this.living(speciesId);
    if (species.kind !== "fauna") throw new Error("Only fauna has this trait");
    return species;
  }

  private goodsByName(names: string[]): number[] {
    return names.flatMap(name => pack.goods?.find(good => good.name === name)?.i ?? []);
  }
}

export const SpeciesCatalogue = new SpeciesModule();
