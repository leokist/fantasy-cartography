// How the author asked for the world: per setting, a value they set or a request to roll it, and what they declared

import { z } from "zod";
import { DANGERS, RARITIES, SPECIES_KINDS } from "@/data/species";

export const FIELD_MODES = ["set", "random"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

const field = z.strictObject({ mode: z.enum(FIELD_MODES), value: z.unknown().optional() });

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// a place on a map not generated yet: percent of its width and height, snapped to suitable land on generation
const spot = { x: z.number().min(0).max(100), y: z.number().min(0).max(100) };

// how much of the map a continent or a country takes
export const CONTINENT_SIZES = ["small", "medium", "large", "huge"] as const;
export const COUNTRY_SIZES = ["small", "medium", "large"] as const;
// what a province is like; absent means the generator decides
export const RELIEFS = ["plains", "hills", "mountains", "plateau"] as const;
export const CLIMATES = ["hot", "temperate", "cold"] as const;
export const WATERS = ["dry", "normal", "wet", "lakes"] as const;

const continentSeed = z.strictObject({
  name: z.string().trim().min(1),
  ...spot,
  size: z.enum(CONTINENT_SIZES)
});

const citySeed = z.strictObject({ name: z.string().trim().min(1), ...spot });

const provinceSeed = z.strictObject({
  name: z.string().trim().min(1),
  state: z.number().int().min(0), // index of a state seed
  ...spot,
  biome: z.number().int().min(0).optional(), // a default biome id
  relief: z.enum(RELIEFS).optional(),
  climate: z.enum(CLIMATES).optional(),
  water: z.enum(WATERS).optional()
});

const cultureSeed = z.strictObject({
  name: z.string().trim().min(1),
  ...spot,
  color: color.optional(),
  base: z.number().int().min(0).optional() // a name base id, the culture's language
});

const stateSeed = z.strictObject({
  name: z.string().trim().min(1),
  ...spot,
  capital: z.string().trim().min(1).optional(),
  form: z.string().trim().min(1).optional(), // Kingdom, Republic…; the generator picks one when absent
  color: color.optional(),
  culture: z.number().int().min(0).optional(), // index of a culture seed
  emblem: z.string().min(1).optional(), // an icon id: a picture used as the whole emblem
  size: z.enum(COUNTRY_SIZES).optional(),
  continent: z.number().int().min(0).optional(), // index of a continent seed
  neighbors: z.array(z.number().int().min(0)).optional(), // indexes of state seeds it borders
  cities: z.array(citySeed).optional()
});

const speciesSeed = z.strictObject({
  name: z.string().trim().min(1),
  kind: z.enum(SPECIES_KINDS),
  biomes: z.array(z.number().int().min(0)), // default biome ids: the catalogue a new map starts with
  rarity: z.enum(RARITIES).optional(),
  danger: z.enum(DANGERS).optional(),
  description: z.string().optional()
});

export const seedsSchema = z.strictObject({
  continents: z.array(continentSeed),
  cultures: z.array(cultureSeed),
  states: z.array(stateSeed),
  provinces: z.array(provinceSeed),
  species: z.array(speciesSeed)
});

export const authoringSchema = z.strictObject({
  autoLock: z.boolean(), // an entity the author edits is locked, so regeneration keeps it
  fields: z.record(z.string(), field), // keyed by pin id, see `pinSchemas`
  seeds: seedsSchema
});

export type AuthoringData = z.infer<typeof authoringSchema>;
export type SpecField = z.infer<typeof field>;
export type Seeds = z.infer<typeof seedsSchema>;
export type CultureSeed = z.infer<typeof cultureSeed>;
export type StateSeed = z.infer<typeof stateSeed>;
export type SpeciesSeed = z.infer<typeof speciesSeed>;
export type ContinentSeed = z.infer<typeof continentSeed>;
export type ProvinceSeed = z.infer<typeof provinceSeed>;
export type CitySeed = z.infer<typeof citySeed>;

export const getDefaultSeeds = (): Seeds => ({ continents: [], cultures: [], states: [], provinces: [], species: [] });
export const getDefaultAuthoring = (): AuthoringData => ({ autoLock: true, fields: {}, seeds: getDefaultSeeds() });

/** The seeds worth planting: named ones only, with references between them kept pointing at the same seeds */
export function cleanSeeds(seeds: Seeds): Seeds {
  const keep = <T extends { name: string }>(list: T[]) => {
    const kept = list.map((item, index) => ({ item, index })).filter(({ item }) => item.name);
    const remap = new Map(kept.map(({ index }, newIndex) => [index, newIndex]));
    return { items: kept.map(({ item }) => structuredClone(item)), remap };
  };
  const continents = keep(seeds.continents);
  const cultures = keep(seeds.cultures);
  const states = keep(seeds.states);

  for (const state of states.items) {
    const culture = state.culture === undefined ? undefined : cultures.remap.get(state.culture);
    if (culture === undefined) delete state.culture;
    else state.culture = culture;
    const continent = state.continent === undefined ? undefined : continents.remap.get(state.continent);
    if (continent === undefined) delete state.continent;
    else state.continent = continent;
    if (state.neighbors) {
      state.neighbors = [...new Set(state.neighbors.flatMap(index => states.remap.get(index) ?? []))];
      if (!state.neighbors.length) delete state.neighbors;
    }
    if (state.cities) {
      state.cities = state.cities.filter(city => city.name);
      if (!state.cities.length) delete state.cities;
    }
  }
  const provinces = seeds.provinces
    .filter(province => province.name && states.remap.has(province.state))
    .map(province => ({ ...structuredClone(province), state: states.remap.get(province.state) as number }));
  const species = seeds.species.filter(item => item.name).map(item => structuredClone(item));
  return { continents: continents.items, cultures: cultures.items, states: states.items, provinces, species };
}
