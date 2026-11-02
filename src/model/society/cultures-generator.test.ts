import { afterEach, expect, it, vi } from "vitest";
import { Options } from "@/model/options/options-model";
import { Cultures } from "./cultures-generator";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses the requested culture set when regenerating an existing map", () => {
  options = Options.getDefaultOptions();
  options.map.cultures.set = "english";
  options.generation.cultures = { ...options.generation.cultures, set: "highFantasy", limit: 16 };
  const cells = { i: Array.from({ length: 500 }, (_, i) => i), s: Array(500).fill(1), h: [], t: [] };
  vi.stubGlobal("pack", { cells });
  vi.stubGlobal("grid", { cells: { temp: [] } });
  const getDefault = Cultures.getDefault.bind(Cultures);
  let names: string[] = [];
  vi.spyOn(Cultures, "getDefault").mockImplementation(count => {
    names = getDefault(count).map(culture => culture.name);
    throw new Error("stop before placement");
  });

  expect(() => Cultures.regenerate()).toThrow("stop before placement");
  expect(options.map.cultures.set).toBe("highFantasy");
  expect(Cultures.getDefault).toHaveBeenCalledWith(16);
  expect(names.includes("Quenian")).toBe(true);
});

it("sets ancestry on highFantasy and darkFantasy cultures and allows setting ancestry", () => {
  options = Options.getDefaultOptions();
  const cells = { i: Array.from({ length: 500 }, (_, i) => i), s: Array(500).fill(1), h: [], t: [] };
  vi.stubGlobal("pack", {
    cells,
    cultures: [
      { i: 0, name: "Wildlands", code: "Wi" },
      { i: 1, name: "Quenian", ancestry: "Elfish", code: "Qu" }
    ]
  });
  vi.stubGlobal("grid", { cells: { temp: [] } });

  options.map.cultures.set = "highFantasy";
  const highFantasy = Cultures.getDefault();
  const quenian = highFantasy.find(c => c.name === "Quenian");
  expect(quenian?.ancestry).toBe("Elfish");

  options.map.cultures.set = "darkFantasy";
  const darkFantasy = Cultures.getDefault();
  const eldar = darkFantasy.find(c => c.name === "Eldar");
  expect(eldar?.ancestry).toBe("Elfish");

  Cultures.setAncestry(1, "High Elf");
  expect(pack.cultures[1].ancestry).toBe("High Elf");

  Cultures.setAncestry(1, "   ");
  expect(pack.cultures[1].ancestry).toBeUndefined();
});

it("recomputes a renamed culture's code without clashing with other cultures", () => {
  vi.stubGlobal("pack", {
    cultures: [
      { i: 0, name: "Wildlands", code: "Wi" },
      { i: 1, name: "Old", code: "Ol" },
      { i: 2, name: "Salt", code: "Sa" }
    ]
  });
  Cultures.rename(1, "Saltmere");
  expect(pack.cultures[1]).toMatchObject({ name: "Saltmere", code: "SA" });
  expect(() => Cultures.rename(5, "X")).toThrow("Culture 5 does not exist");
});

it("makes each state its own people, in the language of the culture it was founded in", () => {
  vi.stubGlobal("pack", {
    cells: {
      i: [0, 1, 2, 3],
      h: [10, 30, 30, 30],
      state: Uint16Array.from([0, 1, 2, 0]),
      culture: Uint16Array.from([1, 1, 1, 2])
    },
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Arda", color: "#f00", center: 1, culture: 1, type: "Naval" },
      { i: 2, name: "Bree", color: "#0f0", center: 2, culture: 1, type: "Generic", lock: true },
      { i: 3, removed: true }
    ],
    burgs: [0, { i: 1, state: 2, culture: 1 }],
    cultures: [
      { i: 0, name: "Wildlands", base: 1, type: "Generic" },
      { i: 1, name: "Old", base: 5, type: "Generic", note: "<p>old</p>" },
      { i: 2, name: "Other", base: 7, type: "Generic" }
    ]
  });

  Cultures.followStates();

  expect(pack.cultures.map(c => [c.i, c.name, c.base, !!c.removed])).toEqual([
    [0, "Wildlands", 1, false],
    [1, "Arda", 5, false],
    [2, "Bree", 5, false],
    [3, "", 0, true]
  ]);
  expect(pack.cultures[1]).toMatchObject({ color: "#f00", center: 1, type: "Naval" });
  expect(pack.cultures[1].note).toBeUndefined();
  expect(pack.cultures[2].lock).toBe(true);
  expect(pack.states.map(s => s.culture)).toEqual([undefined, 1, 2, undefined]);
  expect(Array.from(pack.cells.culture)).toEqual([0, 1, 2, 0]);
  expect(pack.burgs[1].culture).toBe(2);
});
