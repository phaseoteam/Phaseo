import { generatePhaseoText } from "@phaseo/desktop-harness";
import { TextGenerationError, type ModelSelection } from "@t3tools/contracts";
import { extractJsonObject } from "@t3tools/shared/schemaJson";
import { formatGeneratedBranchName } from "@t3tools/shared/git";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as TextGeneration from "./TextGeneration.ts";
import {
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildBranchNamePrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import {
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "./TextGenerationUtils.ts";

const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

export function makePhaseoTextGeneration(
  access: Effect.Effect<{ key: string }, import("@t3tools/contracts").ProviderSetupError>,
): TextGeneration.TextGeneration["Service"] {
  const generate = <A>(
    operation: string,
    model: ModelSelection,
    prepared: { prompt: string; outputSchema: Schema.Codec<A, unknown> },
  ) =>
    Effect.gen(function* () {
      const credentials = yield* access.pipe(
        Effect.mapError(
          () =>
            new TextGenerationError({ operation, detail: "Sign in to Phaseo to generate text." }),
        ),
      );
      const text = yield* Effect.tryPromise({
        try: (signal) =>
          generatePhaseoText({
            model: model.model,
            key: credentials.key,
            prompt: prepared.prompt,
            signal,
          }),
        catch: () =>
          new TextGenerationError({ operation, detail: "Phaseo text generation failed." }),
      });
      const json = yield* Effect.try({
        try: () => extractJsonObject(text),
        catch: () =>
          new TextGenerationError({
            operation,
            detail: "Phaseo returned invalid structured text.",
          }),
      });
      return yield* decodeJson(json).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(prepared.outputSchema)),
        Effect.mapError(
          () =>
            new TextGenerationError({
              operation,
              detail: "Phaseo returned invalid structured text.",
            }),
        ),
      );
    });
  return {
    generateCommitMessage: (input) =>
      generate(
        "generateCommitMessage",
        input.modelSelection,
        buildCommitMessagePrompt({ ...input, includeBranch: input.includeBranch === true }),
      ).pipe(
        Effect.map((result) => ({
          subject: sanitizeCommitSubject(result.subject),
          body: result.body.trim(),
          ...("branch" in result && typeof result.branch === "string"
            ? { branch: formatGeneratedBranchName(result.branch) }
            : {}),
        })),
      ),
    generatePrContent: (input) =>
      generate("generatePrContent", input.modelSelection, buildPrContentPrompt(input)).pipe(
        Effect.map((result) => ({
          title: sanitizePrTitle(result.title),
          body: result.body.trim(),
        })),
      ),
    generateBranchName: (input) =>
      generate("generateBranchName", input.modelSelection, buildBranchNamePrompt(input)).pipe(
        Effect.map((result) => ({
          branch: formatGeneratedBranchName(result.branch, input.naming),
        })),
      ),
    generateThreadTitle: (input) =>
      generate("generateThreadTitle", input.modelSelection, buildThreadTitlePrompt(input)).pipe(
        Effect.map((result) => ({
          title: sanitizeThreadTitle(result.title),
          needsRefinement: result.needsRefinement,
        })),
      ),
  };
}
