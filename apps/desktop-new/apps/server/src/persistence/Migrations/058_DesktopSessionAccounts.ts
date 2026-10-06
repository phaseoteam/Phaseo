import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE desktop_session_accounts (
    credential_id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL
  )`;
});
