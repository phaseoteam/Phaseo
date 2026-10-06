import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Registry from "../provider/Services/ProviderInstanceRegistry.ts";
import * as CredentialStore from "../provider/ProviderCredentialStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ServerConfig from "../config.ts";
import * as EventSink from "./EventSink.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import { desktopSessionMetadata } from "./DesktopSessionMetadata.ts";

const decodeCredentials = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ key: Schema.String, expiresAt: Schema.String })),
);
const encodePayload = Schema.encodeEffect(Schema.fromJsonString(Schema.Json));

/** Local partitioning only. The gateway validates the token and determines ownership. */
export function desktopAccountPartition(key: string): string | undefined {
  try {
    const claims = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (
      typeof claims.sub !== "string" ||
      typeof claims.workspace_id !== "string" ||
      claims.client_id !== "phaseo_desktop"
    )
      return undefined;
    return NodeCrypto.createHash("sha256")
      .update(JSON.stringify([claims.sub, claims.workspace_id]))
      .digest("hex");
  } catch {
    return undefined;
  }
}

export const flushDesktopSessionQueue = Effect.fn("DesktopSessionSync.flush")(function* (current: {
  key: string;
  partition: string;
}) {
  const sql = yield* SqlClient.SqlClient;
  const http = yield* HttpClient.HttpClient;
  yield* sql`DELETE FROM desktop_session_sync WHERE julianday(updated_at) < julianday('now', '-30 days')`;
  const pending = yield* sql<{ turn_id: string; payload_json: string }>`
      SELECT turn_id, payload_json FROM desktop_session_sync
      WHERE account_id = ${current.partition} ORDER BY updated_at LIMIT 50`;
  for (const row of pending) {
    const accepted = yield* http
      .execute(
        HttpClientRequest.post("https://api.phaseo.app/desktop/session-turns").pipe(
          HttpClientRequest.setHeader("Authorization", `Bearer ${current.key}`),
          HttpClientRequest.bodyText(row.payload_json, "application/json"),
        ),
      )
      .pipe(
        Effect.flatMap((response) =>
          response.text.pipe(Effect.as(response.status >= 200 && response.status < 300)),
        ),
        Effect.timeout("10 seconds"),
        Effect.catch(() => Effect.succeed(false)),
      );
    if (!accepted) break;
    yield* sql`DELETE FROM desktop_session_sync WHERE account_id = ${current.partition}
        AND turn_id = ${row.turn_id} AND payload_json = ${row.payload_json}`;
  }
});

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const registry = yield* Registry.ProviderInstanceRegistry;
    const sink = yield* EventSink.EventSinkV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const environment = yield* ServerEnvironment.ServerEnvironment;
    const config = yield* ServerConfig.ServerConfig;
    const environmentId = yield* environment.getEnvironmentId;
    const account = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const instances = yield* registry.listInstances;
      const connected: Array<{ key: string; partition: string }> = [];
      for (const instance of instances) {
        if (instance.driverKind !== "phaseo" || !instance.enabled) continue;
        const store = yield* CredentialStore.make("phaseo", instance.instanceId);
        const saved = yield* store.get.pipe(Effect.option);
        if (Option.isNone(saved) || Option.isNone(saved.value)) continue;
        const decoded = yield* decodeCredentials(new TextDecoder().decode(saved.value.value)).pipe(
          Effect.option,
        );
        if (Option.isNone(decoded)) continue;
        const credentials = decoded.value;
        if (
          !Number.isFinite(Date.parse(credentials.expiresAt)) ||
          Date.parse(credentials.expiresAt) <= now
        )
          continue;
        const partition = desktopAccountPartition(credentials.key);
        if (partition) connected.push({ key: credentials.key, partition });
      }
      // Do not guess which workspace owns native sessions when accounts differ.
      return new Set(connected.map((entry) => entry.partition)).size === 1
        ? connected[0]
        : undefined;
    });
    const flush = Effect.gen(function* () {
      const current = yield* account;
      if (!current) return;
      yield* flushDesktopSessionQueue(current);
    }).pipe(Effect.catch(() => Effect.logWarning("Desktop session history sync will retry.")));
    const afterSequence = yield* sink.latestSequence();
    yield* sink.stream({ afterSequence, bounded: false }).pipe(
      Stream.map((stored) => stored.event),
      Stream.filter(
        (event) =>
          (event.type === "run.updated" || event.type === "provider-turn.updated") &&
          ["completed", "failed", "cancelled", "interrupted"].includes(event.payload.status),
      ),
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          const current = yield* account;
          if (!current) return;
          const projection = yield* projections.getThreadProjection(event.threadId);
          const instances = yield* registry.listInstances;
          const updatedAt = DateTime.formatIso(yield* DateTime.now);
          for (const run of projection.runs) {
            if (event.runId && run.id !== event.runId) continue;
            const provider = instances.find(
              (entry) => entry.instanceId === run.providerInstanceId,
            )?.driverKind;
            const payload = desktopSessionMetadata(
              projection,
              run,
              provider ?? "",
              environmentId,
              config.devUrl !== undefined,
            );
            if (!payload) continue;
            const payloadJson = yield* encodePayload(payload);
            yield* sql`INSERT INTO desktop_session_sync (account_id, turn_id, payload_json, updated_at)
          VALUES (${current.partition}, ${run.id}, ${payloadJson}, ${updatedAt})
          ON CONFLICT (account_id, turn_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at`;
          }
        }).pipe(Effect.catch(() => Effect.logWarning("Could not queue desktop session history."))),
      ),
      Effect.forkScoped,
    );
    yield* flush.pipe(Effect.repeat(Schedule.spaced("30 seconds")), Effect.forkScoped);
  }),
);
