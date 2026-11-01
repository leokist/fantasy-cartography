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

## Declared cultures and states

`authoring.seeds` holds the cultures and states the author declared, each at a spot given in percent of the map, since the land is not known before generation. The wizard hands them to `WorldSeeds.planNext()` ([`seeds.ts`](../../src/model/authoring/seeds.ts)), and four pipeline steps apply them right after the generator makes the random ones, so everything downstream builds on them:

| Step | After | Does |
| --- | --- | --- |
| `cultureSeeds` | `cultures` | seed k renames culture k and moves its center to the nearest populated cell; it spreads in `culturesExpand` |
| `capitalSeeds` | `burgs` | seed k moves capital k, so state k is founded there; its culture can be a declared one |
| `stateSeeds` | `stateForms` | names, form, color and a picture emblem (`{ icon }`), after `stateForms` would rename them |
| `seedsFinish` | `legends` | marks what was seeded `authored` and releases the plan |

The wizard pins at least as many cultures and states as were declared. A seed with no culture or capital to take is skipped with a warning.

## Adding to a generated map

[`Additions`](../../src/model/authoring/additions.ts) founds a declared state or culture on the map on screen. The newcomer is unlocked while the unlocked entities are recalculated around it, then locked. Locked states keep their land, provinces and data unchanged: a locked state no longer grows when states expand, like a locked culture. Rebuilding provinces keeps the locked ones and those of locked states (`Provinces.generate(true)`), which `States.recalculate()` does not.

## Fauna and flora

`pack.species` ([`species-generator.ts`](../../src/model/nature/species-generator.ts)) is a catalogue of species: kind (fauna or flora), the biomes each lives in, rarity, danger and domestication for fauna, uses for flora, the goods it yields, an emoji icon and a description. The `species` step, after `goods`, fills it with the default species of the biomes on the map ([`data/species.ts`](../../src/data/species.ts)), keeping locked ones; `speciesSeeds` adds the ones declared in the wizard, or takes over a default of the same name and kind. Species are authorable entities like states. The Fauna and Flora editor (Tools) edits them and downloads them as JSON with biome and good names; the full and minimal JSON exports include them too.

The `.map` file keeps them in record 54, the fork's own record: `{ "species": [...] }`. Later fork data goes in the same object, so the fork takes one record slot from the upstream format.

## Migration

A map without `authoring` settings was made before the fork, whatever its version. `migrateAuthoringSettings` adds the defaults before the settings are applied (and `seeds` to maps from the first fork version), and `migrateAuthoringEntities` marks the entities its author locked as `edited`. A map without record 54 gets an empty one on load, then the default species of its biomes ([`auto-update.ts`](../../src/services/io/auto-update.ts)).
