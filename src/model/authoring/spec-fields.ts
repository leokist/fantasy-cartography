// The settings the world wizard asks for, grouped in steps; each is a pin, so the generator already reads it

import { CULTURE_SETS } from "@/data/culture-sets";
import { getPointsNumber, MAX_DENSITY, MIN_DENSITY } from "@/data/graph-density";
import { heightmapTemplates } from "@/data/heightmap-templates";
import { precreatedHeightmaps } from "@/data/precreated-heightmaps";
import type { AuthoringData, SpecField } from "@/model/authoring/world-spec";
import { AUTO_BURG_LIMIT, pinSchemas } from "@/model/options/options-schema";
import { Pins } from "@/model/options/pins";
import { t } from "@/utils/i18n";

export const WIZARD_STEPS = ["world", "terrain", "climate", "nature", "peoples", "politics", "economy"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type FieldInput =
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "text" }
  | { kind: "choice"; choices: () => [string, string][] };

export interface SpecFieldDef {
  key: string;
  step: WizardStep;
  label: string;
  hint: string;
  input: FieldInput;
  current: () => string | number;
}

const number = (min: number, max: number, step = 1): FieldInput => ({ kind: "number", min, max, step });
const text: FieldInput = { kind: "text" };
const choice = (choices: () => [string, string][]): FieldInput => ({ kind: "choice", choices });

const densities = (): [string, string][] => {
  const steps = Array.from({ length: MAX_DENSITY - MIN_DENSITY + 1 }, (_, i) => MIN_DENSITY + i);
  return steps.map(step => [String(step), `${getPointsNumber(step) / 1000}K`]);
};
const templates = (): [string, string][] => [
  ...Object.entries(heightmapTemplates).map(([id, { name }]): [string, string] => [id, name]),
  ...Object.entries(precreatedHeightmaps).map(([id, { name }]): [string, string] => [id, `${name} *`])
];
const cultureSets = (): [string, string][] => {
  const names: Record<string, string> = {
    world: t("All-world"),
    european: t("European"),
    oriental: t("Oriental"),
    english: t("English"),
    antique: t("Antique"),
    highFantasy: t("High Fantasy"),
    darkFantasy: t("Dark Fantasy"),
    random: t("Random")
  };
  return Object.entries(CULTURE_SETS).map(([id, { name }]) => [id, names[id] ?? name]);
};
const distanceUnits = (): [string, string][] => [
  ["km", t("Kilometer (km)")],
  ["mi", t("Mile (mi)")]
];

export const SPEC_FIELDS: SpecFieldDef[] = [
  {
    key: "mapName",
    step: "world",
    label: t("World name"),
    hint: t("Used for file names and the map title"),
    input: text,
    current: () => options.map.lore.name
  },
  {
    key: "year",
    step: "world",
    label: t("Current year"),
    hint: t("The year the map shows"),
    input: number(-100000, 100000),
    current: () => options.map.lore.calendar.year
  },
  {
    key: "era",
    step: "world",
    label: t("Era"),
    hint: t("The name of the current era"),
    input: text,
    current: () => options.map.lore.calendar.era
  },
  {
    key: "mapWidth",
    step: "world",
    label: t("Map width, px"),
    hint: t("Canvas size of the map"),
    input: number(240, 10000),
    current: () => options.generation.graph.width
  },
  {
    key: "mapHeight",
    step: "world",
    label: t("Map height, px"),
    hint: t("Canvas size of the map"),
    input: number(240, 10000),
    current: () => options.generation.graph.height
  },
  {
    key: "points",
    step: "world",
    label: t("Level of detail, cells"),
    hint: t("More cells give finer coasts and borders, but a slower map. 10K is recommended"),
    input: choice(densities),
    current: () => options.generation.graph.density
  },
  {
    key: "distanceScale",
    step: "world",
    label: t("Distance per pixel"),
    hint: t("How much one map pixel stands for, in the distance unit"),
    input: number(0.01, 1000, 0.01),
    current: () => options.map.units.distance.scale
  },
  {
    key: "distanceUnit",
    step: "world",
    label: t("Distance unit"),
    hint: t("Unit for distances and areas"),
    input: choice(distanceUnits),
    current: () => options.map.units.distance.unit
  },
  {
    key: "mapSize",
    step: "world",
    label: t("Share of the planet, %"),
    hint: t("How much of the globe the map covers"),
    input: number(1, 100),
    current: () => options.map.geography.mapSize
  },
  {
    key: "latitude",
    step: "world",
    label: t("Latitude shift, %"),
    hint: t("0 puts the map at the north pole, 100 at the south pole"),
    input: number(0, 100),
    current: () => options.map.geography.latitude
  },
  {
    key: "longitude",
    step: "world",
    label: t("Longitude shift, %"),
    hint: t("Where the map sits from west to east"),
    input: number(0, 100),
    current: () => options.map.geography.longitude
  },
  {
    key: "template",
    step: "terrain",
    label: t("Terrain shape"),
    hint: t("A template draws a new land each time; items marked * are fixed real-world-like maps"),
    input: choice(templates),
    current: () => options.generation.template
  },
  {
    key: "heightExponent",
    step: "terrain",
    label: t("Mountain steepness"),
    hint: t("Higher values make peaks taller against the lowlands"),
    input: number(1.5, 2.2, 0.01),
    current: () => options.map.units.height.exponent
  },
  {
    key: "lakeElevationLimit",
    step: "terrain",
    label: t("Lake elevation limit"),
    hint: t("How deep a depression must be to hold a lake"),
    input: number(0, 80),
    current: () => options.generation.lakeElevationLimit
  },
  {
    key: "resolveDepressionsSteps",
    step: "terrain",
    label: t("Depression filling steps"),
    hint: t("More steps drain more inland basins toward the sea"),
    input: number(0, 500),
    current: () => options.generation.resolveDepressionsSteps
  },
  {
    key: "temperatureEquator",
    step: "climate",
    label: t("Temperature at the equator, °C"),
    hint: t("Average yearly temperature"),
    input: number(-50, 50),
    current: () => options.map.climate.temperature.equator
  },
  {
    key: "temperatureNorthPole",
    step: "climate",
    label: t("Temperature at the North Pole, °C"),
    hint: t("Average yearly temperature"),
    input: number(-50, 50),
    current: () => options.map.climate.temperature.northPole
  },
  {
    key: "temperatureSouthPole",
    step: "climate",
    label: t("Temperature at the South Pole, °C"),
    hint: t("Average yearly temperature"),
    input: number(-50, 50),
    current: () => options.map.climate.temperature.southPole
  },
  {
    key: "prec",
    step: "climate",
    label: t("Precipitation, %"),
    hint: t("More rain gives more rivers, lakes and forests"),
    input: number(0, 500),
    current: () => options.map.climate.precipitation
  },
  {
    key: "cultures",
    step: "peoples",
    label: t("Number of cultures"),
    hint: t("Capped by the size of the culture set"),
    input: number(1, 100),
    current: () => options.generation.cultures.limit
  },
  {
    key: "culturesSet",
    step: "peoples",
    label: t("Culture set"),
    hint: t("The languages and naming styles cultures are drawn from"),
    input: choice(cultureSets),
    current: () => options.generation.cultures.set
  },
  {
    key: "religionsNumber",
    step: "peoples",
    label: t("Number of organized religions"),
    hint: t("Every culture also keeps its folk religion"),
    input: number(0, 50),
    current: () => options.generation.religions.limit
  },
  {
    key: "sizeVariety",
    step: "peoples",
    label: t("Size variety"),
    hint: t("How unequal cultures and states are in size"),
    input: number(0, 10, 0.1),
    current: () => options.generation.states.sizeVariety
  },
  {
    key: "growthRate",
    step: "peoples",
    label: t("Growth rate"),
    hint: t("How far cultures and states spread over the land"),
    input: number(0.1, 2, 0.1),
    current: () => options.generation.states.growthRate
  },
  {
    key: "statesNumber",
    step: "politics",
    label: t("Number of states"),
    hint: t("Each state gets a capital"),
    input: number(0, 100),
    current: () => options.generation.states.limit
  },
  {
    key: "provincesRatio",
    step: "politics",
    label: t("Provinces, % of burgs"),
    hint: t("Share of burgs that become province centers"),
    input: number(0, 100),
    current: () => options.generation.provinces.ratio
  },
  {
    key: "manors",
    step: "politics",
    label: t("Number of burgs"),
    hint: t("Settlements besides the capitals; 1000 means as many as the land supports"),
    input: number(0, AUTO_BURG_LIMIT),
    current: () => options.generation.burgs.limit
  },
  {
    key: "populationRate",
    step: "economy",
    label: t("People per population point"),
    hint: t("Scales every population figure on the map"),
    input: number(10, 10000, 10),
    current: () => options.map.units.population.scale
  },
  {
    key: "urbanization",
    step: "economy",
    label: t("Urbanization rate"),
    hint: t("How much of the population lives in burgs"),
    input: number(0.01, 5, 0.01),
    current: () => options.map.units.population.urbanization.rate
  },
  {
    key: "urbanDensity",
    step: "economy",
    label: t("Urban density"),
    hint: t("People per building in burg previews"),
    input: number(1, 200),
    current: () => options.map.units.population.urbanization.density
  }
];

/** A field as the author last chose it: their saved spec, else what this browser pins, else a roll */
export function initialField(def: SpecFieldDef, authoring: AuthoringData): SpecField {
  const saved = authoring.fields[def.key];
  if (saved) return { mode: saved.mode, value: saved.value ?? def.current() };
  return Pins.has(def.key)
    ? { mode: "set", value: Pins.valueOr(def.key, def.current()) }
    : { mode: "random", value: def.current() };
}

/** The value a field input holds, typed as its pin expects; undefined when it is not valid */
export function parseFieldValue(def: SpecFieldDef, raw: string): unknown {
  const value = def.input.kind === "number" || def.key === "points" ? Number(raw) : raw;
  const result = pinSchemas[def.key]?.safeParse(value);
  return result?.success ? result.data : undefined;
}

/** The pins that make the generator honor every field set by hand */
export function pinsOf(fields: Record<string, SpecField>): Record<string, unknown> {
  const pins: Record<string, unknown> = {};
  for (const [key, { mode, value }] of Object.entries(fields)) if (mode === "set") pins[key] = value;
  return pins;
}
