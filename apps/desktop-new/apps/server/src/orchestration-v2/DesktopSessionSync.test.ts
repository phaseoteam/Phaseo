import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import {
  flushDesktopSessionQueue,
  resolveDesktopAccount,
  desktopAccountPartition,
} from "./DesktopSessionSync.ts";

it.effect.each(["failed", "accepted", "changed"] as const)(
  "keeps durable retries safe when delivery is %s",
  (scenario) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Persistence layer runs the actual migration; reports contain metadata only.
      yield* sql`INSERT INTO desktop_session_sync VALUES ('one','turn','{}','2099-01-01T00:00:00Z'), ('two','other','{}','2099-01-01T00:00:00Z')`;
      const client = HttpClient.make((request) =>
        Effect.gen(function* () {
          assert.equal(request.url, "https://api.phaseo.app/desktop/session-turns");
          if (scenario === "changed")
            yield* sql`UPDATE desktop_session_sync SET payload_json = '{"updated":true}' WHERE account_id = 'one'`;
          return HttpClientResponse.fromWeb(
            request,
            new Response("{}", { status: scenario === "failed" ? 503 : 200 }),
          );
        }).pipe(Effect.orDie),
      );
      yield* flushDesktopSessionQueue({ key: "fixture", partition: "one" }).pipe(
        Effect.provideService(HttpClient.HttpClient, client),
      );
      const rows = yield* sql<{
        account_id: string;
        payload_json: string;
      }>`SELECT account_id,payload_json FROM desktop_session_sync ORDER BY account_id`;
      assert.equal(rows.length, scenario === "accepted" ? 1 : 2);
      assert.equal(rows.at(-1)?.account_id, "two");
      if (scenario === "changed") assert.equal(rows[0]?.payload_json, '{"updated":true}');
    }).pipe(Effect.provide(SqlitePersistenceMemory)),
);

it.effect(
  "resolves opaque keys, caches verified ownership offline and preserves it across rotation",
  () =>
    Effect.gen(function* () {
      let calls = 0;
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          calls += 1;
          assert.equal(request.url, "https://api.phaseo.app/desktop/identity");
          return HttpClientResponse.fromWeb(
            request,
            Response.json({ user_id: "user", workspace_id: "workspace" }),
          );
        }),
      );
      const first = yield* resolveDesktopAccount("opaque-first").pipe(
        Effect.provideService(HttpClient.HttpClient, http),
      );
      const offline = HttpClient.make(() =>
        Effect.die("Cached identity must not contact the network"),
      );
      assert.equal(
        yield* resolveDesktopAccount("opaque-first").pipe(
          Effect.provideService(HttpClient.HttpClient, offline),
        ),
        first,
      );
      assert.equal(
        yield* resolveDesktopAccount("opaque-renewed").pipe(
          Effect.provideService(HttpClient.HttpClient, http),
        ),
        first,
      );
      assert.equal(first, desktopAccountPartition("user", "workspace"));
      assert.equal(calls, 2);
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{
        credential_id: string;
      }>`SELECT credential_id FROM desktop_session_accounts`;
      assert.equal(rows.length, 2);
      assert.isFalse(rows.some((row) => row.credential_id.includes("opaque")));
    }).pipe(Effect.provide(SqlitePersistenceMemory)),
);
