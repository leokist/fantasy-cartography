import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultSpecies } from "@/data/species";
import { Goods } from "@/model/economy/goods-generator";
import { SpeciesCatalogue } from "@/model/nature/species-generator";

const biomes = ["Marine", "Hot desert", "Cold desert", "Savanna", "Grassland", "Tropical seasonal forest"].map(
  (name, i) => ({ i, name })
);

beforeEach(() => {
  vi.stubGlobal("pack", {
    cells: { biome: Uint8Array.from([0, 1, 1, 4]) }, // marine, hot desert and grassland only
    biomes,
    goods: [
      { i: 0, name: "Camels" },
      { i: 1, name: "Horses" }
    ]
  });
});

describe("species catalogue", () => {
  it("holds the default species of the biomes on the map, linked to their goods", () => {
    SpeciesCatalogue.generate();
    const names = pack.species.map(species => species.name);
    expect(names).toContain("Camel");
    expect(names).toContain("Wild horse");
    expect(names).not.toContain("Lion"); // savanna is not on the map
    expect(pack.species.every(species => species.biomes.every(biome => [0, 1, 4].includes(biome)))).toBe(true);
    expect(pack.species.find(species => species.name === "Camel")).toMatchObject({ goods: [0], domesticable: true });
    expect(pack.species.map(species => species.i)).toEqual(pack.species.map((_, i) => i));
  });

  it("keeps locked species when regenerated", () => {
    SpeciesCatalogue.generate();
    const id = SpeciesCatalogue.add("fauna", "Sand drake");
    SpeciesCatalogue.setBiomes(id, [1]);
    SpeciesCatalogue.setLocked(id, true);
    SpeciesCatalogue.generate();
    expect(pack.species.filter(species => species.name === "Sand drake")).toHaveLength(1);
  });

  it("validates every edit", () => {
    SpeciesCatalogue.generate();
    const id = SpeciesCatalogue.add("flora", "Moonpetal");
    SpeciesCatalogue.setUses(id, ["magic", "medicine", "magic"]);
    expect(pack.species.find(species => species.i === id)?.uses).toEqual(["magic", "medicine"]);
    expect(() => SpeciesCatalogue.setDanger(id, "deadly")).toThrow("Only fauna");
    expect(() => SpeciesCatalogue.setRarity(id, "mythic")).toThrow("The rarity must be one of");
    expect(() => SpeciesCatalogue.setBiomes(id, [42])).toThrow("Biome 42 does not exist");

    SpeciesCatalogue.setKind(id, "fauna");
    const turned = pack.species.find(species => species.i === id);
    expect(turned).toMatchObject({ danger: "harmless" });
    expect(turned).not.toHaveProperty("uses");
    SpeciesCatalogue.remove(id);
    expect(() => SpeciesCatalogue.rename(id, "x")).toThrow(`Species ${id} does not exist`);
  });

  it("default data names only goods and biomes that exist by default", () => {
    const goods = new Set(
      (Goods as unknown as { defaultGoods: { name: string }[] }).defaultGoods.map(good => good.name)
    );
    for (const species of getDefaultSpecies()) {
      for (const good of species.goods ?? []) expect(goods, `${species.name}: ${good}`).toContain(good);
      expect(species.biomes.every(biome => biome >= 0 && biome <= 12)).toBe(true);
      expect(species.kind === "fauna" ? species.danger : species.uses).toBeDefined();
    }
  });
});
