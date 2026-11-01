// How the author asked for the world: per setting, a value they set or a request to roll it, and what they declared

import { z } from "zod";
import { DANGERS, RARITIES, SPECIES_KINDS } from "@/data/species";

export const FIELD_MODES = ["set", "random"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

const field = z.strictObject({ mode: z.enum(FIELD_MODES), value: z.unknown().optional() });

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// a place on a map not generated yet: percent of its width and height, snapped to suitable land on generation
const spot = { x: z.number().min(0).max(100), y: z.number().min(0).max(100) };

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
  emblem: z.string().min(1).optional() // an icon id: a picture used as the whole emblem
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
  cultures: z.array(cultureSeed),
  states: z.array(stateSeed),
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

export const getDefaultSeeds = (): Seeds => ({ cultures: [], states: [], species: [] });
export const getDefaultAuthoring = (): AuthoringData => ({ autoLock: true, fields: {}, seeds: getDefaultSeeds() });

/** The seeds worth planting: named ones only, with culture references kept pointing at the same cultures */
export function cleanSeeds(seeds: Seeds): Seeds {
  const kept = seeds.cultures.map((culture, index) => ({ culture, index })).filter(({ culture }) => culture.name);
  const remap = new Map(kept.map(({ index }, newIndex) => [index, newIndex]));
  const cultures = kept.map(({ culture }) => structuredClone(culture));
  const states = seeds.states
    .filter(state => state.name)
    .map(state => {
      const copy = structuredClone(state);
      const culture = copy.culture === undefined ? undefined : remap.get(copy.culture);
      if (culture === undefined) delete copy.culture;
      else copy.culture = culture;
      return copy;
    });
  const species = seeds.species.filter(item => item.name).map(item => structuredClone(item));
  return { cultures, states, species };
}
