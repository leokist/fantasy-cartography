// A world configured by hand: continents and countries make the land, provinces shape its relief and climate
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { getDefaultSeeds, type Seeds } from "@/model/authoring/world-spec";
import { generateMap, living } from "@/model/real-map.testing";

const { WorldSeeds } = await import("./seeds");

const seeds: Seeds = {
  ...getDefaultSeeds(),
  continents: [
    { name: "Westland", x: 28, y: 50, size: "large" },
    { name: "Eastreach", x: 78, y: 45, size: "medium" }
  ],
  states: [
    {
      name: "Aldoria",
      x: 20,
      y: 40,
      capital: "Vesper",
      size: "large",
      continent: 0,
      neighbors: [1],
      cities: [{ name: "Stonebridge", x: 24, y: 55 }]
    },
    { name: "Brennmark", x: 36, y: 62, size: "medium", continent: 0, neighbors: [0] },
    { name: "Ostara", x: 80, y: 45, size: "small", continent: 1 }
  ],
  provinces: [
    { name: "Highmoor", state: 0, x: 16, y: 34, relief: "mountains", climate: "cold" },
    { name: "Greenvale", state: 0, x: 26, y: 50, relief: "plains", climate: "hot", water: "wet", biome: 7 },
    { name: "Dustreach", state: 1, x: 38, y: 64, climate: "hot", water: "dry" }
  ]
};

const cellsOf = (values: ArrayLike<number>, id: number) => Array.from(pack.cells.i).filter(cell => values[cell] === id);
const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
const state = (name: string) => living(pack.states).find(item => item.name === name)!;
const province = (name: string) => living(pack.provinces).find(item => item.name === name)!;

beforeAll(async () => {
  options.generation.states.limit = seeds.states.length;
  WorldSeeds.planNext(seeds);
  await generateMap({ seed: "manual-1", points: 6000 });
  const out = process.env.MANUAL_WORLD_OUT; // cells for a picture of the world
  if (out) {
    const { cells } = pack;
    const dump = { width: 960, height: 540, p: cells.p, h: Array.from(cells.h), state: Array.from(cells.state) };
    writeFileSync(
      out,
      JSON.stringify({ ...dump, biome: Array.from(cells.biome), province: Array.from(cells.province) })
    );
  }
}, 120000);

describe("a world configured by hand", () => {
  it("has land where the continents are and sea far from them", () => {
    const { cells } = pack;
    const at = (x: number, y: number) => {
      const [px, py] = [(x / 100) * 960, (y / 100) * 540];
      let best = 0;
      let distance = Infinity;
      for (const cell of cells.i) {
        const d = (cells.p[cell][0] - px) ** 2 + (cells.p[cell][1] - py) ** 2;
        if (d < distance) [best, distance] = [cell, d];
      }
      return best;
    };
    expect(cells.h[at(28, 50)]).toBeGreaterThanOrEqual(20);
    expect(cells.h[at(78, 45)]).toBeGreaterThanOrEqual(20);
    expect(cells.h[at(55, 5)]).toBeLessThan(20);
    expect(cells.h[at(97, 95)]).toBeLessThan(20);
  });

  it("has exactly the declared countries, each around its capital spot and bordering the declared neighbor", () => {
    expect(living(pack.states).map(item => item.name)).toEqual(["Aldoria", "Brennmark", "Ostara"]);
    const aldoria = state("Aldoria");
    const capital = pack.burgs[aldoria.capital];
    expect(capital.name).toBe("Vesper");
    expect(Math.hypot(capital.x - 0.2 * 960, capital.y - 0.4 * 540)).toBeLessThan(40);
    expect(aldoria.neighbors).toContain(state("Brennmark").i);
    expect(cellsOf(pack.cells.state, aldoria.i).length).toBeGreaterThan(
      cellsOf(pack.cells.state, state("Ostara").i).length
    );
    const city = living(pack.burgs).find(burg => burg.name === "Stonebridge");
    expect(city?.state).toBe(aldoria.i);
  });

  it("divides a country into its declared provinces and shapes each one", () => {
    const highmoor = province("Highmoor");
    const greenvale = province("Greenvale");
    expect(highmoor.state).toBe(state("Aldoria").i);
    expect(
      living(pack.provinces)
        .filter(item => item.state === state("Aldoria").i)
        .map(item => item.name)
        .sort()
    ).toEqual(["Greenvale", "Highmoor"]);
    const heights = (id: number) => cellsOf(pack.cells.province, id).map(cell => pack.cells.h[cell]);
    expect(mean(heights(highmoor.i))).toBeGreaterThan(mean(heights(greenvale.i)) + 10);

    const temperature = (id: number) =>
      mean(cellsOf(pack.cells.province, id).map(cell => grid.cells.temp[pack.cells.g[cell]]));
    expect(temperature(highmoor.i)).toBeLessThan(temperature(greenvale.i) - 10);

    const greenBiomes = cellsOf(pack.cells.province, greenvale.i).map(cell => pack.cells.biome[cell]);
    expect(greenBiomes.filter(biome => biome === 7).length / greenBiomes.length).toBeGreaterThan(0.5);

    const precipitation = (id: number) =>
      mean(cellsOf(pack.cells.province, id).map(cell => grid.cells.prec[pack.cells.g[cell]]));
    expect(precipitation(province("Dustreach").i)).toBeLessThan(precipitation(greenvale.i));
  });

  it("joins borders when the cells are a typed array, as in the browser", async () => {
    const { joinBorders } = await import("./country");
    const { cells } = pack;
    const plain = cells.i;
    cells.i = Uint32Array.from(plain) as unknown as typeof plain;
    try {
      expect(() => joinBorders(state("Aldoria").i, state("Ostara").i)).not.toThrow();
    } finally {
      cells.i = plain;
    }
  });

  it("makes each country its own people", () => {
    for (const name of ["Aldoria", "Brennmark", "Ostara"]) {
      const country = state(name);
      expect(pack.cultures[country.culture]?.name).toBe(name);
      expect(cellsOf(pack.cells.state, country.i).every(cell => pack.cells.culture[cell] === country.culture)).toBe(
        true
      );
    }
  });

  it("marks everything declared as the author's", () => {
    expect(state("Aldoria")).toMatchObject({ origin: "authored", lock: true });
    expect(province("Highmoor")).toMatchObject({ origin: "authored", lock: true });
  });
});

describe("adding a country to the generated world", () => {
  it("raises land for a country placed at sea and keeps the declared countries", async () => {
    const { Additions } = await import("./additions");
    const before = Object.fromEntries(
      living(pack.states).map(item => [item.name, cellsOf(pack.cells.state, item.i).length])
    );
    const isle: Seeds = {
      ...seeds,
      states: [
        ...seeds.states,
        { name: "Isla Verde", x: 55, y: 82, size: "small", capital: "Puerto", cities: [{ name: "Cala", x: 58, y: 84 }] }
      ],
      provinces: [...seeds.provinces, { name: "Sierra", state: 3, x: 55, y: 82, relief: "hills" }]
    };
    const id = Additions.addCountry(isle, 3);

    const added = pack.states[id];
    expect(added).toMatchObject({ name: "Isla Verde", origin: "authored", lock: true });
    const capital = pack.burgs[added.capital];
    expect(capital.name).toBe("Puerto");
    expect(Math.hypot(capital.x - 0.55 * 960, capital.y - 0.82 * 540)).toBeLessThan(40);
    expect(cellsOf(pack.cells.state, id).length).toBeGreaterThan(10);
    expect(living(pack.burgs).find(burg => burg.name === "Cala")?.state).toBe(id);
    expect(province("Sierra").state).toBe(id);
    expect(pack.cultures[added.culture]).toMatchObject({ name: "Isla Verde", origin: "authored" });
    expect(cellsOf(pack.cells.state, id).every(cell => pack.cells.culture[cell] === added.culture)).toBe(true);

    for (const [name, count] of Object.entries(before)) {
      const now = cellsOf(pack.cells.state, state(name).i).length;
      expect(Math.abs(now - count) / count, name).toBeLessThan(0.1); // the rebuilt mesh moves cells a little
    }
    expect(province("Highmoor").state).toBe(state("Aldoria").i);
  });
});
