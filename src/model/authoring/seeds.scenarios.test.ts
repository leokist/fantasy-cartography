// Declared countries, each its own people, on real generated maps, and additions that leave locked entities untouched
import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultSeeds } from "@/model/authoring/world-spec";
import { circle, generateMap, living, newViolations, riskEdit, violations } from "@/model/real-map.testing";

const { WorldSeeds } = await import("./seeds");
const { Additions } = await import("./additions");
const { Authoring } = await import("./authoring");

const cellsOf = (values: ArrayLike<number>, id: number) => Array.from(pack.cells.i).filter(cell => values[cell] === id);

beforeEach(() => {
  options.generation.states.limit = 6;
  options.generation.cultures.limit = 6;
  options.generation.cultures.set = "world";
});

describe("world seeds", () => {
  it("found the declared countries where the author placed them, each its own people", async () => {
    WorldSeeds.planNext({
      ...getDefaultSeeds(),
      continents: [
        { name: "Westland", x: 25, y: 50, size: "large" },
        { name: "Eastland", x: 75, y: 50, size: "large" }
      ],
      states: [
        {
          name: "Aldoria",
          capital: "Vesper",
          form: "Kingdom",
          color: "#123456",
          language: 3,
          emblem: "my-arms",
          x: 25,
          y: 50
        },
        { name: "Brennmark", x: 75, y: 50 }
      ],
      species: [{ name: "Sand drake", kind: "fauna", biomes: [1, 2, 4], rarity: "legendary", danger: "deadly" }]
    });
    await generateMap({ seed: "seeds-1" });

    const culture = pack.cultures[1];
    expect(culture).toMatchObject({ name: "Aldoria", color: "#123456", base: 3, origin: "authored", lock: true });
    expect(cellsOf(pack.cells.state, 1).every(cell => pack.cells.culture[cell] === 1)).toBe(true);
    expect(pack.cultures[2]).toMatchObject({ name: "Brennmark" });

    const [aldoria, brennmark] = [pack.states[1], pack.states[2]];
    expect(aldoria).toMatchObject({
      name: "Aldoria",
      formName: "Kingdom",
      color: "#123456",
      culture: 1,
      origin: "authored"
    });
    expect(aldoria.fullName).toContain("Aldoria");
    expect(aldoria.coa).toEqual({ icon: "my-arms" });
    expect(pack.burgs[aldoria.capital]).toMatchObject({ name: "Vesper", culture: 1, capital: 1, origin: "authored" });
    expect(brennmark).toMatchObject({ name: "Brennmark", origin: "authored" });
    expect(cellsOf(pack.cells.state, 1).length).toBeGreaterThan(10);

    // the capitals sit on the half of the map the author chose
    const { width } = options.map.graph;
    expect(pack.burgs[aldoria.capital].x).toBeLessThan(width / 2);
    expect(pack.burgs[brennmark.capital].x).toBeGreaterThan(width / 2);
    const drake = pack.species.find(species => species.name === "Sand drake");
    expect(drake).toMatchObject({
      kind: "fauna",
      rarity: "legendary",
      danger: "deadly",
      origin: "authored",
      lock: true
    });
    expect(pack.species.length).toBeGreaterThan(10); // the default catalogue around it
    expect(WorldSeeds.planned).toBeNull();
  });

  it("does not carry the seeds into the next map", async () => {
    await generateMap({ seed: "seeds-1" });
    const authored = (id: number) => Authoring.origin("states", id) !== "generated";
    expect(living(pack.states).some(state => state.name === "Aldoria" || authored(state.i))).toBe(false);
  });

  it("raises land for a country declared off every continent", async () => {
    WorldSeeds.planNext({
      ...getDefaultSeeds(),
      continents: [{ name: "Midland", x: 50, y: 50, size: "huge" }],
      states: [{ name: "Atlantis", x: 3, y: 5 }]
    });
    await generateMap({ seed: "seeds-2" });
    const atlantis = pack.states[1];
    expect(atlantis.name).toBe("Atlantis");
    expect(pack.burgs[atlantis.capital].x).toBeLessThan(0.15 * options.map.graph.width); // its own island
  });
});

describe("countries sized by area", () => {
  const share = (id: number) => {
    const { width, height } = options.map.graph;
    const area = cellsOf(pack.cells.state, id).reduce((sum, cell) => sum + pack.cells.area[cell], 0);
    return (area / (width * height)) * 100;
  };

  it("grow to their share of the map", async () => {
    WorldSeeds.planNext({
      ...getDefaultSeeds(),
      sizing: "area",
      continents: [{ name: "Midland", x: 50, y: 50, size: "huge" }],
      states: [
        { name: "Small", x: 30, y: 45, area: 3 },
        { name: "Large", x: 65, y: 55, area: 10 }
      ]
    });
    await generateMap({ seed: "area-1" });
    const [small, large] = [pack.states[1], pack.states[2]];
    expect([small.name, large.name]).toEqual(["Small", "Large"]);
    expect(share(small.i)).toBeGreaterThan(3 * 0.75);
    expect(share(small.i)).toBeLessThan(3 * 1.25);
    expect(share(large.i)).toBeGreaterThan(10 * 0.75);
    expect(share(large.i)).toBeLessThan(10 * 1.25);
  });

  it("an added country grows to its share without touching locked ones", async () => {
    await generateMap({ seed: "area-2" });
    const [locked] = living(pack.states);
    Authoring.markEdited("states", locked.i);
    const lockedCells = cellsOf(pack.cells.state, locked.i);
    const id = Additions.addState({ name: "Nova", x: 50, y: 50, area: 4 });
    expect(cellsOf(pack.cells.state, locked.i)).toEqual(lockedCells);
    expect(share(id)).toBeGreaterThan(4 * 0.5);
    expect(share(id)).toBeLessThan(4 * 1.25);
  });
});

describe("additions to a generated map", () => {
  it("add a state without changing anything locked", async () => {
    await generateMap({ seed: "additions-1" });
    const before = violations();
    const [lockedState] = living(pack.states);
    const [lockedCulture] = living(pack.cultures);
    Authoring.markEdited("states", lockedState.i);
    Authoring.markEdited("cultures", lockedCulture.i);
    const stateCells = cellsOf(pack.cells.state, lockedState.i);
    const cultureCells = cellsOf(pack.cells.culture, lockedCulture.i);
    const stateCopy = structuredClone(lockedState);
    const provincesBefore = pack.provinces.map(province => province?.name);

    const stateId = Additions.addState({ name: "Nova Terra", capital: "Porto Novo", x: 50, y: 50 });

    expect(cellsOf(pack.cells.state, lockedState.i)).toEqual(stateCells);
    expect(cellsOf(pack.cells.culture, lockedCulture.i)).toEqual(cultureCells);
    // the same state, plus its relation to the newcomer; neighbors and area are derived
    // province regeneration renumbers the provinces a locked state keeps; their names stay
    const provinceNames = (ids?: number[]) => ids?.map(id => pack.provinces[id]?.name).sort();
    const namesBefore = stateCopy.provinces?.map(id => provincesBefore[id]).sort();
    const { diplomacy, provinces, ...rest } = pack.states[lockedState.i];
    const { diplomacy: diplomacyBefore, provinces: _, ...restBefore } = stateCopy;
    expect(provinceNames(provinces)).toEqual(namesBefore);
    expect({ ...rest, neighbors: undefined, area: undefined }).toEqual({
      ...restBefore,
      neighbors: undefined,
      area: undefined
    });
    expect(diplomacy?.slice(0, diplomacyBefore?.length)).toEqual(diplomacyBefore);

    expect(pack.states[stateId]).toMatchObject({ name: "Nova Terra", origin: "authored", lock: true });
    expect(pack.burgs[pack.states[stateId].capital]).toMatchObject({ name: "Porto Novo", origin: "authored" });
    expect(cellsOf(pack.cells.state, stateId).length).toBeGreaterThan(1);
    expect(newViolations(before)).toEqual([]);
  });
});

describe("species", () => {
  it("survive a heightmap edit that rebuilds the map", async () => {
    await generateMap({ seed: "species-1" });
    const before = structuredClone(pack.species);
    expect(before.length).toBeGreaterThan(10);
    riskEdit(circle(0.5, 0.5, 60, 60, "land"), false);
    expect(pack.species).toEqual(before);
  });
});
