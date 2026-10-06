import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { vi } from "vite-plus/test";
import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import * as ServerConfig from "../../config.ts";
import * as ServerSettings from "../../serverSettings.ts";
import * as IdAllocator from "../../orchestration-v2/IdAllocator.ts";
import * as CodexAdapter from "../../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as ServerSecretStore from "../../auth/ServerSecretStore.ts";
import * as CodexInstallation from "../CodexInstallation.ts";
import * as ProviderCredentialStore from "../ProviderCredentialStore.ts";
import { PhaseoDriver } from "./PhaseoDriver.ts";

// Both harnesses use the same OAuth/catalog; no fixture starts inference.
it.effect.each(["codex", "phaseo"] as const)(
  "%s: discovers gateway models, preserves runtime isolation and clears models on logout",
  (harness) => {
    const data = new Map<string, Uint8Array>();
    const secrets = ServerSecretStore.ServerSecretStore.of({
      get: (name) => Effect.sync(() => Option.fromUndefinedOr(data.get(name))),
      set: (name, value) =>
        Effect.sync(() => {
          data.set(name, value);
        }),
      remove: (name) =>
        Effect.sync(() => {
          data.delete(name);
        }),
      create: () => Effect.die("unused"),
      getOrCreateRandom: () => Effect.die("unused"),
    });
    let launch: Parameters<CodexAdapter.CodexAppServerClientFactoryShape["open"]>[0] | undefined;
    const executable = {
      executablePath: "/fixture/codex",
      version: "0.159.0",
      source: "managed" as const,
      managedVersionDirectory: null,
    };
    const resolveInstallation = vi.fn(() => Effect.succeed(executable));
    const acquireInstallation = vi.fn(() => Effect.succeed(executable));
    const layer = ServerConfig.layerTest(".", { prefix: "phaseo-driver-test-" }).pipe(
      Layer.provideMerge(NodeServices.layer),
      Layer.provideMerge(IdAllocator.layer),
      Layer.provideMerge(ServerSettings.layerTest()),
      Layer.provideMerge(Layer.succeed(ServerSecretStore.ServerSecretStore, secrets)),
      Layer.provideMerge(
        Layer.mock(CodexInstallation.CodexInstallation)({
          managedDirectory: "/fixture/managed-codex",
          resolve: resolveInstallation,
          acquire: acquireInstallation,
        }),
      ),
      Layer.provideMerge(
        Layer.mock(CodexAdapter.CodexAppServerClientFactory)({
          open: (input) => {
            launch = input;
            return Effect.die("Reached native boundary; never start inference in this fixture.");
          },
        }),
      ),
      Layer.provideMerge(
        Layer.mock(BackgroundPolicy.BackgroundPolicy)({
          shouldRunScopeWork: () => Effect.succeed(false),
        }),
      ),
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '{"ok":true,"offset":0,"total":1,"models":[{"id":"lab/model","name":"Gateway model","capabilities":{"endpoints":["text.generate"]},"offers":[{"routable":true}]}]}',
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    return Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("phaseo-driver-test");
      const store = yield* ProviderCredentialStore.make("phaseo", instanceId);
      yield* store.set(
        new TextEncoder().encode('{"key":"fixture-secret","expiresAt":"2099-01-01T00:00:00Z"}'),
      );
      const provider = yield* PhaseoDriver.create({
        instanceId,
        displayName: "Phaseo",
        accentColor: undefined,
        enabled: true,
        environment: [],
        config: { harness },
      });
      const snapshot = yield* provider.snapshot.refresh;
      assert.equal(snapshot.driver, "phaseo");
      assert.equal(snapshot.auth.status, "authenticated");
      assert.deepEqual(
        snapshot.models.map((model) => model.slug),
        ["lab/model"],
      );
      assert.equal(fetcher.mock.calls.length, 1);
      const state = yield* provider.auth!.subscribe("client").pipe(
        Stream.filter((state) => state.methods !== undefined),
        Stream.runHead,
        Effect.map(Option.getOrThrow),
      );
      assert.equal(state.methods?.[0]?.name, "Sign in to Phaseo");
      if (harness === "codex") {
        yield* provider.orchestrationAdapter
          .openSession({
            providerSessionId: ProviderSessionId.make("phaseo-session"),
            threadId: ThreadId.make("phaseo-thread"),
            runtimePolicy: { runtimeMode: "full-access", interactionMode: "default", cwd: null },
            modelSelection: { instanceId, model: "lab/model" },
          })
          .pipe(Effect.exit);
        assert.equal(launch?.environment?.PHASEO_GATEWAY_TOKEN, "fixture-secret");
        assert.include(launch?.settings.launchArgs ?? "", 'model_provider="phaseo"');
        assert.include(launch?.settings.homePath ?? "", "phaseo-driver-test");
      } else {
        assert.equal(snapshot.installed, true);
        assert.equal(snapshot.setup?.canInstall, false);
        assert.include(snapshot.runtimePaths?.homePath ?? "", "harness");
        assert.include(provider.continuationIdentity.continuationKey, ":native");
        assert.equal(resolveInstallation.mock.calls.length, 0);
        assert.equal(acquireInstallation.mock.calls.length, 0);
        assert.equal(launch, undefined);
      }
      yield* provider.auth!.logout(Effect.void);
      const disconnected = yield* provider.snapshot.refresh;
      assert.equal(disconnected.auth.status, "unauthenticated");
      assert.deepEqual(disconnected.models, []);
      assert.equal(data.size, 0);
    }).pipe(
      Effect.scoped,
      Effect.provide(layer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals())),
    );
  },
);
