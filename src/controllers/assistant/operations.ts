import { AddedLabels } from "@/model/annotations/added-labels";
import { Labels } from "@/model/annotations/labels-generator";
import { Goods } from "@/model/economy/goods-generator";
import { Markets } from "@/model/economy/markets-generator";
import { Routes } from "@/model/economy/routes-generator";
import { Biomes } from "@/model/physical/biomes-generator";
import { Features } from "@/model/physical/features-generator";
import { Rivers } from "@/model/physical/river-generator";
import { Burgs } from "@/model/political/burgs-generator";
import { Emblems } from "@/model/political/emblems-generator";
import { Provinces } from "@/model/political/provinces-generator";
import { States } from "@/model/political/states-generator";
import { Zones } from "@/model/political/zones-generator";
import { Journeys } from "@/model/story/journeys/journeys-generator";
import { Lore } from "@/model/story/lore";
import { Markers } from "@/model/story/markers-generator";
import { Notes } from "@/model/story/notes";
import { Styles } from "@/model/styles/styles";
import { StylePresets } from "./style-presets";

export const MODELS = {
  AddedLabels,
  Biomes,
  Burgs,
  Emblems,
  Features,
  Goods,
  Journeys,
  Labels,
  Lore,
  Markers,
  Markets,
  Notes,
  Provinces,
  Rivers,
  Routes,
  States,
  Styles,
  StylePresets,
  Zones
};

type Models = typeof MODELS;

// Model methods the Assistant may propose
export const METHODS = {
  Burgs: [
    "rename",
    "setPopulation",
    "setGroup",
    "setType",
    "setBuilding",
    "setPort",
    "setCapital",
    "move",
    "add",
    "remove",
    "setTreasury",
    "setLocked",
    "setLink"
  ],
  States: [
    "rename",
    "recolor",
    "setFullName",
    "setForm",
    "setLanguage",
    "setType",
    "setExpansionism",
    "recalculate",
    "merge",
    "add",
    "remove",
    "setTaxes",
    "setTreasury",
    "setLocked",
    "setCells",
    "setPopulation"
  ],
  Provinces: [
    "rename",
    "recolor",
    "setFullName",
    "setForm",
    "setCapital",
    "setState",
    "add",
    "declareIndependence",
    "remove",
    "merge",
    "setPopulation",
    "setLocked",
    "setCells"
  ],
  Biomes: ["rename", "recolor", "setHabitability", "add", "remove", "setCells", "restore"],
  Rivers: ["rename", "setType", "add", "remove", "setParent", "setWidth", "setLocked", "create"],
  Routes: ["rename", "setGroup", "add", "remove", "setLocked", "create", "split", "join"],
  Features: ["rename", "setSubtype", "setGroup", "setCoastline"],
  Zones: ["rename", "recolor", "setType", "setHidden", "setCells", "add", "remove", "setPopulation"],
  Markers: [
    "rename",
    "setIcon",
    "setType",
    "setHidden",
    "place",
    "remove",
    "move",
    "setPinned",
    "setLocked",
    "setAppearance"
  ],
  AddedLabels: ["rename", "place", "remove"],
  Labels: ["setGroup", "setLayout", "reset"],
  Emblems: ["set", "regenerateOne", "place"],
  Journeys: [
    "add",
    "remove",
    "rename",
    "setType",
    "recolor",
    "setHidden",
    "setLocked",
    "addSegment",
    "removeSegment",
    "moveSegment",
    "setSegment",
    "resetSegment"
  ],
  Goods: ["rename", "setIcon", "recolor", "setPrice", "setUnit", "setTags", "setProduction"],
  Markets: ["rename", "recolor"],
  Lore: ["rename"],
  Notes: ["write"],
  Styles: ["setValue"],
  StylePresets: ["apply"]
} satisfies { [K in keyof Models]?: (keyof Models[K])[] };

export const OPERATIONS = new Set(
  Object.entries(METHODS).flatMap(([model, methods]) => methods.map(method => `${model}.${method}`))
);

export function runOperation(op: string, args: unknown[]): unknown {
  const [name, method] = op.split(".");
  const model = MODELS[name as keyof Models] as unknown as Record<string, (...args: unknown[]) => unknown>;
  return model[method](...args);
}
