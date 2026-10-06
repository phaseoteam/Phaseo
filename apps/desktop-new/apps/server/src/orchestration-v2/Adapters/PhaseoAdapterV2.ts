import {
  ProviderDriverKind,
  OrchestrationV2UserInputQuestion,
  type ProviderInstanceId,
  type ProviderSetupError,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { resolveSelfInvocation, selfInvocationArgs } from "@t3tools/shared/nodeRuntime";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as AcpErrors from "effect-acp/errors";
import * as AcpSessionRuntime from "../../provider/acp/AcpSessionRuntime.ts";
import * as ServerConfig from "../../config.ts";
import * as IdAllocator from "../IdAllocator.ts";
import * as ProviderContinuationRequests from "../ProviderContinuationRequests.ts";
import { AcpProviderCapabilitiesV2, makeAcpAdapterV2 } from "./AcpAdapterV2.ts";

const DRIVER = ProviderDriverKind.make("phaseo");
const encodeModels = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Array(Schema.Struct({ slug: Schema.String, name: Schema.String }))),
);
const PhaseoQuestion = Schema.Struct({
  sessionId: Schema.String,
  nativeItemId: Schema.String,
  questions: Schema.Array(OrchestrationV2UserInputQuestion).check(Schema.isMaxLength(3)),
});
export type PhaseoAdapterV2Env =
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ServerConfig.ServerConfig
  | IdAllocator.IdAllocatorV2
  | ChildProcessSpawner.ChildProcessSpawner;

export const createPhaseoAdapterV2 = Effect.fn("createPhaseoAdapterV2")(function* (options: {
  instanceId: ProviderInstanceId;
  environment: NodeJS.ProcessEnv;
  resolve: Effect.Effect<
    { key: string; homePath: string; models: ReadonlyArray<ServerProviderModel> },
    ProviderSetupError,
    Scope.Scope
  >;
}) {
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const idAllocator = yield* IdAllocator.IdAllocatorV2;
  const server = yield* ServerConfig.ServerConfig;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const invocation = yield* resolveSelfInvocation();
  const continuation = yield* ProviderContinuationRequests.ProviderContinuationRequests;
  return makeAcpAdapterV2({
    instanceId: options.instanceId,
    crypto,
    fileSystem: fs,
    idAllocator,
    serverConfig: server,
    selfInvocation: invocation,
    continuationRequests: continuation,
    flavor: {
      driver: DRIVER,
      runtimeHarness: "phaseo-agent-sdk",
      supportsImagePrompts: true,
      preferResumeSession: true,
      capabilities: {
        ...AcpProviderCapabilitiesV2,
        sessions: { ...AcpProviderCapabilitiesV2.sessions, supportsModelSwitchInSession: true },
        threads: {
          ...AcpProviderCapabilitiesV2.threads,
          canForkThread: true,
          canReadThreadSnapshot: true,
        },
        tools: { ...AcpProviderCapabilitiesV2.tools, supportsMcpTools: true },
      },
      sessionModeForPolicy: (policy) => (policy.interactionMode === "plan" ? "plan" : "default"),
      registerExtensions: ({ runtime, requestUserInput }) =>
        runtime.handleExtRequest("_phaseo/ask_user", PhaseoQuestion, (input, context) =>
          requestUserInput(
            {
              nativeItemId: input.nativeItemId,
              nativeRequestId: input.nativeItemId,
              questions: input.questions,
            },
            context,
          ).pipe(
            Effect.flatMap((result) =>
              Effect.succeed(result.answers).pipe(
                Effect.tap(() => result.acknowledgeNativeResponse),
              ),
            ),
          ),
        ),
      makeRuntime: ({ runtimePolicy: _policy, processEnvironment, ...input }) =>
        Effect.gen(function* () {
          const runtime = yield* options.resolve.pipe(
            Effect.mapError(
              (cause) => new AcpErrors.AcpSpawnError({ command: "phaseo-harness", cause }),
            ),
          );
          yield* fs
            .makeDirectory(runtime.homePath, { recursive: true })
            .pipe(
              Effect.mapError(
                (cause) => new AcpErrors.AcpSpawnError({ command: "phaseo-harness", cause }),
              ),
            );
          const models = yield* encodeModels(runtime.models).pipe(
            Effect.mapError(
              (cause) => new AcpErrors.AcpSpawnError({ command: "phaseo-harness", cause }),
            ),
          );
          // Every concurrent chat gets its own metadata file; one launch cannot
          // observe another launch's partially written catalog.
          const modelsFile = yield* fs
            .makeTempFileScoped({ directory: runtime.homePath, prefix: "models-" })
            .pipe(
              Effect.mapError(
                (cause) => new AcpErrors.AcpSpawnError({ command: "phaseo-harness", cause }),
              ),
            );
          yield* fs
            .writeFileString(modelsFile, models)
            .pipe(
              Effect.mapError(
                (cause) => new AcpErrors.AcpSpawnError({ command: "phaseo-harness", cause }),
              ),
            );
          const environment: NodeJS.ProcessEnv = {
            ...options.environment,
            ...processEnvironment,
            PHASEO_HARNESS_HOME: runtime.homePath,
            PHASEO_GATEWAY_TOKEN: runtime.key,
            PHASEO_HARNESS_MODELS: modelsFile,
            // Electron's Node runtime is also used by T3's scoped MCP bridge.
            ELECTRON_RUN_AS_NODE: "1",
          };
          delete environment.OPENAI_API_KEY;
          delete environment.OPENAI_BASE_URL;
          delete environment.ACCESS_TOKEN;
          delete environment.T3CODE_CODEX_LAUNCH_ARGS;
          const context = yield* Layer.build(
            AcpSessionRuntime.layer({
              ...input,
              spawn: {
                command: invocation.command,
                args: selfInvocationArgs(invocation, ["phaseo-harness"]),
                env: environment,
              },
              resumeMethod: "resume",
              cancelBehavior: "wait-for-prompt",
              ownDetachedProcessGroup: true,
              ownDescendantProcessGroups: true,
            }).pipe(Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner))),
          );
          return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
            Effect.provide(context),
          );
        }),
    },
  });
});
