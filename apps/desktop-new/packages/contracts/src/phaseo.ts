import * as Schema from "effect/Schema";

// The endpoint and OAuth client are owned by the integration, never user-supplied.
export const PhaseoSettings = Schema.Struct({});
export type PhaseoSettings = typeof PhaseoSettings.Type;
