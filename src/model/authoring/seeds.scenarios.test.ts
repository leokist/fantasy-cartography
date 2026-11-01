// Declared cultures and states on real generated maps, and additions that leave locked entities untouched
import { beforeEach, describe, expect, it } from "vitest";
import { generateMap, living, newViolations, violations } from "@/model/real-map.testing";

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
  it("found the declared cultures and states where the author placed them", async () => {
    WorldSeeds.planNext({
      cultures: [{ name: "Aldorians", x: 25, y: 50, color: "#aa0000" }],
      states: [
        {
          name: "Aldoria",
          capital: "Vesper",
          form: "Kingdom",
          color: "#123456",
          culture: 0,
          emblem: "my-arms",
          x: 25,
          y: 50
        },
        { name: "Brennmark", x: 75, y: 50 }
      ]
    });
    await generateMap({ seed: "seeds-1" });

    const culture = pack.cultures[1];
    expect(culture).toMatchObject({ name: "Aldorians", color: "#aa0000", origin: "authored", lock: true });
    expect(cellsOf(pack.cells.culture, 1).length).toBeGreaterThan(10); // it spread before it was locked

    const [aldoria, brennmark] = [pack.states[1], pack.states[2]];
    expect(aldoria).toMatchObject({ name: "Aldoria", formName: "Kingdom", color: "#123456", origin: "authored" });
    expect(aldoria.fullName).toContain("Aldoria");
    expect(aldoria.coa).toEqual({ icon: "my-arms" });
    expect(pack.burgs[aldoria.capital]).toMatchObject({ name: "Vesper", culture: 1, capital: 1, origin: "authored" });
    expect(brennmark).toMatchObject({ name: "Brennmark", origin: "authored" });
    expect(cellsOf(pack.cells.state, 1).length).toBeGreaterThan(10);

    // the capitals sit on the half of the map the author chose
    const { width } = options.map.graph;
    expect(pack.burgs[aldoria.capital].x).toBeLessThan(width / 2);
    expect(pack.burgs[brennmark.capital].x).toBeGreaterThan(width / 2);
    expect(WorldSeeds.planned).toBeNull();
  });

  it("does not carry the seeds into the next map", async () => {
    await generateMap({ seed: "seeds-1" });
    const authored = (id: number) => Authoring.origin("states", id) !== "generated";
    expect(living(pack.states).some(state => state.name === "Aldoria" || authored(state.i))).toBe(false);
  });

  it("skips a seed with no land under it instead of failing", async () => {
    WorldSeeds.planNext({ cultures: [], states: [{ name: "Atlantis", x: 0, y: 0 }] });
    await generateMap({ seed: "seeds-2" });
    expect(pack.states[1].name).toBe("Atlantis"); // snapped to the nearest populated land
  });
});

describe("additions to a generated map", () => {
  it("add a state and a culture without changing anything locked", async () => {
    await generateMap({ seed: "additions-1" });
    const before = violations();
    const [lockedState] = living(pack.states);
    const [lockedCulture] = living(pack.cultures);
    Authoring.markEdited("states", lockedState.i);
    Authoring.markEdited("cultures", lockedCulture.i);
    const stateCells = cellsOf(pack.cells.state, lockedState.i);
    const cultureCells = cellsOf(pack.cells.culture, lockedCulture.i);
    const stateCopy = structuredClone(lockedState);

    const stateId = Additions.addState({ name: "Nova Terra", capital: "Porto Novo", x: 50, y: 50 });
    const cultureId = Additions.addCulture({ name: "Novos", x: 50, y: 50 });

    expect(cellsOf(pack.cells.state, lockedState.i)).toEqual(stateCells);
    expect(cellsOf(pack.cells.culture, lockedCulture.i)).toEqual(cultureCells);
    // the same state, plus its relation to the newcomer; neighbors and area are derived
    const { diplomacy, ...rest } = pack.states[lockedState.i];
    const { diplomacy: diplomacyBefore, ...restBefore } = stateCopy;
    expect({ ...rest, neighbors: undefined, area: undefined }).toEqual({
      ...restBefore,
      neighbors: undefined,
      area: undefined
    });
    expect(diplomacy?.slice(0, diplomacyBefore?.length)).toEqual(diplomacyBefore);

    expect(pack.states[stateId]).toMatchObject({ name: "Nova Terra", origin: "authored", lock: true });
    expect(pack.burgs[pack.states[stateId].capital]).toMatchObject({ name: "Porto Novo", origin: "authored" });
    expect(cellsOf(pack.cells.state, stateId).length).toBeGreaterThan(1);
    expect(pack.cultures[cultureId]).toMatchObject({ name: "Novos", origin: "authored", lock: true });
    expect(cellsOf(pack.cells.culture, cultureId).length).toBeGreaterThan(1);
    expect(newViolations(before)).toEqual([]);
  });
});
