# World authoring (Fantasy Cartography fork)

The fork lets the author declare a world before generating it and keeps what they made when parts are regenerated. Two pieces carry it.

## World spec

`options.map.authoring` ([`world-spec.ts`](../../src/model/authoring/world-spec.ts)) is saved in the `.map` settings:

- `fields`: per setting, keyed by pin id (see `pinSchemas`), `{ mode: "set" | "random", value }`. `seed` is kept here too.
- `autoLock`: whether an entity the author edits is locked.

The [World Wizard](../../src/controllers/world-wizard.ts) groups the fields in steps ([`spec-fields.ts`](../../src/model/authoring/spec-fields.ts)). On generate it calls `Pins.overrideNext()` with the fields set by hand: for that one map the generator sees exactly those pins, the ones stored in the browser aside, and `Options.randomize()` releases them. After `map:generated` the wizard stores the spec in the new map.

## Entity origin

Lockable entities (`AUTHORABLE` in [`authoring.ts`](../../src/model/authoring/authoring.ts)) may carry `origin`:

| origin | meaning | locked |
| --- | --- | --- |
| absent | generated and untouched | as the user left it |
| `edited` | generated, then changed by the author | when `autoLock` is on |
| `authored` | added by the author | always |

`Authoring.install()` wraps the models' edit methods once at boot (`rename`, `recolor`, `set*`, `move*`…, but not `setLocked`, `setHidden`, `setPinned`) and their `add`/`create`. Every editor, CSV upload and Assistant change goes through those methods, so no editor records anything itself. Work the generator does on its own behalf runs inside `Authoring.untracked()`: every `Pipeline.run` and `MapRestoration.transaction` is wrapped that way.

## Start of a session

Nothing is generated on start-up unless the URL or the stored-map option asks for a map: the start menu ([`start-menu.ts`](../../src/app/chrome/start-menu.ts)) offers a random world or the World Wizard over the splash. `newWorld()` takes the start-up path for the first map of a session and replaces the map on screen afterwards.

Every map sits on the same latitude band (`GAME_GEOGRAPHY` in [`coordinates.ts`](../../src/model/physical/coordinates.ts)): warmer in the south, colder in the north, with no share of a globe or position on it. The Climate dialog sets the warm and cold ends and the precipitation.

## Declared world

`authoring.seeds` holds what the author declared, each at a spot given in percent of the map ([`world-spec.ts`](../../src/model/authoring/world-spec.ts)):

- **continents**: a name and a size;
- **countries** (`states`): capital spot and name, size, form, color, picture emblem, culture, continent, the countries it borders and its cities;
- **provinces**: the country they belong to, with relief, climate, water and nature (a biome), each optional;
- **cultures** and **species**.

When continents or countries are declared, the land is theirs ([`land.ts`](../../src/model/authoring/land.ts)): continents are ragged ellipses and countries circles of their size, with bridges between neighbours; elsewhere is sea. A province's weight is 1 over the part of the map nearer its spot than any other province's, blending across a ragged border and fading beyond its country's reach. The same weights shape the land, the climate and the provinces themselves. The generated map has exactly the declared countries.

| Step | After | Does |
| --- | --- | --- |
| `landSeeds` | `heightmap` | heights from continents, countries and province reliefs |
| `climateSeeds` | `temperatures` | temperatures pulled toward each province's climate, cooler with altitude |
| `waterSeeds` | `precipitation` | precipitation scaled by each province's water |
| `biomeSeeds` | `biomes` | the biome a province asks for, over its land |
| `cultureSeeds` | `cultures` | seed k renames culture k and moves its center; it spreads in `culturesExpand` |
| `settleSeeds` | `culturesExpand` | land no culture reached, such as a lone island, takes the nearest culture |
| `capitalSeeds` | `burgs` | seed k moves capital k, so country k is founded there |
| `stateSizes` | `states` | growth by size, the land of declared provinces claimed, declared borders joined |
| `citySeeds` | `religions` | the declared cities as burgs |
| `stateSeeds` | `stateForms` | names, form, color and a picture emblem (`{ icon }`) |
| `provinceSeeds` | `provinces` | a country with declared provinces is divided into them |
| `seedsFinish` | `legends` | marks what was seeded `authored` and releases the plan |

The helpers for one country (borders, cities, provinces, settling) are in [`country.ts`](../../src/model/authoring/country.ts).

## Adding to a generated map

[`Additions`](../../src/model/authoring/additions.ts) puts a declared country, culture or species on the map on screen. `addCountry` raises land first where the country's spot is sea, through the Risk heightmap edit, which rebuilds the map and carries every entity over; then it founds the country, grows it to its size, joins its borders and adds its cities and provinces. The newcomer is unlocked while the unlocked entities are recalculated around it, then locked. Locked states keep their land and data: a locked state no longer grows when states expand, like a locked culture. Rebuilding provinces keeps the locked ones and those of locked states (`Provinces.generate(true)`), renumbering them.

## Fauna and flora

`pack.species` ([`species-generator.ts`](../../src/model/nature/species-generator.ts)) is a catalogue of species: kind (fauna or flora), the biomes each lives in, rarity, danger and domestication for fauna, uses for flora, the goods it yields, an emoji icon and a description. The `species` step, after `goods`, fills it with the default species of the biomes on the map ([`data/species.ts`](../../src/data/species.ts)), keeping locked ones; `speciesSeeds` adds the ones declared in the wizard, or takes over a default of the same name and kind. Species are authorable entities like states. The Fauna and Flora editor (Tools) edits them and downloads them as JSON with biome and good names; the full and minimal JSON exports include them too.

The `.map` file keeps them in record 54, the fork's own record: `{ "species": [...] }`. Later fork data goes in the same object, so the fork takes one record slot from the upstream format.

## Migration

A map without `authoring` settings was made before the fork, whatever its version. `migrateAuthoringSettings` adds the defaults before the settings are applied (and `seeds` to maps from the first fork version), and `migrateAuthoringEntities` marks the entities its author locked as `edited`. A map without record 54 gets an empty one on load, then the default species of its biomes ([`auto-update.ts`](../../src/services/io/auto-update.ts)).
