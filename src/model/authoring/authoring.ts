// Where each entity came from: declared by the author, edited by them, or left as generated (no origin)

import { Routes } from "@/model/economy/routes-generator";
import { MapRestoration } from "@/model/map-restoration";
import { Rivers } from "@/model/physical/river-generator";
import { Pipeline } from "@/model/pipeline";
import { Burgs } from "@/model/political/burgs-generator";
import { Provinces } from "@/model/political/provinces-generator";
import { States } from "@/model/political/states-generator";
import { Cultures } from "@/model/society/cultures-generator";
import { Religions } from "@/model/society/religions-generator";
import { Journeys } from "@/model/story/journeys/journeys-generator";
import { Markers } from "@/model/story/markers-generator";

export type EntityOrigin = "authored" | "edited";

interface Authorable {
  i: number;
  lock?: boolean;
  origin?: EntityOrigin;
  removed?: boolean;
}

type Method = (...args: unknown[]) => unknown;

export const AUTHORABLE = [
  "states",
  "provinces",
  "cultures",
  "religions",
  "burgs",
  "routes",
  "rivers",
  "markers",
  "journeys"
] as const;
export type AuthorableCollection = (typeof AUTHORABLE)[number];

// the first four and burgs keep id 0 for "none"
const ZERO_IS_NONE = new Set<AuthorableCollection>(["states", "provinces", "cultures", "religions", "burgs"]);
const EDITS = /^(rename|recolor|set[A-Z]\w*|move\w*|declareIndependence|addSegment|removeSegment|resetSegment)$/;
const NOT_EDITS = new Set(["setLocked", "setHidden", "setPinned"]);
const ADDS = new Set(["add", "create"]);

const MODELS: Record<AuthorableCollection, object> = {
  states: States,
  provinces: Provinces,
  cultures: Cultures,
  religions: Religions,
  burgs: Burgs,
  routes: Routes,
  rivers: Rivers,
  markers: Markers,
  journeys: Journeys
};

class AuthoringModule {
  private installed = false;
  private suspended = 0;

  /** The live entity of a collection, or undefined for a removed one or the "none" slot */
  find(collection: AuthorableCollection, id: number): Authorable | undefined {
    if (!Number.isInteger(id) || id < 0 || (id === 0 && ZERO_IS_NONE.has(collection))) return undefined;
    const list = (pack[collection] ?? []) as (Authorable | number | undefined)[];
    const entity = list.find(item => typeof item === "object" && item?.i === id) as Authorable | undefined;
    return entity && !entity.removed ? entity : undefined;
  }

  origin(collection: AuthorableCollection, id: number): EntityOrigin | "generated" | undefined {
    const entity = this.find(collection, id);
    return entity ? (entity.origin ?? "generated") : undefined;
  }

  /** The author declared it: always locked */
  markAuthored(collection: AuthorableCollection, id: number): void {
    const entity = this.find(collection, id);
    if (!entity) return;
    entity.origin = "authored";
    entity.lock = true;
  }

  /** The author changed it: locked too unless the map turns that off */
  markEdited(collection: AuthorableCollection, id: number): void {
    const entity = this.find(collection, id);
    if (!entity) return;
    if (entity.origin !== "authored") entity.origin = "edited";
    if (options.map.authoring.autoLock) entity.lock = true;
  }

  /** Run work the generator does on its own behalf: nothing it touches counts as the author's */
  untracked<T>(work: () => T): T {
    this.suspended++;
    let result: T;
    try {
      result = work();
    } catch (error) {
      this.suspended--;
      throw error;
    }
    if (result instanceof Promise) return result.finally(() => this.suspended--) as T;
    this.suspended--;
    return result;
  }

  get tracking(): boolean {
    return this.suspended === 0;
  }

  /** Wrap the models' edit methods once, so every editor, upload and Assistant change is recorded */
  install(): void {
    if (this.installed) return;
    this.installed = true;

    for (const collection of AUTHORABLE) this.track(collection, MODELS[collection]);
    this.suspendWhile(Pipeline.prototype, "run");
    this.suspendWhile(MapRestoration, "transaction");
  }

  private track(collection: AuthorableCollection, model: object): void {
    const methods = model as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(model))) {
      const isEdit = EDITS.test(name) && !NOT_EDITS.has(name);
      const isAdd = ADDS.has(name);
      const original = methods[name];
      if ((!isEdit && !isAdd) || typeof original !== "function") continue;

      const record = (args: unknown[], result: unknown): void => {
        if (!this.tracking) return;
        if (isEdit && typeof args[0] === "number") this.markEdited(collection, args[0]);
        if (isAdd) {
          const id = typeof result === "number" ? result : (result as Authorable | undefined)?.i;
          if (typeof id === "number") this.markAuthored(collection, id);
        }
      };

      methods[name] = function (this: unknown, ...args: unknown[]): unknown {
        const result = (original as Method).apply(this, args);
        if (result instanceof Promise)
          return result.then(value => {
            record(args, value);
            return value;
          });
        record(args, result);
        return result;
      };
    }
  }

  private suspendWhile(owner: object, name: string): void {
    const methods = owner as Record<string, unknown>;
    const original = methods[name] as Method;
    const authoring = this;
    methods[name] = function (this: unknown, ...args: unknown[]): unknown {
      return authoring.untracked(() => original.apply(this, args));
    };
  }
}

export const Authoring = new AuthoringModule();
