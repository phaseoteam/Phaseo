#!/usr/bin/env -S npx tsx
// import-supabase-users.ts: copy Supabase Auth users into Better Auth's tables in schema `auth` (0001_auth.sql).
//
// What it writes (database/planetscale/README.md, "Identity model"):
//   auth.users     one row per Supabase auth.users row, same uuid. email (lowercased), email_verified (from
//                  email_confirmed_at), name and image (from raw_user_meta_data), raw_user_meta_data,
//                  raw_app_meta_data, created_at, updated_at, last_sign_in_at, deleted_at, is_anonymous, banned /
//                  ban_expires (from banned_until, if still in the future), and mfa_reenrollment_required for users
//                  with a verified MFA factor (TOTP secrets can't be carried over; aal.ts makes them enrol again).
//   auth.accounts  provider `credential` (account_id = user id, as Better Auth expects) holding the Supabase bcrypt
//                  `encrypted_password` unchanged; password.ts verifies it and rehashes it with scrypt on the first
//                  password sign-in. One row per google / github / gitlab identity, account_id = the identity's
//                  provider_id (Google `sub`, GitHub and GitLab numeric user id), which is the key Better Auth's
//                  providers return. Supabase `email` identities are the password login, covered by `credential`.
//   auth.passkeys  one row per auth.webauthn_credentials row, same uuid. credential_id as base64url and public_key
//                  (COSE) as base64, the encodings @better-auth/passkey stores. They verify only while Better Auth's
//                  passkey RP ID is the one Supabase used (`phaseo.app` on prod), so set PASSKEY_RP_ID=phaseo.app.
// Never exported or written: TOTP secrets, recovery/confirmation tokens, provider tokens, identity_data.
//
// Input (pick one):
//   --from-supabase       read the source directly over $SUPABASE_DB_URL (a read-only transaction running the
//                         SELECTs in SOURCE_QUERIES below; the role needs SELECT on those auth tables)
//   --from-dir <dir>      read users.json, identities.json, mfa_factors.json and webauthn_credentials.json (a JSON array
//                         each, or the same names with .ndjson, one object per line). Print the psql commands that
//                         make them with --print-export-sql. The files hold password hashes: keep them out of the
//                         repo and delete them after the import.
// Target: $PLANETSCALE_DIRECT_URL, or --target-url <url>. Use the direct connection (port 5432) as the role that owns
// the auth tables (the migration role): the import alters a trigger on auth.users, which only the owner may do.
//
// Flags:
//   --dry-run             run every statement in the transaction, print the counts, then roll back
//   --allow-live          import even though auth.sessions has rows (Better Auth is already serving sign-ins; a
//                         re-import would overwrite profile fields changed since). Off by default.
//   --json                print the summary as JSON
//
// Run from the repo root after `pnpm install` (pg comes from apps/web):
//   pnpm --filter @phaseo/web exec tsx ../../database/planetscale/scripts/import-supabase-users.ts --from-supabase --dry-run
//
// Behaviour:
//   * One transaction. Any error rolls everything back, including the trigger change below.
//   * Idempotent: users and passkeys upsert on id, accounts on (provider_id, account_id). A re-run updates rows in
//     place and reports them as "updated". It never deletes: users removed from Supabase since an earlier run are
//     only counted ("in target, not in export"). Rows owned by a different user are an error, never reassigned.
//     A credential whose password Better Auth has already rehashed (not bcrypt any more) is left alone.
//   * The signup trigger. 0002_baseline.sql has `on_auth_user_created_enqueue_welcome` AFTER INSERT ON auth.users,
//     running public.handle_auth_user_created(), which inserts public.users (user_id). (Its Discord webhook moved to
//     Better Auth's databaseHooks.user.create.after, signup.ts, which raw SQL never fires; the welcome email is sent
//     by finalizePostLogin, not by the database.) The import must not provision public.users: those rows, with their
//     real settings, come from the data copy, and default rows created here would make that copy hit duplicate keys.
//     So the import runs `ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created_enqueue_welcome` inside its
//     transaction and re-enables it (restoring its previous mode) before commit.
//     Why not `SET LOCAL session_replication_role = replica`: it needs superuser (or GRANT SET ON PARAMETER), which a
//     PlanetScale role may not have, and it switches off every ordinary trigger, including the foreign-key triggers,
//     so a bad user_id would load silently. The targeted ALTER needs only table ownership, is transactional (a
//     rollback restores the trigger), and keeps foreign keys enforced. Its SHARE ROW EXCLUSIVE lock blocks other
//     writers to auth.users until commit; nothing should be writing during the import, and lock_timeout is 10s.
//     Any other user trigger on auth.users still fires and is listed in the output.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------------------------------
// Source shapes (Supabase Auth, checked against prod's information_schema on 2026-11-03)

type Timestamp = string | Date | null | undefined;
type Json = Record<string, unknown>;

export type SupabaseUser = {
  id: string;
  email: string | null;
  encrypted_password?: string | null;
  email_confirmed_at?: Timestamp;
  raw_user_meta_data?: Json | null;
  raw_app_meta_data?: Json | null;
  created_at?: Timestamp;
  updated_at?: Timestamp;
  last_sign_in_at?: Timestamp;
  banned_until?: Timestamp;
  deleted_at?: Timestamp;
  is_anonymous?: boolean | null;
  is_sso_user?: boolean | null;
};

export type SupabaseIdentity = {
  id?: string;
  user_id: string;
  provider: string;
  provider_id: string;
  created_at?: Timestamp;
  updated_at?: Timestamp;
};

export type SupabaseMfaFactor = {
  id?: string;
  user_id: string;
  factor_type: string;
  status: string;
};

/** bytea arrives as a Buffer from pg, or as Postgres' `\x…` hex text from json_agg. */
type Bytes = Buffer | Uint8Array | string;

export type SupabaseWebauthnCredential = {
  id: string;
  user_id: string;
  credential_id: Bytes;
  public_key: Bytes;
  aaguid?: string | null;
  sign_count?: number | string | null;
  transports?: string[] | string | null;
  backup_eligible?: boolean | null;
  backed_up?: boolean | null;
  friendly_name?: string | null;
  created_at?: Timestamp;
};

export type SupabaseAuthExport = {
  users: SupabaseUser[];
  identities: SupabaseIdentity[];
  mfaFactors: SupabaseMfaFactor[];
  webauthnCredentials: SupabaseWebauthnCredential[];
};

/** Column-limited on purpose: no tokens, no TOTP secrets, no identity_data. */
export const SOURCE_QUERIES = {
  users: `select id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at,
    updated_at, last_sign_in_at, banned_until, deleted_at, is_anonymous, is_sso_user
    from auth.users order by created_at, id`,
  identities: `select id, user_id, provider, provider_id, created_at, updated_at
    from auth.identities order by created_at, id`,
  mfa_factors: `select id, user_id, factor_type::text as factor_type, status::text as status
    from auth.mfa_factors order by created_at, id`,
  webauthn_credentials: `select id, user_id, credential_id, public_key, aaguid, sign_count, transports, backup_eligible,
    backed_up, friendly_name, created_at
    from auth.webauthn_credentials order by created_at, id`,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Plan: validate and map, no database

export const OAUTH_PROVIDERS = ["google", "github", "gitlab"] as const;
export const SIGNUP_TRIGGER = "on_auth_user_created_enqueue_welcome";
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image: string | null;
  created_at: string;
  updated_at: string;
  raw_user_meta_data: Json;
  raw_app_meta_data: Json;
  last_sign_in_at: string | null;
  deleted_at: string | null;
  is_anonymous: boolean;
  banned: boolean;
  ban_expires: string | null;
  mfa_reenrollment_required: boolean;
};

export type AccountRow = {
  provider_id: string;
  account_id: string;
  user_id: string;
  password: string | null;
  created_at: string;
  updated_at: string;
};

export type PasskeyRow = {
  id: string;
  name: string | null;
  public_key: string;
  user_id: string;
  credential_id: string;
  counter: number;
  device_type: "singleDevice" | "multiDevice";
  backed_up: boolean;
  transports: string | null;
  created_at: string;
  aaguid: string | null;
};

export type ImportPlan = {
  users: UserRow[];
  accounts: AccountRow[];
  passkeys: PasskeyRow[];
  source: {
    users: number;
    identities: Record<string, number>;
    verifiedMfaFactors: Record<string, number>;
    webauthnCredentials: number;
  };
  mfaReenrollmentRequired: number;
  skippedIdentities: Record<string, number>;
  warnings: string[];
};

export class ImportValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Supabase export failed validation:\n  - ${problems.join("\n  - ")}`);
    this.name = "ImportValidationError";
    this.problems = problems;
  }
}

function iso(value: Timestamp): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid timestamp ${String(value)}`);
  return date.toISOString();
}

function firstText(meta: Json, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function toBuffer(value: Bytes): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string" && /^\\x([0-9a-fA-F]{2})*$/.test(value)) return Buffer.from(value.slice(2), "hex");
  throw new Error("expected bytea as a Buffer or as \\x-prefixed hex");
}

function count(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function planImport(input: SupabaseAuthExport, now: Date = new Date()): ImportPlan {
  const problems: string[] = [];
  const warnings: string[] = [];
  const userIds = new Set(input.users.map((user) => user.id));

  const verifiedMfa = new Map<string, string[]>();
  const verifiedMfaFactors: Record<string, number> = {};
  for (const factor of input.mfaFactors) {
    if (factor.status !== "verified") continue;
    count(verifiedMfaFactors, factor.factor_type);
    if (!userIds.has(factor.user_id)) {
      warnings.push(`verified ${factor.factor_type} factor for unknown user ${factor.user_id} ignored`);
      continue;
    }
    verifiedMfa.set(factor.user_id, [...(verifiedMfa.get(factor.user_id) ?? []), factor.factor_type]);
  }
  for (const type of Object.keys(verifiedMfaFactors)) {
    if (type !== "totp") warnings.push(`${verifiedMfaFactors[type]} verified ${type} MFA factor(s): flagged for re-enrolment, not ported`);
  }

  const users: UserRow[] = [];
  const accounts: AccountRow[] = [];
  const emails = new Map<string, string>();
  for (const user of input.users) {
    const meta = (user.raw_user_meta_data ?? {}) as Json;
    const email = user.email?.trim().toLowerCase() ?? "";
    if (!email) {
      problems.push(`user ${user.id} has no email (Better Auth requires one)`);
      continue;
    }
    const clash = emails.get(email);
    if (clash) problems.push(`users ${clash} and ${user.id} share the email ${email} (case-insensitive)`);
    emails.set(email, user.id);
    if (user.is_sso_user) warnings.push(`user ${user.id} is an SSO user; no SSO provider is imported`);

    const createdAt = iso(user.created_at) ?? now.toISOString();
    const bannedUntil = iso(user.banned_until);
    const banned = bannedUntil !== null && new Date(bannedUntil) > now;
    const mfa = verifiedMfa.has(user.id);
    users.push({
      id: user.id,
      name: firstText(meta, ["full_name", "name", "user_name", "preferred_username"]) ?? email.split("@")[0],
      email,
      email_verified: Boolean(user.email_confirmed_at),
      image: firstText(meta, ["avatar_url", "picture"]),
      created_at: createdAt,
      updated_at: iso(user.updated_at) ?? createdAt,
      raw_user_meta_data: meta,
      raw_app_meta_data: (user.raw_app_meta_data ?? {}) as Json,
      last_sign_in_at: iso(user.last_sign_in_at),
      deleted_at: iso(user.deleted_at),
      is_anonymous: Boolean(user.is_anonymous),
      banned,
      ban_expires: banned ? bannedUntil : null,
      mfa_reenrollment_required: mfa,
    });

    const hash = user.encrypted_password?.trim();
    if (hash) {
      if (!BCRYPT_HASH.test(hash)) problems.push(`user ${user.id} has a password hash that is not bcrypt`);
      accounts.push({
        provider_id: "credential",
        account_id: user.id,
        user_id: user.id,
        password: hash,
        created_at: createdAt,
        updated_at: iso(user.updated_at) ?? createdAt,
      });
    }
  }

  const identities: Record<string, number> = {};
  const skippedIdentities: Record<string, number> = {};
  const accountKeys = new Set<string>();
  for (const identity of input.identities) {
    count(identities, identity.provider);
    if (!userIds.has(identity.user_id)) {
      problems.push(`${identity.provider} identity ${identity.provider_id} belongs to unknown user ${identity.user_id}`);
      continue;
    }
    if (identity.provider === "email") {
      // The password login; the credential account above carries it (and its hash).
      count(skippedIdentities, "email (covered by credential)");
      continue;
    }
    if (!(OAUTH_PROVIDERS as readonly string[]).includes(identity.provider)) {
      count(skippedIdentities, identity.provider);
      warnings.push(`${identity.provider} identity of user ${identity.user_id} not imported (provider not configured)`);
      continue;
    }
    const accountId = String(identity.provider_id ?? "").trim();
    if (!accountId) {
      problems.push(`${identity.provider} identity of user ${identity.user_id} has no provider_id`);
      continue;
    }
    const key = `${identity.provider}\u0000${accountId}`;
    if (accountKeys.has(key)) {
      problems.push(`duplicate ${identity.provider} identity ${accountId}`);
      continue;
    }
    accountKeys.add(key);
    const createdAt = iso(identity.created_at) ?? now.toISOString();
    accounts.push({
      provider_id: identity.provider,
      account_id: accountId,
      user_id: identity.user_id,
      password: null,
      created_at: createdAt,
      updated_at: iso(identity.updated_at) ?? createdAt,
    });
  }

  const passkeys: PasskeyRow[] = [];
  const credentialIds = new Set<string>();
  for (const credential of input.webauthnCredentials) {
    if (!userIds.has(credential.user_id)) {
      problems.push(`passkey ${credential.id} belongs to unknown user ${credential.user_id}`);
      continue;
    }
    let credentialId: string;
    let publicKey: string;
    try {
      credentialId = toBuffer(credential.credential_id).toString("base64url");
      publicKey = toBuffer(credential.public_key).toString("base64");
    } catch (error) {
      problems.push(`passkey ${credential.id}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (credentialIds.has(credentialId)) problems.push(`duplicate passkey credential id ${credentialId}`);
    credentialIds.add(credentialId);
    const transports =
      typeof credential.transports === "string" ? (JSON.parse(credential.transports) as unknown) : credential.transports;
    const transportList = Array.isArray(transports) ? transports.filter((t): t is string => typeof t === "string") : [];
    passkeys.push({
      id: credential.id,
      name: credential.friendly_name?.trim() || null,
      public_key: publicKey,
      user_id: credential.user_id,
      credential_id: credentialId,
      counter: Number(credential.sign_count ?? 0),
      device_type: credential.backup_eligible ? "multiDevice" : "singleDevice",
      backed_up: Boolean(credential.backed_up),
      transports: transportList.length ? transportList.join(",") : null,
      created_at: iso(credential.created_at) ?? now.toISOString(),
      aaguid: credential.aaguid ?? null,
    });
  }

  if (problems.length) throw new ImportValidationError(problems);
  return {
    users,
    accounts,
    passkeys,
    source: {
      users: input.users.length,
      identities,
      verifiedMfaFactors,
      webauthnCredentials: input.webauthnCredentials.length,
    },
    mfaReenrollmentRequired: users.filter((user) => user.mfa_reenrollment_required).length,
    skippedIdentities,
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Write

export type SqlClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

type Written = { inserted: number; updated: number };

export type ImportSummary = {
  mode: "dry-run" | "committed";
  source: ImportPlan["source"];
  written: { users: Written; accounts: Record<string, Written>; passkeys: Written };
  mfaReenrollmentRequired: number;
  skippedIdentities: Record<string, number>;
  usersInTargetNotInExport: number;
  signupTrigger: string;
  otherAuthUserTriggers: string[];
  warnings: string[];
};

const ENABLE_BY_MODE: Record<string, string> = { O: "ENABLE", A: "ENABLE ALWAYS", R: "ENABLE REPLICA" };

const UPSERT_USERS = `
with input as (
  select * from jsonb_to_recordset($1::jsonb) as r(
    id uuid, name text, email text, email_verified boolean, image text, created_at timestamptz, updated_at timestamptz,
    raw_user_meta_data jsonb, raw_app_meta_data jsonb, last_sign_in_at timestamptz, deleted_at timestamptz,
    is_anonymous boolean, banned boolean, ban_expires timestamptz, mfa_reenrollment_required boolean)
)
insert into auth.users as u (id, name, email, email_verified, image, created_at, updated_at, raw_user_meta_data,
  raw_app_meta_data, last_sign_in_at, deleted_at, is_anonymous, banned, ban_expires, mfa_reenrollment_required)
select id, name, email, email_verified, image, created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
  last_sign_in_at, deleted_at, is_anonymous, banned, ban_expires, mfa_reenrollment_required
from input
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  email_verified = excluded.email_verified,
  image = excluded.image,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  raw_user_meta_data = excluded.raw_user_meta_data,
  raw_app_meta_data = excluded.raw_app_meta_data,
  last_sign_in_at = greatest(u.last_sign_in_at, excluded.last_sign_in_at),
  deleted_at = excluded.deleted_at,
  is_anonymous = excluded.is_anonymous,
  banned = excluded.banned,
  ban_expires = excluded.ban_expires,
  -- someone who already enrolled TOTP in Better Auth no longer needs to
  mfa_reenrollment_required = excluded.mfa_reenrollment_required and not coalesce(u.two_factor_enabled, false)
returning (xmax = 0) as inserted`;

// A password Better Auth has already rehashed (no longer bcrypt) is newer than the export: keep it.
const UPSERT_ACCOUNTS = `
with input as (
  select * from jsonb_to_recordset($1::jsonb) as r(
    provider_id text, account_id text, user_id uuid, password text, created_at timestamptz, updated_at timestamptz)
)
insert into auth.accounts as a (provider_id, account_id, user_id, password, created_at, updated_at)
select provider_id, account_id, user_id, password, created_at, updated_at from input
on conflict (provider_id, account_id) do update set
  password = case when a.password is null or a.password like '$2%' then excluded.password else a.password end,
  updated_at = excluded.updated_at
where a.user_id = excluded.user_id
returning provider_id, (xmax = 0) as inserted`;

const UPSERT_PASSKEYS = `
with input as (
  select * from jsonb_to_recordset($1::jsonb) as r(
    id uuid, name text, public_key text, user_id uuid, credential_id text, counter integer, device_type text,
    backed_up boolean, transports text, created_at timestamptz, aaguid text)
)
insert into auth.passkeys as p (id, name, public_key, user_id, credential_id, counter, device_type, backed_up,
  transports, created_at, aaguid)
select id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, created_at, aaguid
from input
on conflict (id) do update set
  name = excluded.name,
  public_key = excluded.public_key,
  credential_id = excluded.credential_id,
  counter = greatest(p.counter, excluded.counter),
  device_type = excluded.device_type,
  backed_up = excluded.backed_up,
  transports = excluded.transports,
  aaguid = excluded.aaguid
where p.user_id = excluded.user_id
returning (xmax = 0) as inserted`;

function tally(rows: Array<{ inserted: boolean }>): Written {
  const inserted = rows.filter((row) => row.inserted).length;
  return { inserted, updated: rows.length - inserted };
}

export async function importSupabaseUsers(
  client: SqlClient,
  plan: ImportPlan,
  options: { dryRun?: boolean; allowLive?: boolean } = {},
): Promise<ImportSummary> {
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '10s'");
    await client.query("set local statement_timeout = '120s'");

    const missing = await client.query(
      `select t from unnest(array['auth.users', 'auth.accounts', 'auth.passkeys', 'auth.sessions']) as t
       where to_regclass(t) is null`,
    );
    if (missing.rows.length) {
      throw new Error(`target lacks ${missing.rows.map((row) => row.t).join(", ")}; apply 0000 and 0001 first`);
    }
    const sessions = await client.query("select count(*)::int as n from auth.sessions");
    if (sessions.rows[0].n > 0 && !options.allowLive) {
      throw new Error(
        `auth.sessions has ${sessions.rows[0].n} rows, so Better Auth is already live on this database; ` +
          "re-importing would overwrite changes made since. Pass --allow-live to import anyway.",
      );
    }

    const triggers = await client.query(
      `select tgname, tgenabled from pg_catalog.pg_trigger
       where tgrelid = 'auth.users'::regclass and not tgisinternal order by tgname`,
    );
    const signup = triggers.rows.find((row) => row.tgname === SIGNUP_TRIGGER);
    const otherAuthUserTriggers = triggers.rows
      .filter((row) => row.tgname !== SIGNUP_TRIGGER && row.tgenabled !== "D")
      .map((row) => String(row.tgname));
    const restore = signup && signup.tgenabled !== "D" ? ENABLE_BY_MODE[String(signup.tgenabled)] : undefined;
    if (restore) await client.query(`alter table auth.users disable trigger ${SIGNUP_TRIGGER}`);

    const users = tally((await client.query(UPSERT_USERS, [JSON.stringify(plan.users)])).rows);
    if (users.inserted + users.updated !== plan.users.length) throw new Error("user upsert wrote fewer rows than planned");

    const accountRows = (await client.query(UPSERT_ACCOUNTS, [JSON.stringify(plan.accounts)])).rows;
    if (accountRows.length !== plan.accounts.length) {
      const owned = await client.query(
        `select a.provider_id, a.account_id, a.user_id, r.user_id as wanted
         from jsonb_to_recordset($1::jsonb) as r(provider_id text, account_id text, user_id uuid)
         join auth.accounts a using (provider_id, account_id) where a.user_id <> r.user_id`,
        [JSON.stringify(plan.accounts)],
      );
      throw new Error(
        `${plan.accounts.length - accountRows.length} account(s) already belong to another user: ` +
          owned.rows.map((row) => `${row.provider_id}:${row.account_id} (has ${row.user_id}, export says ${row.wanted})`).join("; "),
      );
    }
    const accounts: Record<string, Written> = {};
    for (const provider of [...new Set(plan.accounts.map((row) => row.provider_id))].sort()) {
      accounts[provider] = tally(accountRows.filter((row) => row.provider_id === provider));
    }

    if (plan.passkeys.length) {
      const clash = await client.query(
        `select p.credential_id from auth.passkeys p
         join jsonb_to_recordset($1::jsonb) as r(id uuid, credential_id text) using (credential_id)
         where p.id <> r.id`,
        [JSON.stringify(plan.passkeys)],
      );
      if (clash.rows.length) throw new Error(`${clash.rows.length} passkey credential id(s) already exist under another row`);
    }
    const passkeyRows = plan.passkeys.length
      ? (await client.query(UPSERT_PASSKEYS, [JSON.stringify(plan.passkeys)])).rows
      : [];
    if (passkeyRows.length !== plan.passkeys.length) throw new Error("some passkeys already belong to another user");

    if (restore) await client.query(`alter table auth.users ${restore} trigger ${SIGNUP_TRIGGER}`);
    const after = await client.query(
      "select tgenabled from pg_catalog.pg_trigger where tgrelid = 'auth.users'::regclass and tgname = $1",
      [SIGNUP_TRIGGER],
    );
    if (signup && after.rows[0]?.tgenabled !== signup.tgenabled) throw new Error("signup trigger was not restored");

    const stale = await client.query("select count(*)::int as n from auth.users where id <> all($1::uuid[])", [
      plan.users.map((user) => user.id),
    ]);

    await client.query(options.dryRun ? "rollback" : "commit");
    return {
      mode: options.dryRun ? "dry-run" : "committed",
      source: plan.source,
      written: { users, accounts, passkeys: tally(passkeyRows) },
      mfaReenrollmentRequired: plan.mfaReenrollmentRequired,
      skippedIdentities: plan.skippedIdentities,
      usersInTargetNotInExport: stale.rows[0].n,
      signupTrigger: !signup
        ? "not present"
        : restore
          ? `${SIGNUP_TRIGGER} disabled for the import, restored (${restore.toLowerCase()})`
          : `${SIGNUP_TRIGGER} was already disabled; left as is`,
      otherAuthUserTriggers,
      warnings: plan.warnings,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Input loading

const FILES = {
  users: "users",
  identities: "identities",
  mfaFactors: "mfa_factors",
  webauthnCredentials: "webauthn_credentials",
} as const;

function readRows(dir: string, base: string): unknown[] {
  const json = path.join(dir, `${base}.json`);
  const ndjson = path.join(dir, `${base}.ndjson`);
  if (fs.existsSync(json)) {
    const parsed = JSON.parse(fs.readFileSync(json, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`${json} must hold a JSON array`);
    return parsed;
  }
  if (fs.existsSync(ndjson)) {
    return fs
      .readFileSync(ndjson, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
  }
  // Absent tables (no passkeys, no MFA) are allowed; users are not.
  if (base === FILES.users) throw new Error(`neither ${json} nor ${ndjson} exists`);
  return [];
}

export function readExportDir(dir: string): SupabaseAuthExport {
  return {
    users: readRows(dir, FILES.users) as SupabaseUser[],
    identities: readRows(dir, FILES.identities) as SupabaseIdentity[],
    mfaFactors: readRows(dir, FILES.mfaFactors) as SupabaseMfaFactor[],
    webauthnCredentials: readRows(dir, FILES.webauthnCredentials) as SupabaseWebauthnCredential[],
  };
}

export async function readFromSupabase(client: SqlClient): Promise<SupabaseAuthExport> {
  await client.query("begin transaction isolation level repeatable read read only");
  try {
    const run = async (sql: string) => (await client.query(sql)).rows;
    const result = {
      users: (await run(SOURCE_QUERIES.users)) as SupabaseUser[],
      identities: (await run(SOURCE_QUERIES.identities)) as SupabaseIdentity[],
      mfaFactors: (await run(SOURCE_QUERIES.mfa_factors)) as SupabaseMfaFactor[],
      webauthnCredentials: (await run(SOURCE_QUERIES.webauthn_credentials)) as SupabaseWebauthnCredential[],
    };
    return result;
  } finally {
    await client.query("rollback").catch(() => {});
  }
}

export function exportCommands(): string {
  return Object.entries(SOURCE_QUERIES)
    .map(([name, sql]) => {
      const oneLine = sql.replace(/\s+/g, " ").trim();
      return `psql "$SUPABASE_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select coalesce(json_agg(t), '[]'::json) from (${oneLine}) t" > ${name}.json`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

function loadPg(): any {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../../../apps/web/package.json"), path.join(here, "package.json")];
  for (const candidate of candidates) {
    try {
      return createRequire(candidate)("pg");
    } catch {
      // try the next one
    }
  }
  throw new Error("cannot load `pg`; run `pnpm install` (apps/web depends on it)");
}

function targetConfig(raw: string) {
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  for (const param of ["sslmode", "sslrootcert", "sslnegotiation"]) url.searchParams.delete(param);
  return {
    connectionString: url.toString(),
    application_name: "phaseo-import-supabase-users",
    ssl: local ? false : { rejectUnauthorized: true },
  };
}

function printSummary(summary: ImportSummary) {
  const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(32)} ${value}`);
  const fmt = (w: Written) => `${w.inserted} inserted, ${w.updated} updated`;
  console.log(summary.mode === "dry-run" ? "DRY RUN (rolled back)" : "Imported (committed)");
  line("source users", summary.source.users);
  line("source identities", JSON.stringify(summary.source.identities));
  line("source verified MFA factors", JSON.stringify(summary.source.verifiedMfaFactors));
  line("source passkeys", summary.source.webauthnCredentials);
  line("auth.users", fmt(summary.written.users));
  for (const [provider, written] of Object.entries(summary.written.accounts)) line(`auth.accounts ${provider}`, fmt(written));
  line("auth.passkeys", fmt(summary.written.passkeys));
  line("mfa_reenrollment_required", summary.mfaReenrollmentRequired);
  line("identities not imported", JSON.stringify(summary.skippedIdentities));
  line("in target, not in export", summary.usersInTargetNotInExport);
  line("signup trigger", summary.signupTrigger);
  if (summary.otherAuthUserTriggers.length) line("other auth.users triggers FIRED", summary.otherAuthUserTriggers.join(", "));
  for (const warning of summary.warnings) console.log(`  warning: ${warning}`);
}

async function main(argv: string[]) {
  const has = (flag: string) => argv.includes(flag);
  const valueOf = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (has("--print-export-sql")) {
    console.log(exportCommands());
    return;
  }
  const fromDir = valueOf("--from-dir");
  if (Boolean(fromDir) === has("--from-supabase")) throw new Error("pass exactly one of --from-dir <dir> or --from-supabase");
  const targetUrl = valueOf("--target-url") ?? process.env.PLANETSCALE_DIRECT_URL;
  if (!targetUrl) throw new Error("set PLANETSCALE_DIRECT_URL or pass --target-url");

  const pg = loadPg();
  let input: SupabaseAuthExport;
  if (fromDir) {
    input = readExportDir(path.resolve(fromDir));
  } else {
    const sourceUrl = process.env.SUPABASE_DB_URL;
    if (!sourceUrl) throw new Error("--from-supabase needs SUPABASE_DB_URL");
    const source = new pg.Client({ connectionString: sourceUrl, application_name: "phaseo-export-auth-users" });
    await source.connect();
    try {
      input = await readFromSupabase(source);
    } finally {
      await source.end();
    }
  }

  const plan = planImport(input);
  const target = new pg.Client(targetConfig(targetUrl));
  await target.connect();
  try {
    const summary = await importSupabaseUsers(target, plan, { dryRun: has("--dry-run"), allowLive: has("--allow-live") });
    if (has("--json")) console.log(JSON.stringify(summary, null, 2));
    else printSummary(summary);
  } finally {
    await target.end();
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
