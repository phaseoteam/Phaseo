import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ProviderCredentialStore from "./ProviderCredentialStore.ts";
import { makePhaseoAuth } from "./PhaseoAuth.ts";
const encodeState = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

it.effect(
  "isolates OAuth accounts, rejects expired credentials and clears secrets on sign-out",
  () => {
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
    return Effect.gen(function* () {
      yield* TestClock.setTime(1_800_000_000_000);
      const firstId = ProviderInstanceId.make("phaseo-personal");
      const store = yield* ProviderCredentialStore.make("phaseo", firstId);
      yield* store.set(
        new TextEncoder().encode('{"key":"owned-fixture","expiresAt":"2099-01-01T00:00:00Z"}'),
      );
      const first = yield* makePhaseoAuth(firstId);
      const second = yield* makePhaseoAuth(ProviderInstanceId.make("phaseo-work"));
      assert.equal((yield* first.access).key, "owned-fixture");
      assert.isTrue(Option.isNone(yield* second.access.pipe(Effect.option)));
      const state = yield* first.controller
        .subscribe("client")
        .pipe(Stream.runHead, Effect.map(Option.getOrThrow));
      const serialized = yield* encodeState(state);
      assert.isFalse(serialized.includes("owned-fixture"));
      yield* store.set(
        new TextEncoder().encode('{"key":"expired","expiresAt":"2000-01-01T00:00:00Z"}'),
      );
      assert.isTrue(Option.isNone(yield* first.access.pipe(Effect.option)));
      yield* first.controller.logout(Effect.void);
      assert.equal(data.size, 0);
    }).pipe(
      Effect.scoped,
      Effect.provide(NodeServices.layer),
      Effect.provideService(ServerSecretStore.ServerSecretStore, secrets),
    );
  },
);
