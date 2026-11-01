// How the author asked for the world: per setting, a value they set or a request to roll it

import { z } from "zod";

export const FIELD_MODES = ["set", "random"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

const field = z.strictObject({ mode: z.enum(FIELD_MODES), value: z.unknown().optional() });

export const authoringSchema = z.strictObject({
  autoLock: z.boolean(), // an entity the author edits is locked, so regeneration keeps it
  fields: z.record(z.string(), field) // keyed by pin id, see `pinSchemas`
});

export type AuthoringData = z.infer<typeof authoringSchema>;
export type SpecField = z.infer<typeof field>;

export const getDefaultAuthoring = (): AuthoringData => ({ autoLock: true, fields: {} });
