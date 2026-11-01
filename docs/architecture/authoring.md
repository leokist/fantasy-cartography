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

## Migration

A map without `authoring` settings was made before the fork, whatever its version. `migrateAuthoringSettings` adds the defaults before the settings are applied, and `migrateAuthoringEntities` marks the entities its author locked as `edited` ([`auto-update.ts`](../../src/services/io/auto-update.ts)).
