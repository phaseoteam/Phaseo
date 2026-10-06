import * as NodeCrypto from "node:crypto";
import { NonNegativeInt, type GatewayUsage, type ServerSettings, type UsageSummaryInput } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as Secrets from "../auth/ServerSecretStore.ts";
import * as Credentials from "../provider/ProviderCredentialStore.ts";

const decodeCredentials = Schema.decodeUnknownEffect(Schema.fromJsonString(
  Schema.Struct({ key: Schema.NonEmptyString, expiresAt: Schema.String }),
));
const decodePage = Schema.decodeUnknownEffect(Schema.Struct({
  source_id: Schema.NonEmptyString,
  has_more: Schema.Boolean,
  rows: Schema.Array(Schema.Struct({
    request_id: Schema.NonEmptyString,
    input_tokens: Schema.NullOr(NonNegativeInt),
    output_tokens: Schema.NullOr(NonNegativeInt),
    cost_nanos: Schema.NullOr(NonNegativeInt),
  })),
}));
const hash = (value: string) => NodeCrypto.createHash("sha256").update(value).digest("hex");
const TTL = 5 * 60 * 1000;

export const make = Effect.gen(function* () {
  const secretStore = yield* Effect.serviceOption(Secrets.ServerSecretStore);
  const http = yield* HttpClient.HttpClient;
  const cache = new Map<string, { at: number; value: GatewayUsage }>();
  const inflight = new Map<string, Deferred.Deferred<GatewayUsage>>();
  return Effect.fn("UsageService.readGatewayUsage")(function* (
    input: UsageSummaryInput, settings: ServerSettings,
  ) {
    if (Option.isNone(secretStore)) return [];
    const now = yield* Clock.currentTimeMillis;
    const results: GatewayUsage[] = [];
    const seen = new Set<string>();
    for (const [id, instance] of Object.entries(settings.providerInstances)) {
      if (instance.driver !== "phaseo" || instance.enabled === false) continue;
      const store = yield* Credentials.make("phaseo", id).pipe(
        Effect.provideService(Secrets.ServerSecretStore, secretStore.value),
      );
      const saved = yield* store.get.pipe(Effect.option);
      if (Option.isNone(saved) || Option.isNone(saved.value)) continue;
      const credential = yield* decodeCredentials(new TextDecoder().decode(saved.value.value)).pipe(Effect.option);
      if (Option.isNone(credential) || Date.parse(credential.value.expiresAt) <= now ||
          !Number.isFinite(Date.parse(credential.value.expiresAt))) continue;
      const key = credential.value.key;
      const credentialId = hash(key);
      if (seen.has(credentialId)) continue;
      seen.add(credentialId);
      const midnight = (day: string) => {
        const year = Number(day.slice(0, 4));
        const month = Number(day.slice(5, 7));
        const date = Number(day.slice(8, 10));
        return DateTime.makeZonedUnsafe({ year, month, day: date, hour: 0, minute: 0, second: 0,
          millisecond: 0 }, { timeZone: input.timeZone, adjustForTimeZone: true });
      };
      const from = input.sinceTime ?? DateTime.formatIso(DateTime.toUtc(midnight(input.sinceDay)));
      const nextDay = DateTime.toEpochMillis(DateTime.add(midnight(input.untilDay), { days: 1 }));
      const to = input.untilTime ?? DateTime.formatIso(DateTime.makeUnsafe(Math.min(nextDay, now)));
      const cacheKey = `${credentialId}:${input.timeZone}:${input.sinceDay}:${input.untilDay}:${input.sinceTime ?? ""}:${input.untilTime ?? ""}`;
      const previous = cache.get(cacheKey);
      const unavailable: GatewayUsage = { sourceId: credentialId, label: instance.displayName || "Phaseo",
        status: "failed", inputTokens: 0, outputTokens: 0, chargedUsd: 0, requests: 0,
        missingUsage: 0, readAt: DateTime.formatIso(DateTime.makeUnsafe(now)) };
      const fetch = Effect.gen(function* () {
        const requestIds = new Set<string>();
        let value = { ...unavailable, status: "ok" as GatewayUsage["status"] };
        for (let offset = 0; offset < 10000; offset += 1000) {
          const response = yield* HttpClient.filterStatusOk(http).execute(
            HttpClientRequest.get("https://api.phaseo.app/desktop/usage").pipe(
              HttpClientRequest.setHeader("Authorization", `Bearer ${key}`),
              HttpClientRequest.setUrlParams({ from, to, offset: String(offset) }),
            ),
          );
          const page = yield* response.json.pipe(Effect.flatMap(decodePage));
          value.sourceId = page.source_id;
          for (const row of page.rows) {
            if (requestIds.has(row.request_id)) continue;
            requestIds.add(row.request_id);
            value.requests++;
            value.inputTokens += row.input_tokens ?? 0;
            value.outputTokens += row.output_tokens ?? 0;
            value.chargedUsd += (row.cost_nanos ?? 0) / 1e9;
            if (row.input_tokens === null || row.output_tokens === null || row.cost_nanos === null) value.missingUsage++;
          }
          if (!page.has_more) break;
          if (offset === 9000) value.status = "partial";
        }
        if (value.missingUsage > 0) value.status = "partial";
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { at: now, value });
        return value;
      }).pipe(Effect.timeout("10 seconds"), Effect.catch(() => Effect.sync(() => {
        const value = previous
          ? { ...previous.value, status: previous.value.status === "failed" ? "failed" as const : previous.value.status === "partial" ? "partial" as const : "cached" as const }
          : unavailable;
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { at: now, value });
        return value;
      })), Effect.ensuring(Effect.sync(() => inflight.delete(cacheKey))));
      const beginFetch = Effect.gen(function* () {
        const pending = inflight.get(cacheKey);
        if (pending) return pending;
        const created = Deferred.makeUnsafe<GatewayUsage>();
        inflight.set(cacheKey, created);
        yield* fetch.pipe(
          Effect.onExit(exit => Deferred.done(created, exit)),
          Effect.forkDetach,
        );
        return created;
      }).pipe(Effect.uninterruptible);
      if (previous) {
        results.push(previous.value);
        if (now - previous.at >= TTL) yield* beginFetch;
      } else {
        const pending = yield* beginFetch;
        results.push(yield* Deferred.await(pending));
      }
    }
    return results;
  });
});
