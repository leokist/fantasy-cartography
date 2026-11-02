# Godot package (Fantasy Cartography fork)

The Export dialog's **Godot package** ([`godot-export.ts`](../../src/controllers/godot-export.ts)) downloads a zip that the [Fantasy Cartography Importer](../../godot/README.md) addon turns into a Terrain3D scene. The map stays the source: the package is rebuilt from it, and edits made in Godot do not come back.

## Building it

[`godot-package.ts`](../../src/services/io/godot/godot-package.ts) collects the map data of a region (the whole map or the visible area) and builds the terrain in a Web Worker ([`terrain.worker.ts`](../../src/services/io/godot/terrain.worker.ts)), or in place where workers are missing (tests). [`terrain-raster.ts`](../../src/services/io/godot/terrain-raster.ts) works on plain data only, in this order:

1. Cell heights are interpolated over the Delaunay triangles of cell centers, then blurred; the coastline is put back where the map draws it.
2. Heights become meters: land reaches the chosen peak at height 100 through the map's height exponent, the sea floor reaches the chosen depth at 0. Seeded noise adds detail no finer than four pixels, fading out at the coast.
3. Biome borders get a fade: each pixel near a border learns the nearest other biome and a share that falls from about half at the border to none a third of a cell inside, pushed back and forth by noise so borders look ragged rather than stepped.
4. Lakes are hollowed under their surface, roads are levelled along an eased grade, then rivers are carved under a water surface that never rises downstream.

Map coordinates go to Godot meters with `x = pixel column × metersPerPixel`, `z = pixel row × metersPerPixel`, `y` up. Pixel `(0, 0)` is the region's top-left pixel center, which Terrain3D places at the origin. Places sit on the nearest dry pixel, so river burgs and ports stand on the bank.

## Contents

| File | Holds |
| --- | --- |
| `world.json` | format `fantasy-cartography-godot`, version, size, `metersPerPixel`, peak, sea depth, height range, region, biomes, file list |
| `heightmap.exr` | 32-bit float meters, uncompressed scanlines (R = G = B) |
| `biomes.png` | biome id per pixel, 8-bit gray |
| `biome_blend.png` | red: the neighbouring biome a pixel fades into, green: its share (0–255, about half on the border) |
| `colormap.png` | biome colors, water by depth |
| `masks/*.png` | `sea`, `lakes`, `rivers`, `roads`, `coast`, 0–255 |
| `rivers.json` | `[x, y, z]` points on the water surface, width per point in meters, name, type, discharge |
| `roads.json` | `[x, y, z]` points on the road bed, width, group, name |
| `lakes.json` | surface height and outline `[x, z]` |
| `places.json` | burgs and markers with positions on the ground |
| `political.json` | states (with their language) and provinces with outlines `[x, z]` and emblem files |
| `fauna_flora.json` | biomes and the species catalogue |
| `emblems/` | 256 px PNGs: `state_1.png`, `province_4.png`, `burg_12.png` |
| `world-spec.json` | seed, name and the World Wizard answers |
| `preview.glb` | coarse colored mesh, optional |

The encoders ([`encoders.ts`](../../src/services/io/godot/encoders.ts)) write EXR and PNG without dependencies; the zip uses JSZip.

## The addon

The addon reads the package and saves, under `res://cartography/<world>/`, the scene, the Terrain3D data directory, `terrain_assets.res` (one texture slot per biome tinted with its color, plus road and riverbed slots) and `world_data.res` (an `CartographyWorldData` with everything in the JSON files, the biome map and the emblems). Its control map takes the base texture from the biome and, as overlay, the riverbed or road where their masks are, elsewhere the neighbouring biome by its share; the material's blend sharpness is lowered so these fades stay soft. `godot/tests/test_import.gd` imports a package headless and checks heights, rivers, places and lookups.
