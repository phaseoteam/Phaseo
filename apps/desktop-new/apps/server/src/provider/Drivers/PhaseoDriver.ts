import {
  CodexSettings,
  PhaseoSettings,
  ProviderDriverKind,
  ProviderSetupError,
  TextGenerationError,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ServerConfig from "../../config.ts";
import * as ServerSettings from "../../serverSettings.ts";
import {
  createCodexAdapterV2,
  type CodexAdapterV2DriverEnv,
} from "../../orchestration-v2/Adapters/CodexAdapterV2.ts";
import type { ChildProcessSpawner } from "effect/unstable/process";
import type * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import type * as ServerSecretStore from "../../auth/ServerSecretStore.ts";
import { makeCodexTextGeneration } from "../../textGeneration/CodexTextGeneration.ts";
import { makePhaseoTextGeneration } from "../../textGeneration/PhaseoTextGeneration.ts";
import {
  createPhaseoAdapterV2,
  type PhaseoAdapterV2Env,
} from "../../orchestration-v2/Adapters/PhaseoAdapterV2.ts";
import * as CodexInstallation from "../CodexInstallation.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makePhaseoAuth } from "../PhaseoAuth.ts";
import { PhaseoModelCache } from "../PhaseoModels.ts";
import { phaseoRuntime } from "../PhaseoRuntime.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import { buildServerProvider } from "../providerSnapshot.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";

const DRIVER = ProviderDriverKind.make("phaseo");
const decodeConfig = Schema.decodeSync(CodexSettings);
type PhaseoDriverEnv =
  | CodexAdapterV2DriverEnv
  | PhaseoAdapterV2Env
  | BackgroundPolicy.BackgroundPolicy
  | FileSystem.FileSystem
  | Path.Path
  | ServerConfig.ServerConfig
  | ServerSettings.ServerSettingsService
  | ChildProcessSpawner.ChildProcessSpawner
  | ServerSecretStore.ServerSecretStore
  | Crypto.Crypto
  | CodexInstallation.CodexInstallation;

/** Phaseo owns the gateway and native harness; Codex remains an optional runtime for existing accounts. */
export const PhaseoDriver: ProviderDriver<PhaseoSettings, PhaseoDriverEnv> = {
  driverKind: DRIVER,
  metadata: { displayName: "Phaseo", supportsMultipleInstances: true },
  configSchema: PhaseoSettings,
  defaultConfig: () => ({ harness: "phaseo" }),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config: phaseoConfig }) =>
    Effect.gen(function* () {
      const server = yield* ServerConfig.ServerConfig;
      const settings = yield* ServerSettings.ServerSettingsService;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const installation = yield* CodexInstallation.CodexInstallation;
      const auth = yield* makePhaseoAuth(instanceId);
      const catalog = new PhaseoModelCache();
      const homePath = path.join(server.stateDir, "providers", "phaseo", instanceId);
      const nativeHomePath = path.join(homePath, "harness");
      const native = phaseoConfig.harness === "phaseo";
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER,
        instanceId,
      });
      const config = decodeConfig({ homePath, enabled });
      const processEnvironment = mergeProviderInstanceEnvironment(environment);
      const resolve = Effect.gen(function* () {
        const credentials = yield* auth.access;
        const executable = yield* installation.acquire().pipe(
          Effect.mapError(
            () =>
              new ProviderSetupError({
                instanceId,
                operation: "runtime",
                detail: "Install the Phaseo agent runtime in provider settings.",
              }),
          ),
        );
        yield* fs.makeDirectory(homePath, { recursive: true }).pipe(
          Effect.mapError(
            () =>
              new ProviderSetupError({
                instanceId,
                operation: "runtime",
                detail: "Could not prepare the Phaseo agent profile.",
              }),
          ),
        );
        return phaseoRuntime({
          binaryPath: executable.executablePath,
          homePath,
          key: credentials.key,
          enabled,
          environment: processEnvironment,
        });
      });
      const draft = (
        input: {
          installed: boolean;
          version: string | null;
          signedIn: boolean;
          models: ServerProvider["models"];
          message?: string;
        },
        checkedAt: string,
      ): ServerProvider => ({
        ...buildServerProvider({
          enabled,
          checkedAt,
          presentation: {
            displayName: displayName ?? "Phaseo",
            supportedRuntimeModes: ["full-access", "approval-required"],
            supportsConversationRollback: true,
          },
          models: input.models,
          probe: {
            installed: input.installed,
            version: input.version,
            status: input.signedIn && input.installed ? "ready" : "warning",
            auth: {
              status: input.signedIn ? "authenticated" : "unauthenticated",
              label: "Phaseo",
              canLogout: input.signedIn,
            },
            ...(input.message ? { message: input.message } : {}),
          },
        }),
        instanceId,
        driver: DRIVER,
        ...(accentColor ? { accentColor } : {}),
        continuation: {
          groupKey: native
            ? `${continuationIdentity.continuationKey}:native`
            : continuationIdentity.continuationKey,
        },
        setup: { canAuthenticate: true, canInstall: !native },
        runtimePaths: { homePath: native ? nativeHomePath : homePath, shadowHomePath: null },
      });
      const checkAccount = Effect.gen(function* () {
        const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
        const executable = native
          ? Option.none()
          : yield* installation.resolve().pipe(Effect.option);
        const credentials = yield* auth.access.pipe(Effect.option);
        const installed = native || Option.isSome(executable);
        const version = native
          ? "0.1.0"
          : Option.isSome(executable)
            ? executable.value.version
            : null;
        if (!enabled || Option.isNone(credentials)) {
          catalog.clear();
          return draft(
            {
              installed,
              version,
              signedIn: false,
              models: [],
              message: "Sign in to Phaseo to connect the gateway.",
            },
            checkedAt,
          );
        }
        const discovered = yield* Effect.tryPromise({
          try: (signal) =>
            catalog.get(
              credentials.value.key,
              AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
            ),
          catch: () =>
            new ProviderSetupError({
              instanceId,
              operation: "models",
              detail: "Could not update Phaseo models.",
            }),
        }).pipe(Effect.option);
        return draft(
          {
            installed,
            version,
            signedIn: true,
            models: Option.isSome(discovered) ? discovered.value : catalog.stale(),
            ...(!installed
              ? { message: "Install the Phaseo agent runtime to start chatting." }
              : Option.isNone(discovered)
                ? { message: "Could not update Phaseo models. Retrying in the background." }
                : {}),
          },
          checkedAt,
        );
      });
      // Account changes interrupt discovery as well as native sessions, so an old
      // request cannot republish connected models after sign-out.
      const check = auth.controller.withAccess!(checkAccount).pipe(
        Effect.scoped,
        Effect.catch(() =>
          Effect.map(DateTime.now, (now) =>
            draft(
              {
                installed: false,
                version: null,
                signedIn: false,
                models: [],
                message: "Phaseo sign-in is changing.",
              },
              DateTime.formatIso(now),
            ),
          ),
        ),
      );
      const snapshot = yield* makeManagedServerProvider({
        resolveMaintenance: () =>
          Effect.succeed({ provider: DRIVER, packageName: null, update: null }),
        getSettings: settings.getSettings,
        streamSettings: settings.streamChanges,
        haveSettingsChanged: () => false,
        initialSnapshot: () =>
          Effect.map(DateTime.now, (now) =>
            draft(
              { installed: false, version: null, signedIn: false, models: [] },
              DateTime.formatIso(now),
            ),
          ),
        checkProvider: check,
        refreshInterval: "10 minutes",
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER,
              instanceId,
              detail: "Could not prepare Phaseo.",
              cause,
            }),
        ),
      );
      yield* auth.controller.subscribe("phaseo-snapshot").pipe(
        Stream.filter((state) =>
          ["idle", "succeeded", "failed", "cancelled"].includes(state.phase),
        ),
        Stream.runForEach(() => snapshot.refresh.pipe(Effect.ignoreCause({ log: true }))),
        Effect.forkScoped,
      );
      const adapterError = (cause: unknown) =>
        new ProviderDriverError({
          driver: DRIVER,
          instanceId,
          detail: "Could not prepare the Phaseo agent.",
          cause,
        });
      const adapter = native
        ? yield* createPhaseoAdapterV2({
            instanceId,
            environment: processEnvironment,
            resolve: Effect.gen(function* () {
              const credentials = yield* auth.access;
              const models = (yield* snapshot.getSnapshot).models;
              if (!models.length)
                return yield* new ProviderSetupError({
                  instanceId,
                  operation: "models",
                  detail: "Phaseo models are still loading. Try again shortly.",
                });
              return { key: credentials.key, homePath: nativeHomePath, models };
            }),
          }).pipe(Effect.mapError(adapterError))
        : yield* createCodexAdapterV2(
            { instanceId, displayName, accentColor, environment, enabled, config },
            {
              resolveRuntime: resolve,
              threadConfig: (threadId) =>
                threadId ? { "model_providers.phaseo.http_headers.X-Session-Id": threadId } : {},
            },
          ).pipe(Effect.mapError(adapterError));
      const nativeGeneration = native
        ? makePhaseoTextGeneration(auth.access)
        : yield* makeCodexTextGeneration(
            config,
            undefined,
            snapshot.getSnapshot.pipe(Effect.map((value) => value.models)),
            resolve,
          );
      const protect = <A>(operation: string, task: Effect.Effect<A, TextGenerationError>) =>
        auth.controller.withAccess!(task).pipe(
          Effect.scoped,
          Effect.mapError(
            () =>
              new TextGenerationError({
                operation,
                detail: "Phaseo text generation failed. Check your account and agent runtime.",
              }),
          ),
        );
      const textGeneration: ProviderInstance["textGeneration"] = {
        generateCommitMessage: (input) =>
          protect("generateCommitMessage", nativeGeneration.generateCommitMessage(input)),
        generatePrContent: (input) =>
          protect("generatePrContent", nativeGeneration.generatePrContent(input)),
        generateBranchName: (input) =>
          protect("generateBranchName", nativeGeneration.generateBranchName(input)),
        generateThreadTitle: (input) =>
          protect("generateThreadTitle", nativeGeneration.generateThreadTitle(input)),
      };
      return {
        instanceId,
        driverKind: DRIVER,
        displayName,
        accentColor,
        enabled,
        continuationIdentity: native
          ? {
              ...continuationIdentity,
              continuationKey: `${continuationIdentity.continuationKey}:native`,
            }
          : continuationIdentity,
        snapshot,
        orchestrationAdapter: adapter,
        textGeneration,
        auth: auth.controller,
      };
    }),
};
