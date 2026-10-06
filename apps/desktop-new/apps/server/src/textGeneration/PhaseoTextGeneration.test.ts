import { assert, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";
import { generatePhaseoText } from "@phaseo/desktop-harness";
import { makePhaseoTextGeneration } from "./PhaseoTextGeneration.ts";

vi.mock("@phaseo/desktop-harness", () => ({ generatePhaseoText: vi.fn() }));

it.effect("decodes structured native titles and preserves refinement", () => {
  vi.mocked(generatePhaseoText).mockResolvedValue(
    '```json\n{"title":"Native harness","needsRefinement":true}\n```',
  );
  return makePhaseoTextGeneration(Effect.succeed({ key: "fixture" }))
    .generateThreadTitle({
      cwd: ".",
      message: "Build this",
      modelSelection: { instanceId: ProviderInstanceId.make("phaseo"), model: "lab/model" },
    })
    .pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          assert.deepEqual(result, { title: "Native harness", needsRefinement: true });
          assert.equal(vi.mocked(generatePhaseoText).mock.calls.at(-1)?.[0].model, "lab/model");
        }),
      ),
    );
});

it.effect("rejects malformed native title output", () => {
  vi.mocked(generatePhaseoText).mockResolvedValue('{"title":42}');
  return makePhaseoTextGeneration(Effect.succeed({ key: "fixture" }))
    .generateThreadTitle({
      cwd: ".",
      message: "Build this",
      modelSelection: { instanceId: ProviderInstanceId.make("phaseo"), model: "lab/model" },
    })
    .pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => assert.equal(error.detail, "Phaseo returned invalid structured text.")),
      ),
    );
});
