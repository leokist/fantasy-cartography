import { buildTerrain, type TerrainSettings, type TerrainSource } from "./terrain-raster";

const scope = self as unknown as Worker;

scope.onmessage = ({ data }: MessageEvent<{ source: TerrainSource; settings: TerrainSettings }>) => {
  try {
    const raster = buildTerrain(data.source, data.settings);
    const buffers = [raster.heights, raster.biomes, ...Object.values(raster.masks)].map(array => array.buffer);
    scope.postMessage({ raster }, buffers);
  } catch (error) {
    scope.postMessage({ error: (error as Error).message });
  }
};
