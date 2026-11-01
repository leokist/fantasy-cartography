// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { initialField, parseFieldValue, pinsOf, SPEC_FIELDS, WIZARD_STEPS } from "@/model/authoring/spec-fields";
import { getDefaultAuthoring } from "@/model/authoring/world-spec";
import { Options } from "@/model/options/options-model";
import { pinSchemas } from "@/model/options/options-schema";
import { Pins } from "@/model/options/pins";

const field = (key: string) => SPEC_FIELDS.find(def => def.key === key)!;

beforeEach(() => {
  localStorage.clear();
  Pins.release();
  globalThis.options = Options.getDefaultOptions();
});

describe("wizard fields", () => {
  it("are all pins, each in a known step, with no duplicates", () => {
    const keys = SPEC_FIELDS.map(def => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const def of SPEC_FIELDS) {
      expect(Object.hasOwn(pinSchemas, def.key)).toBe(true);
      expect(WIZARD_STEPS).toContain(def.step);
      expect(pinSchemas[def.key].safeParse(parseFieldValue(def, String(def.current()))).success).toBe(true);
    }
  });

  it("parse a typed value and refuse one the pin does not accept", () => {
    expect(parseFieldValue(field("statesNumber"), "12")).toBe(12);
    expect(parseFieldValue(field("points"), "4")).toBe(4);
    expect(parseFieldValue(field("points"), "99")).toBeUndefined();
    expect(parseFieldValue(field("mapName"), "Aldoria")).toBe("Aldoria");
  });

  it("start from the saved spec, else this browser's pins, else random", () => {
    const authoring = getDefaultAuthoring();
    expect(initialField(field("statesNumber"), authoring)).toEqual({
      mode: "random",
      value: options.generation.states.limit
    });

    Pins.set("statesNumber", 7);
    expect(initialField(field("statesNumber"), authoring)).toEqual({ mode: "set", value: 7 });

    authoring.fields.statesNumber = { mode: "random", value: 3 };
    expect(initialField(field("statesNumber"), authoring)).toEqual({ mode: "random", value: 3 });
  });

  it("pin only the fields set by hand", () => {
    expect(
      pinsOf({ statesNumber: { mode: "set", value: 5 }, cultures: { mode: "random", value: 9 }, seed: { mode: "set" } })
    ).toEqual({ statesNumber: 5, seed: undefined });
  });
});

describe("Pins.overrideNext", () => {
  it("replaces the stored pins for one randomize, and never writes to storage", () => {
    Pins.set("religionsNumber", 2);
    Pins.overrideNext({ statesNumber: 5, cultures: "not a number", seed: "123" });
    expect(Pins.all()).toEqual({ statesNumber: 5 });

    Pins.set("manors", 10); // a pin the user sets meanwhile is stored, not mixed into the override
    expect(Pins.all()).toEqual({ statesNumber: 5 });

    Options.randomize();
    expect(options.generation.states.limit).toBe(5);
    expect(Pins.all()).toEqual({ religionsNumber: 2, manors: 10 });
  });
});
