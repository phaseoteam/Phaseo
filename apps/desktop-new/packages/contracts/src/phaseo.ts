import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

// The endpoint and OAuth client are owned by the integration, never user-supplied.
export const PhaseoSettings = Schema.Struct({
  // Missing values are accounts created before the native Phaseo harness shipped.
  harness: Schema.Literals(["phaseo", "codex"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("codex")),
    Schema.annotateKey({
      title: "Harness",
      providerSettingsForm: {
        control: "select",
        options: [
          { value: "phaseo", label: "Phaseo" },
          { value: "codex", label: "Codex" },
        ],
      },
    }),
  ),
});
export type PhaseoSettings = typeof PhaseoSettings.Type;
