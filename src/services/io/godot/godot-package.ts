// The Godot package: a zip of heights in meters, maps, curves and world data for the FMG Importer addon

import { Rivers } from "@/model/physical/river-generator";
import { getPeople, heightToMeters } from "@/model/units";
import { viewport } from "@/renderers/viewport/viewport";
import { encodeExr, encodePng } from "@/services/io/godot/encoders";
import {
  buildTerrain,
  type MaskName,
  type Region,
  rasterGrid,
  sampleHeight,
  type TerrainRaster,
  type TerrainSettings,
  type TerrainSource
} from "@/services/io/godot/terrain-raster";
import { getIsolines } from "@/utils/path-utils";

type Point = [number, number];

export interface GodotSettings extends TerrainSettings {
  emblems: boolean; // states and provinces
  burgEmblems: boolean;
  preview: boolean;
}

export const PACKAGE_VERSION = 1;
const ROAD_WIDTHS: Record<string, number> = { roads: 6, trails: 3 }; // meters, other land routes get 4

export function mapRegion(kind: "map" | "visible"): Region {
  const { width, height } = options.map.graph;
  if (kind === "map") return { x0: 0, y0: 0, x1: width, y1: height };
  const x0 = Math.max(0, -viewport.x / viewport.scale);
  const y0 = Math.max(0, -viewport.y / viewport.scale);
  const x1 = Math.min(width, x0 + viewport.width / viewport.scale);
  const y1 = Math.min(height, y0 + viewport.height / viewport.scale);
  return { x0, y0, x1, y1 };
}

/** Defaults for a game-sized world of some kilometers, with relief up to 6% of its width */
export function defaultSettings(region: Region): GodotSettings {
  const columns = 2048;
  const metersPerPixel = 4;
  const realWidth = (region.x1 - region.x0) * options.map.units.distance.scale * 1000;
  const realPeak = heightToMeters(100);
  const proportional = realPeak * ((columns * metersPerPixel) / Math.max(realWidth, 1));
  const maxAltitude = Math.round(Math.min(realPeak, Math.max(proportional, columns * metersPerPixel * 0.06)));
  return {
    region,
    columns,
    metersPerPixel,
    maxAltitude,
    seaDepth: Math.round(maxAltitude * 0.3),
    detail: 0.5,
    emblems: true,
    burgEmblems: false,
    preview: true
  };
}

// a few rounds of corner cutting turn cell-to-cell routes into curves
function smooth(points: Point[], rounds = 3): Point[] {
  let line = points;
  for (let round = 0; round < rounds && line.length > 2; round++) {
    const next: Point[] = [line[0]];
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(line[line.length - 1]);
    line = next;
  }
  return line;
}

const touches = ({ x0, y0, x1, y1 }: Region, points: Point[], margin: number) =>
  points.some(([x, y]) => x >= x0 - margin && x <= x1 + margin && y >= y0 - margin && y <= y1 + margin);

/** Map data the terrain needs, for the features that reach the region */
export function collectSource(
  region: Region
): TerrainSource & { riverIds: number[]; roadIds: number[]; lakeIds: number[] } {
  const { cells, vertices, features } = pack;
  const margin = 20;
  const lakes = features.filter(
    feature =>
      feature &&
      feature.type === "lake" &&
      touches(
        region,
        feature.vertices.map(v => vertices.p[v]),
        margin
      )
  );
  const roads = pack.routes.filter(
    route =>
      route.group !== "searoutes" &&
      touches(
        region,
        route.points.map(([x, y]) => [x, y]),
        margin
      )
  );
  const rivers = pack.rivers
    .filter(river => river.cells?.length > 1)
    .map(river => ({ river, points: Rivers.addMeandering(river.cells, river.points) }))
    .filter(({ points }) =>
      touches(
        region,
        points.map(([x, y]) => [x, y]),
        margin
      )
    );

  return {
    width: options.map.graph.width,
    height: options.map.graph.height,
    points: cells.p,
    heights: cells.h,
    biomes: cells.biome,
    heightExponent: options.map.units.height.exponent,
    seed: String(options.map.seed),
    lakes: lakes.map(lake => ({ ring: lake.vertices.map(v => vertices.p[v]), surface: lake.height })),
    lakeIds: lakes.map(lake => lake.i),
    roads: roads.map(route => ({
      points: smooth(route.points.map(([x, y]) => [x, y])),
      width: ROAD_WIDTHS[route.group] ?? 4
    })),
    roadIds: roads.map(route => route.i),
    rivers: rivers.map(({ river, points }) => {
      let flux = 0;
      const widths = points.map(([, , pointFlux], pointIndex) => {
        flux = Math.max(flux, pointFlux);
        const offset = Rivers.getOffset({
          flux,
          pointIndex,
          widthFactor: river.widthFactor,
          startingWidth: river.sourceWidth
        });
        return offset * 2;
      });
      return { points: points.map(([x, y]) => [x, y] as Point), widths };
    }),
    riverIds: rivers.map(({ river }) => river.i)
  };
}

async function rasterize(source: TerrainSource, settings: TerrainSettings): Promise<TerrainRaster> {
  if (typeof Worker === "undefined") return buildTerrain(source, settings);
  const worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<TerrainRaster>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<{ raster?: TerrainRaster; error?: string }>) =>
        data.raster ? resolve(data.raster) : reject(new Error(data.error));
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage({ source, settings });
    });
  } finally {
    worker.terminate();
  }
}

const plainText = (html?: string) =>
  html
    ?.replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
// Godot rejects lone UTF-16 surrogates, which some generated notes contain
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const toJson = (value: unknown, space?: number) =>
  JSON.stringify(value, (_, item) => (typeof item === "string" ? item.replace(LONE_SURROGATE, "\uFFFD") : item), space);
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The files of the package, by path */
export async function buildGodotFiles(
  settings: GodotSettings,
  progress: (step: string) => void = () => {}
): Promise<Record<string, Uint8Array | string>> {
  const { region, metersPerPixel } = settings;
  progress("terrain");
  const source = collectSource(region);
  const raster = await rasterize(source, settings);
  const { toPixel } = rasterGrid(settings);
  const { columns, rows } = raster;

  // map point to Godot meters: x east, y up, z south, origin at the region's top-left pixel
  const ground = (point: Point) => sampleHeight(raster, toPixel(point));
  const toWorld = (point: Point, y = ground(point)) => {
    const [px, py] = toPixel(point);
    return [round(px * metersPerPixel), round(y), round(py * metersPerPixel)];
  };
  const toFlat = (point: Point) => {
    const [x, , z] = toWorld(point, 0);
    return [x, z];
  };
  const unit = (region.x1 - region.x0) / columns;
  // the nearest dry pixel: burgs by rivers and ports sit on the bank, not in the water
  const wet = (i: number) =>
    raster.masks.sea[i] > 0 || raster.masks.lakes[i] > 0 || raster.masks.rivers[i] > 127 || raster.heights[i] <= 0;
  const onDryLand = (point: Point): Point => {
    const [px, py] = toPixel(point).map(Math.round);
    const at = (x: number, y: number) => y * columns + x;
    const valid = (x: number, y: number) => x >= 0 && y >= 0 && x < columns && y < rows;
    if (valid(px, py) && !wet(at(px, py))) return point;
    for (let radius = 1; radius <= 16; radius++) {
      let best: Point | null = null;
      let bestDistance = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const [x, y] = [px + dx, py + dy];
          if (!valid(x, y) || wet(at(x, y)) || dx * dx + dy * dy >= bestDistance) continue;
          bestDistance = dx * dx + dy * dy;
          best = [region.x0 + (x + 0.5) * unit, region.y0 + (y + 0.5) * unit];
        }
      }
      if (best) return best;
    }
    return point;
  };
  const inside = ([x, y]: Point) => x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1;

  // a line split into its runs inside the region
  const runs = <T>(points: Point[], extra: (index: number) => T) => {
    const pieces: { points: number[][]; extra: T[] }[] = [];
    let current: { points: number[][]; extra: T[] } | null = null;
    points.forEach((point, index) => {
      if (!inside(point)) {
        current = null;
        return;
      }
      if (!current) {
        current = { points: [], extra: [] };
        pieces.push(current);
      }
      current.points.push(toWorld(point, 0));
      current.extra.push(extra(index));
    });
    return pieces.filter(piece => piece.points.length > 1);
  };

  progress("curves");
  const rivers = source.rivers.flatMap((river, k) => {
    const data = pack.rivers.find(item => item.i === source.riverIds[k]);
    return runs(river.points, index => [
      raster.riverSurfaces[k][index],
      (river.widths[index] / unit) * metersPerPixel
    ]).map(piece => ({
      id: data?.i,
      name: data?.name,
      type: data?.type,
      discharge: data?.discharge,
      parent: data?.parent,
      points: piece.points.map(([x, , z], i) => [x, round(piece.extra[i][0]), z]),
      widths: piece.extra.map(([, width]) => round(Math.max(width, metersPerPixel * 1.6), 1))
    }));
  });
  const roads = source.roads.flatMap((road, k) => {
    const data = pack.routes.find(item => item.i === source.roadIds[k]);
    return runs(road.points, index => raster.roadHeights[k][index]).map(piece => ({
      id: data?.i,
      name: data?.name,
      group: data?.group,
      width: road.width,
      points: piece.points.map(([x, , z], i) => [x, round(piece.extra[i] + 0.05), z])
    }));
  });
  const lakes = source.lakes.map((lake, k) => {
    const feature = pack.features[source.lakeIds[k]];
    return {
      id: feature.i,
      name: feature.name,
      type: feature.group,
      surface: round(raster.lakeSurfaces[k]),
      ring: lake.ring.map(toFlat)
    };
  });

  progress("places");
  const emblemFile = (type: string, id: number) => `emblems/${type}_${id}.png`;
  const burgs = pack.burgs
    .filter(burg => burg.i && !burg.removed && inside([burg.x, burg.y]))
    .map(burg => ({
      kind: "burg",
      id: burg.i,
      name: burg.name,
      position: toWorld(onDryLand([burg.x, burg.y])),
      population: getPeople(0, burg.population),
      capital: Boolean(burg.capital),
      port: Boolean(burg.port),
      state: burg.state,
      culture: burg.culture,
      type: burg.type,
      emblem: settings.burgEmblems && burg.coa ? emblemFile("burg", burg.i) : undefined
    }));
  const markers = pack.markers
    .filter(marker => !marker.hidden && inside([marker.x, marker.y]))
    .map(marker => ({
      kind: "marker",
      id: marker.i,
      name: marker.name,
      type: marker.type,
      icon: marker.icon,
      note: plainText(marker.note),
      position: toWorld(onDryLand([marker.x, marker.y]))
    }));

  const polygons = (getType: (cellId: number) => number) => {
    const isolines = getIsolines(pack, cellId => getType(cellId) || null, { polygons: true });
    return (id: number) => (isolines[id]?.polygons ?? []).map(ring => ring.map(point => toFlat(point as Point)));
  };
  const statePolygons = polygons(cellId => pack.cells.state[cellId]);
  const provincePolygons = polygons(cellId => pack.cells.province[cellId]);
  const culturePolygons = polygons(cellId => pack.cells.culture[cellId]);
  const religionPolygons = polygons(cellId => pack.cells.religion[cellId]);
  const political = {
    states: pack.states
      .filter(state => state.i && !state.removed)
      .map(state => ({
        id: state.i,
        name: state.name,
        fullName: state.fullName,
        form: state.formName,
        color: state.color,
        capital: state.capital,
        culture: state.culture,
        emblem: settings.emblems && state.coa ? emblemFile("state", state.i) : undefined,
        note: plainText(state.note),
        polygons: statePolygons(state.i)
      })),
    provinces: pack.provinces
      .filter(province => province?.i && !province.removed)
      .map(province => ({
        id: province.i,
        name: province.name,
        fullName: province.fullName,
        state: province.state,
        capital: province.burg,
        color: province.color,
        emblem: settings.emblems && province.coa ? emblemFile("province", province.i) : undefined,
        polygons: provincePolygons(province.i)
      })),
    cultures: pack.cultures
      .filter(culture => culture.i && !culture.removed)
      .map(culture => ({
        id: culture.i,
        name: culture.name,
        type: culture.type,
        color: culture.color,
        polygons: culturePolygons(culture.i)
      })),
    religions: pack.religions
      .filter(religion => religion.i && !religion.removed)
      .map(religion => ({
        id: religion.i,
        name: religion.name,
        type: religion.type,
        form: religion.form,
        deity: religion.deity,
        culture: religion.culture,
        color: religion.color,
        polygons: religionPolygons(religion.i)
      }))
  };

  const biomes = pack.biomes
    .filter(biome => biome && !biome.removed)
    .map(({ i, name, color, habitability }) => ({ id: i, name, color, habitability }));
  const faunaFlora = {
    biomes,
    species: pack.species.map(species => ({
      ...species,
      biomeNames: species.biomes.map(id => pack.biomes[id]?.name),
      goodNames: species.goods.map(id => pack.goods?.find(good => good.i === id)?.name)
    }))
  };

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const height of raster.heights) {
    if (height < minHeight) minHeight = height;
    if (height > maxHeight) maxHeight = height;
  }
  const world = {
    format: "fmg-godot",
    version: PACKAGE_VERSION,
    name: options.map.lore.name,
    seed: String(options.map.seed),
    size: [columns, rows],
    metersPerPixel,
    seaLevel: 0,
    maxAltitude: settings.maxAltitude,
    seaDepth: settings.seaDepth,
    heightRange: [round(minHeight), round(maxHeight)],
    region: { ...region, unit: "map pixels" },
    axes: "x east, y up, z south; meters; origin at the top-left pixel",
    files: {
      heightmap: "heightmap.exr",
      biomes: "biomes.png",
      colormap: "colormap.png",
      masks: Object.fromEntries((Object.keys(raster.masks) as MaskName[]).map(name => [name, `masks/${name}.png`]))
    },
    biomes
  };
  const worldSpec = {
    seed: String(options.map.seed),
    name: options.map.lore.name,
    authoring: options.map.authoring
  };

  progress("images");
  const colors = colormap(raster, settings);
  const files: Record<string, Uint8Array | string> = {
    "world.json": toJson(world, 2),
    "world-spec.json": toJson(worldSpec, 2),
    "rivers.json": toJson(rivers),
    "roads.json": toJson(roads),
    "lakes.json": toJson(lakes),
    "places.json": toJson({ burgs, markers }),
    "political.json": toJson(political),
    "fauna_flora.json": toJson(faunaFlora, 1),
    "heightmap.exr": encodeExr(raster.heights, columns, rows),
    "biomes.png": await encodePng(raster.biomes, columns, rows, 1),
    "colormap.png": await encodePng(colors, columns, rows, 3)
  };
  for (const [name, mask] of Object.entries(raster.masks))
    files[`masks/${name}.png`] = await encodePng(mask, columns, rows, 1);

  if (settings.emblems || settings.burgEmblems) {
    progress("emblems");
    Object.assign(files, await renderEmblems(political, burgs));
  }
  if (settings.preview) {
    progress("preview");
    files["preview.glb"] = await previewMesh(raster, colors, settings);
  }
  return files;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

// biome colors on land, water darkening with depth
function colormap(raster: TerrainRaster, settings: TerrainSettings): Uint8Array {
  const colors = pack.biomes.map(biome => hexToRgb(biome?.color ?? "#808080"));
  const pixels = new Uint8Array(raster.columns * raster.rows * 3);
  const shallow = [70, 130, 180];
  const deep = [20, 50, 100];
  raster.heights.forEach((height, i) => {
    let rgb: number[];
    if (raster.masks.sea[i] || raster.masks.lakes[i] || raster.masks.rivers[i] === 255) {
      const t = Math.min(1, Math.max(0, -height / Math.max(settings.seaDepth, 1)));
      rgb = shallow.map((value, c) => value + (deep[c] - value) * t);
    } else rgb = colors[raster.biomes[i]] ?? [128, 128, 128];
    pixels.set(rgb, i * 3);
  });
  return pixels;
}

async function renderEmblems(
  political: { states: { id: number; emblem?: string }[]; provinces: { id: number; emblem?: string }[] },
  burgs: { id: number; emblem?: string }[]
): Promise<Record<string, Uint8Array>> {
  const { emblemPng } = await import("@/services/io/emblem-image");
  const entries = [
    ...political.states.map(item => ({ item, coa: pack.states[item.id].coa, id: `stateCOA${item.id}` })),
    ...political.provinces.map(item => ({ item, coa: pack.provinces[item.id].coa, id: `provinceCOA${item.id}` })),
    ...burgs.map(item => ({ item, coa: pack.burgs[item.id].coa, id: `burgCOA${item.id}` }))
  ];
  const files: Record<string, Uint8Array> = {};
  for (const { item, coa, id } of entries) {
    if (!item.emblem || !coa) continue;
    try {
      const url = await emblemPng(id, coa, 256);
      files[item.emblem] = Uint8Array.from(atob(url.split(",")[1]), char => char.charCodeAt(0));
    } catch {
      delete item.emblem; // an emblem that cannot be drawn is left out
    }
  }
  return files;
}

// a coarse colored mesh to check the package in Godot or Blender before importing
async function previewMesh(raster: TerrainRaster, colors: Uint8Array, settings: TerrainSettings) {
  const THREE = await import("three");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const step = Math.max(1, Math.ceil(Math.max(raster.columns, raster.rows) / 256));
  const across = Math.ceil(raster.columns / step);
  const down = Math.ceil(raster.rows / step);
  const positions = new Float32Array(across * down * 3);
  const vertexColors = new Float32Array(across * down * 3);
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      const x = Math.min(column * step, raster.columns - 1);
      const y = Math.min(row * step, raster.rows - 1);
      const pixel = y * raster.columns + x;
      const vertex = (row * across + column) * 3;
      positions.set([x * settings.metersPerPixel, raster.heights[pixel], y * settings.metersPerPixel], vertex);
      for (let c = 0; c < 3; c++) vertexColors[vertex + c] = (colors[pixel * 3 + c] / 255) ** 2.2;
    }
  }
  const indices: number[] = [];
  for (let row = 0; row + 1 < down; row++) {
    for (let column = 0; column + 1 < across; column++) {
      const a = row * across + column;
      indices.push(a, a + across, a + 1, a + 1, a + across, a + across + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.name = "Preview";
  const scene = new THREE.Scene();
  scene.add(mesh);
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  return new Uint8Array(glb);
}

/** The package as a zip with everything in one folder */
export async function zipGodotFiles(files: Record<string, Uint8Array | string>, folder: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const root = zip.folder(folder) as InstanceType<typeof JSZip>;
  for (const [path, content] of Object.entries(files)) root.file(path, content);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
