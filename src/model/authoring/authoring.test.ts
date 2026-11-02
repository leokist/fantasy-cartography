// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Authoring } from "@/model/authoring/authoring";
import { cleanSeeds, getDefaultAuthoring } from "@/model/authoring/world-spec";
import { Pipeline } from "@/model/pipeline";
import { States } from "@/model/political/states-generator";
import { Markers } from "@/model/story/markers-generator";
import { migrateAuthoringEntities, migrateAuthoringSettings } from "@/services/io/auto-update";

interface Row {
  i: number;
  name?: string;
  color?: string;
  lock?: boolean;
  origin?: string;
  removed?: boolean;
}

const states = (): Row[] => pack.states as unknown as Row[];
// a loaded file's records: settings in 1, the fork's own data in 54
const mapData = (settings: object): string[] => {
  const data = ["", JSON.stringify(settings)];
  data[54] = JSON.stringify({ species: [] });
  return data;
};

beforeAll(() => {
  // a stand-in for the real add, which needs a whole map
  vi.spyOn(States, "add").mockImplementation(() => {
    const i = pack.states.length;
    states().push({ i, name: "New" });
    return i;
  });
  Authoring.install();
});

beforeEach(() => {
  vi.stubGlobal("options", { map: { authoring: getDefaultAuthoring() } });
  vi.stubGlobal("pack", {
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Orwin", color: "#000000" },
      { i: 2, removed: true }
    ],
    markers: [{ i: 0, name: "Cave", type: "caves" }]
  });
});

describe("Authoring", () => {
  it("an edit marks the entity edited and locks it", () => {
    States.recolor(1, "#123456");
    expect(states()[1]).toMatchObject({ origin: "edited", lock: true, color: "#123456" });
    expect(Authoring.origin("states", 1)).toBe("edited");
  });

  it("an entity left alone stays generated", () => {
    expect(Authoring.origin("states", 1)).toBe("generated");
    expect(Authoring.origin("states", 0)).toBeUndefined();
    expect(Authoring.origin("states", 2)).toBeUndefined();
  });

  it("a failed edit records nothing", () => {
    expect(() => States.recolor(1, "not a color")).toThrow();
    expect(states()[1].origin).toBeUndefined();
  });

  it("locking by hand is not an edit", () => {
    States.setLocked(1, true);
    expect(states()[1]).toMatchObject({ lock: true });
    expect(states()[1].origin).toBeUndefined();
  });

  it("autoLock off records the edit without locking", () => {
    options.map.authoring.autoLock = false;
    States.recolor(1, "#654321");
    expect(states()[1].origin).toBe("edited");
    expect(states()[1].lock).toBeUndefined();
  });

  it("an entity added by the author is authored, and stays so when edited", () => {
    const id = States.add(10, 10);
    expect(states()[id]).toMatchObject({ origin: "authored", lock: true });
    States.recolor(id, "#abcdef");
    expect(states()[id].origin).toBe("authored");
  });

  it("id 0 counts for markers", () => {
    Markers.rename(0, "Deep cave");
    expect(pack.markers[0]).toMatchObject({ origin: "edited", lock: true });
  });

  it("work the generator does on its own is not recorded", async () => {
    Authoring.untracked(() => States.recolor(1, "#111111"));
    await new Pipeline("test", [{ id: "paint", run: () => States.recolor(1, "#222222") }]).run();
    expect(states()[1].origin).toBeUndefined();
    expect(Authoring.tracking).toBe(true);
  });
});

describe("migration of maps made before authoring", () => {
  it("adds the settings and counts locked entities as edited", () => {
    const data = mapData({ seed: "1" });
    migrateAuthoringSettings(data);
    expect(JSON.parse(data[1]).authoring).toEqual(getDefaultAuthoring());

    states()[1].lock = true;
    migrateAuthoringEntities();
    expect(states()[1].origin).toBe("edited");
    expect(states()[0].origin).toBeUndefined();
  });

  it("leaves a map that has authoring settings alone", () => {
    const data = mapData({ seed: "1", authoring: { ...getDefaultAuthoring(), autoLock: false } });
    const settings = data[1];
    migrateAuthoringSettings(data);
    expect(data[1]).toBe(settings);

    states()[1].lock = true;
    migrateAuthoringEntities();
    expect(states()[1].origin).toBeUndefined();
  });
});

describe("seeds in the world spec", () => {
  it("plant only named seeds and keep each state on the same culture", () => {
    const planted = cleanSeeds({
      continents: [
        { name: "", x: 0, y: 0, size: "small" },
        { name: "Westland", x: 10, y: 10, size: "large" }
      ],
      provinces: [
        { name: "Highmoor", state: 0, x: 3, y: 4, relief: "mountains" },
        { name: "Lost", state: 2, x: 5, y: 5 }
      ],
      states: [
        { name: "", x: 5, y: 5 },
        {
          name: "Aldoria",
          language: 2,
          x: 3,
          y: 3,
          continent: 1,
          neighbors: [0, 2],
          cities: [{ name: "", x: 1, y: 1 }]
        },
        { name: "Brennmark", x: 4, y: 4, continent: 0, neighbors: [1] }
      ],
      species: [
        { name: "Dragon", kind: "fauna", biomes: [9] },
        { name: "", kind: "flora", biomes: [] }
      ]
    });
    expect(planted.continents.map(continent => continent.name)).toEqual(["Westland"]);
    expect(planted.states).toEqual([
      { name: "Aldoria", language: 2, x: 3, y: 3, continent: 0, neighbors: [1] },
      { name: "Brennmark", x: 4, y: 4, neighbors: [0] }
    ]);
    // the province of the unnamed state goes with it; the other follows its state to its new index
    expect(planted.provinces).toEqual([{ name: "Lost", state: 1, x: 5, y: 5 }]);
    expect(planted.species).toEqual([{ name: "Dragon", kind: "fauna", biomes: [9] }]);
  });

  it("are added to a map saved before seeds existed", () => {
    const data = mapData({ seed: "1", authoring: { autoLock: false, fields: {} } });
    migrateAuthoringSettings(data);
    expect(JSON.parse(data[1]).authoring).toEqual({
      autoLock: false,
      fields: {},
      seeds: { continents: [], states: [], provinces: [], species: [] }
    });
  });

  it("lose the cultures declared apart from countries", () => {
    const seeds = {
      continents: [],
      cultures: [{ name: "Aldorians", x: 1, y: 1 }],
      states: [{ name: "Aldoria", x: 2, y: 2, culture: 0 }],
      provinces: [],
      species: []
    };
    const data = mapData({ seed: "1", authoring: { autoLock: true, fields: {}, seeds } });
    migrateAuthoringSettings(data);
    expect(JSON.parse(data[1]).authoring.seeds).toEqual({
      continents: [],
      states: [{ name: "Aldoria", x: 2, y: 2 }],
      provinces: [],
      species: []
    });
  });
});

describe("migration of maps made before fauna and flora", () => {
  it("adds the fork's record and gives the map the default species of its biomes", () => {
    vi.stubGlobal("pack", {
      states: [],
      cells: { biome: Uint8Array.from([0, 1]) },
      biomes: [
        { i: 0, name: "Marine" },
        { i: 1, name: "Hot desert" }
      ],
      goods: []
    });
    const data = ["", JSON.stringify({ seed: "1", authoring: getDefaultAuthoring() })];
    migrateAuthoringSettings(data);
    expect(JSON.parse(data[54])).toEqual({ species: [] });
    migrateAuthoringEntities();
    expect(pack.species.map(species => species.name)).toContain("Camel");
  });
});
