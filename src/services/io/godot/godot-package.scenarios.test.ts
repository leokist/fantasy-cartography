// The Godot package of a real generated map: heights in meters, carved rivers, level roads and places on the ground
import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { generateMap } from "@/model/real-map.testing";

const { buildGodotFiles, collectSource, defaultSettings, mapRegion, zipGodotFiles } = await import("./godot-package");
const { buildTerrain, rasterGrid, sampleHeight } = await import("./terrain-raster");

type Files = Awaited<ReturnType<typeof buildGodotFiles>>;
const json = <T>(files: Files, name: string) => JSON.parse(files[name] as string) as T;

let files: Files;
beforeAll(async () => {
  await generateMap({ seed: "godot-1", points: 10000 });
  const settings = { ...defaultSettings(mapRegion("map")), columns: 1024, emblems: false, preview: false };
  files = await buildGodotFiles(settings);
  const out = process.env.GODOT_PACKAGE_OUT; // a package for the addon's import test
  if (out) writeFileSync(out, Buffer.from(await (await zipGodotFiles(files, "godot-1")).arrayBuffer()));
}, 120000);

describe("godot package", () => {
  it("describes the world in meters", () => {
    const world = json<{ size: number[]; metersPerPixel: number; heightRange: number[]; maxAltitude: number }>(
      files,
      "world.json"
    );
    expect(world.size[0]).toBe(1024);
    expect(world.heightRange[0]).toBeLessThan(0);
    expect(world.heightRange[1]).toBeGreaterThan(0);
    expect(world.heightRange[1]).toBeLessThanOrEqual(world.maxAltitude * 1.1);
    const exr = files["heightmap.exr"] as Uint8Array;
    expect(Array.from(exr.subarray(0, 4))).toEqual([0x76, 0x2f, 0x31, 0x01]);
    for (const name of ["biomes.png", "colormap.png", "masks/rivers.png", "masks/roads.png"])
      expect(Array.from((files[name] as Uint8Array).subarray(1, 4))).toEqual([80, 78, 71]);
  });

  it("puts places on the ground and rivers below their banks", () => {
    const { burgs } = json<{ burgs: { position: number[] }[] }>(files, "places.json");
    expect(burgs.length).toBeGreaterThan(10);
    expect(burgs.every(({ position }) => position.every(Number.isFinite))).toBe(true);

    const rivers = json<{ points: number[][]; widths: number[] }[]>(files, "rivers.json");
    expect(rivers.length).toBeGreaterThan(3);
    for (const river of rivers) {
      const ys = river.points.map(([, y]) => y);
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1] + 1e-6); // never uphill
      expect(river.widths.every(width => width > 0)).toBe(true);
    }
    const roads = json<{ points: number[][] }[]>(files, "roads.json");
    expect(roads.length).toBeGreaterThan(3);
    const lakes = json<{ surface: number; ring: number[][] }[]>(files, "lakes.json");
    expect(lakes.every(lake => lake.ring.length > 2 && Number.isFinite(lake.surface))).toBe(true);
  });

  it("carves rivers and levels roads in the heightmap", () => {
    const settings = { ...defaultSettings(mapRegion("map")), columns: 1024 };
    const source = collectSource(settings.region);
    const raster = buildTerrain(source, settings);
    const { toPixel } = rasterGrid(settings);

    const river = source.rivers.findIndex(({ points }) => points.length > 20);
    for (const [i, point] of source.rivers[river].points.entries())
      expect(sampleHeight(raster, toPixel(point))).toBeLessThanOrEqual(raster.riverSurfaces[river][i] + 0.5);
    let blended = 0;
    for (let i = 0; i < raster.biomes.length; i++) {
      if (!raster.blendWeights[i]) continue;
      blended++;
      expect(raster.blendBiomes[i]).not.toBe(raster.biomes[i]); // a pixel fades into a different biome
    }
    expect(blended / raster.biomes.length).toBeGreaterThan(0.01); // borders are soft...
    expect(blended / raster.biomes.length).toBeLessThan(0.5); // ...and biomes stay pure inside
    const road = source.roads.findIndex(({ points }) => points.length > 20);
    const offsets = source.roads[road].points.map((point, i) =>
      Math.abs(sampleHeight(raster, toPixel(point)) - raster.roadHeights[road][i])
    );
    const level = offsets.filter(offset => offset < settings.maxAltitude * 0.01).length;
    expect(level / offsets.length).toBeGreaterThan(0.8); // rivers may still cut across
  });

  it("keeps state polygons and the species catalogue", () => {
    const political = json<{ states: { polygons: number[][][] }[] }>(files, "political.json");
    expect(political.states.length).toBe(pack.states.filter(state => state.i && !state.removed).length);
    expect(political.states.every(state => state.polygons.length > 0)).toBe(true);
    const nature = json<{ species: unknown[] }>(files, "fauna_flora.json");
    expect(nature.species.length).toBe(pack.species.length);
  });

  it("exports a region at a finer scale, with everything inside it", async () => {
    const region = { x0: 300, y0: 150, x1: 600, y1: 400 };
    const settings = { ...defaultSettings(region), columns: 1536, metersPerPixel: 2, emblems: false, preview: false };
    const part = await buildGodotFiles(settings);
    const world = json<{ size: number[]; region: typeof region }>(part, "world.json");
    expect(world.size).toEqual([1536, 1280]);
    const [width, depth] = [1536 * 2, 1280 * 2];
    const within = ([x, , z]: number[]) => x >= -2 && x <= width + 2 && z >= -2 && z <= depth + 2;
    for (const name of ["rivers.json", "roads.json"])
      for (const line of json<{ points: number[][] }[]>(part, name)) expect(line.points.every(within)).toBe(true);
    const { burgs } = json<{ burgs: { position: number[] }[] }>(part, "places.json");
    expect(burgs.length).toBeGreaterThan(0);
    expect(burgs.every(({ position }) => within(position))).toBe(true);
    const out = process.env.GODOT_REGION_OUT;
    if (out) writeFileSync(out, Buffer.from(await (await zipGodotFiles(part, "godot-region")).arrayBuffer()));
  }, 120000);
});
