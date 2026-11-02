// How the author asked for the world: per setting, a value they set or a request to roll it, and what they declared.
// Each declared country is its own people: its culture takes its name, color and language

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
// how countries are sized: by a relative size that sets how far each spreads, or by a share of the map's area
export const SIZINGS = ["size", "area"] as const;
export const COUNTRY_AREA = { min: 0.5, max: 60, default: 4 }; // percent of the map
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

const stateSeed = z.strictObject({
  name: z.string().trim().min(1),
  ...spot,
  capital: z.string().trim().min(1).optional(),
  form: z.string().trim().min(1).optional(), // Kingdom, Republic…; the generator picks one when absent
  color: color.optional(),
  language: z.number().int().min(0).optional(), // a name base id: the country is its own people, named in it
  emblem: z.string().min(1).optional(), // an icon id: a picture used as the whole emblem
  size: z.enum(COUNTRY_SIZES).optional(),
  area: z.number().min(COUNTRY_AREA.min).max(COUNTRY_AREA.max).optional(), // percent of the map, with sizing "area"
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
  sizing: z.enum(SIZINGS).optional(), // "size" when absent
  continents: z.array(continentSeed),
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
export type StateSeed = z.infer<typeof stateSeed>;
export type SpeciesSeed = z.infer<typeof speciesSeed>;
export type ContinentSeed = z.infer<typeof continentSeed>;
export type ProvinceSeed = z.infer<typeof provinceSeed>;
export type CitySeed = z.infer<typeof citySeed>;

export const getDefaultSeeds = (): Seeds => ({ continents: [], states: [], provinces: [], species: [] });
export const getDefaultAuthoring = (): AuthoringData => ({ autoLock: true, fields: {}, seeds: getDefaultSeeds() });

/** The seeds worth planting: named ones only, with references between them kept pointing at the same seeds */
export function cleanSeeds(seeds: Seeds): Seeds {
  const keep = <T extends { name: string }>(list: T[]) => {
    const kept = list.map((item, index) => ({ item, index })).filter(({ item }) => item.name);
    const remap = new Map(kept.map(({ index }, newIndex) => [index, newIndex]));
    return { items: kept.map(({ item }) => structuredClone(item)), remap };
  };
  const continents = keep(seeds.continents);
  const states = keep(seeds.states);

  for (const state of states.items) {
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
  // a country is sized one way only
  const byArea = seeds.sizing === "area";
  for (const state of states.items) {
    if (byArea) {
      state.area ??= COUNTRY_AREA.default;
      delete state.size;
    } else delete state.area;
  }
  const sizing = byArea ? { sizing: "area" as const } : {};
  return { ...sizing, continents: continents.items, states: states.items, provinces, species };
}
