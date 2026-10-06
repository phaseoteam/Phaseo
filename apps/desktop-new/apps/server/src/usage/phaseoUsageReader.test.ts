import { assert, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, UsageDay } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import * as ServerSettings from "../serverSettings.ts";
import * as Secrets from "../auth/ServerSecretStore.ts";
import { make } from "./phaseoUsageReader.ts";
const credentials = new TextEncoder().encode('{"key":"opaque","expiresAt":"2099-01-01T00:00:00Z"}');

it.effect("deduplicates keys and requests, converts nanos, caches data and never uploads", () => Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-10-06T12:00:00Z"));
  let calls = 0;
  const client = HttpClient.make(request => Effect.sync(() => {
    calls++;
    assert.equal(request.urlParams.params.find(([name]) => name === "from")?.[1], "2026-09-30T23:00:00.000Z");
    assert.equal(request.method, "GET"); assert.equal(request.url, "https://api.phaseo.app/desktop/usage");
    return HttpClientResponse.fromWeb(request, Response.json({ source_id: "workspace:key", has_more: false, rows: [
      { request_id: "req", input_tokens: 10, output_tokens: 2, cost_nanos: 1000000000 },
      { request_id: "req", input_tokens: 10, output_tokens: 2, cost_nanos: 1000000000 },
      { request_id: "missing", input_tokens: null, output_tokens: null, cost_nanos: null },
    ] }));
  }));
  const secrets = Secrets.ServerSecretStore.of({
    get: () => Effect.succeed(Option.some(credentials)),
    set: () => Effect.void, create: () => Effect.void, remove: () => Effect.void,
    getOrCreateRandom: () => Effect.succeed(new Uint8Array()),
  });
  const read = yield* make.pipe(Effect.provideService(HttpClient.HttpClient, client), Effect.provideService(Secrets.ServerSecretStore, secrets));
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const settings = yield* settingsService.getSettings;
  const window = { sinceDay: UsageDay.make("2026-10-01"), untilDay: UsageDay.make("2026-10-06"), timeZone: "Europe/London" };
  const [first, simultaneous] = yield* Effect.all([read(window, settings), read(window, settings)], { concurrency: 2 });
  assert.deepEqual(simultaneous, first);
  assert.equal(first.length, 1); assert.equal(first[0]?.chargedUsd, 1);
  assert.equal(first[0]?.inputTokens, 10); assert.equal(first[0]?.requests, 2);
  assert.equal(first[0]?.status, "partial");
  assert.deepEqual(yield* read(window, settings), first); assert.equal(calls, 1);
}).pipe(Effect.provide(ServerSettings.layerTest({ providerInstances: {
  [ProviderInstanceId.make("phaseo")]: { driver: ProviderDriverKind.make("phaseo") },
  [ProviderInstanceId.make("phaseo-copy")]: { driver: ProviderDriverKind.make("phaseo") },
} }))));

it.effect("keeps unavailable gateway data distinct from zero and drops disconnected credentials", () => Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-10-06T12:00:00Z"));
  let connected = true;
  let calls = 0;
  const client = HttpClient.make(request => Effect.sync(() => {
    calls++;
    return HttpClientResponse.fromWeb(request, new Response("{}", { status: 503 }));
  }));
  const secrets = Secrets.ServerSecretStore.of({
    get: () => Effect.sync(() => connected ? Option.some(credentials) : Option.none()),
    set: () => Effect.void, create: () => Effect.void, remove: () => Effect.void,
    getOrCreateRandom: () => Effect.succeed(new Uint8Array()),
  });
  const read = yield* make.pipe(Effect.provideService(HttpClient.HttpClient, client), Effect.provideService(Secrets.ServerSecretStore, secrets));
  const service = yield* ServerSettings.ServerSettingsService;
  const settings = yield* service.getSettings;
  const window = { sinceDay: UsageDay.make("2026-10-01"), untilDay: UsageDay.make("2026-10-06"), timeZone: "UTC" };
  const unavailable = yield* read(window, settings);
  assert.equal(unavailable[0]?.status, "failed");
  assert.deepEqual(yield* read(window, settings), unavailable); assert.equal(calls, 1);
  connected = false;
  assert.deepEqual(yield* read(window, settings), []); assert.equal(calls, 1);
}).pipe(Effect.provide(ServerSettings.layerTest({ providerInstances: {
  [ProviderInstanceId.make("phaseo")]: { driver: ProviderDriverKind.make("phaseo") },
} }))));
