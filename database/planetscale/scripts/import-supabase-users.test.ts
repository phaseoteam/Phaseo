// Tests for import-supabase-users.ts and the Supabase bcrypt path in apps/web/src/lib/auth/better-auth/password.ts.
//
//   pnpm --filter @phaseo/web exec tsx --test ../../database/planetscale/scripts/import-supabase-users.test.ts
//
// The unit tests need nothing else. The database tests need a PostgreSQL 17 server:
//   PS_IMPORT_TEST_DATABASE_URL  superuser connection to a maintenance database on an existing server, or
//   PS_AUTH_PG_DIR               a tools dir with node_modules/@embedded-postgres/<platform> (default E:/tmp/ps-auth-pg on
//                                Windows, <tmp>/ps-auth-pg elsewhere); a cluster is created there on first use.
// Without either they are skipped. Each run creates a fresh database (phaseo_import_test_*) and drops it at the end.
// It applies 0000_platform.sql and 0001_auth.sql, a one-column public.users stub, and the real
// handle_auth_user_created() function and signup trigger sliced out of 0002_baseline.sql.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ImportValidationError,
  SIGNUP_TRIGGER,
  importSupabaseUsers,
  planImport,
  toBuffer,
  type SupabaseAuthExport,
} from "./import-supabase-users.ts";
import {
  isLegacyBcryptHash,
  upgradeLegacyPasswordHash,
  verifyStoredPassword,
} from "../../../apps/web/src/lib/auth/better-auth/password.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.resolve(here, "../migrations");
// Dependencies the importer doesn't have itself resolve from apps/web, where pnpm installs them.
const webRequire = createRequire(path.resolve(here, "../../../apps/web/package.json"));
const bcrypt = webRequire("bcryptjs");
const importFromWeb = async (specifier: string) => import(pathToFileURL(webRequire.resolve(specifier)).href);

// ---------------------------------------------------------------------------------------------------------------
// Fixture: what a Supabase export looks like (prod shapes; values made up)

const PASSWORD = "correct horse battery staple";
const ids = {
  password: "00000000-0000-4000-8000-000000000001",
  google: "00000000-0000-4000-8000-000000000002",
  githubMfa: "00000000-0000-4000-8000-000000000003",
  gitlab: "00000000-0000-4000-8000-000000000004",
  unverified: "00000000-0000-4000-8000-000000000005",
  passkey: "00000000-0000-4000-8000-000000000006",
};
const PASSKEY_ROW_ID = "00000000-0000-4000-8000-0000000000aa";

/** Supabase's GoTrue writes `$2a$10$`; bcryptjs writes `$2b$`. Same algorithm, so swapping the prefix is exact. */
function supabaseBcrypt(password: string): string {
  return bcrypt.hashSync(password, 10).replace(/^\$2b\$/, "$2a$");
}

/** COSE_Key for an Ed25519 public key: {1: 1 (OKP), 3: -8 (EdDSA), -1: 6 (Ed25519), -2: x}. Prod's key is a 4-entry map too. */
function coseEd25519(x: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xa4, 0x01, 0x01, 0x03, 0x27, 0x20, 0x06, 0x21, 0x58, 0x20]), x]);
}

const passkeyKeys = crypto.generateKeyPairSync("ed25519");
const passkeyX = Buffer.from(passkeyKeys.publicKey.export({ format: "jwk" }).x as string, "base64url");
const passkeyCredentialId = crypto.randomBytes(16);

function fixture(): SupabaseAuthExport {
  const at = "2026-03-01T10:00:00.000Z";
  const confirmed = "2026-03-01T10:05:00.000Z";
  return {
    users: [
      {
        id: ids.password,
        email: "Pass@Example.com",
        encrypted_password: supabaseBcrypt(PASSWORD),
        email_confirmed_at: confirmed,
        raw_user_meta_data: { full_name: "Pat Password", avatar_url: "https://img.example/pat.png" },
        raw_app_meta_data: { provider: "email", providers: ["email"] },
        created_at: at,
        updated_at: at,
        last_sign_in_at: "2026-10-01T00:00:00.000Z",
        is_anonymous: false,
      },
      {
        id: ids.google,
        email: "goo@example.com",
        encrypted_password: "",
        email_confirmed_at: confirmed,
        raw_user_meta_data: { name: "Gee Google", picture: "https://img.example/g.png" },
        raw_app_meta_data: { provider: "google", providers: ["google"] },
        created_at: at,
        updated_at: at,
      },
      {
        id: ids.githubMfa,
        email: "hub@example.com",
        encrypted_password: supabaseBcrypt("another password"),
        email_confirmed_at: confirmed,
        raw_user_meta_data: { user_name: "hubber" },
        raw_app_meta_data: { provider: "github", providers: ["github", "email"] },
        created_at: at,
        updated_at: at,
      },
      {
        id: ids.gitlab,
        email: "lab@example.com",
        encrypted_password: null,
        email_confirmed_at: confirmed,
        raw_user_meta_data: {},
        raw_app_meta_data: { provider: "gitlab", providers: ["gitlab"] },
        created_at: at,
        updated_at: at,
        banned_until: "2999-01-01T00:00:00.000Z",
      },
      {
        id: ids.unverified,
        email: "new@example.com",
        encrypted_password: supabaseBcrypt(PASSWORD),
        email_confirmed_at: null,
        raw_user_meta_data: {},
        raw_app_meta_data: { provider: "email", providers: ["email"] },
        created_at: at,
        updated_at: at,
        deleted_at: null,
      },
      {
        id: ids.passkey,
        email: "key@example.com",
        encrypted_password: "",
        email_confirmed_at: confirmed,
        raw_user_meta_data: { full_name: "Kay Passkey" },
        raw_app_meta_data: { provider: "google", providers: ["google"] },
        created_at: at,
        updated_at: at,
      },
    ],
    identities: [
      { user_id: ids.password, provider: "email", provider_id: ids.password },
      { user_id: ids.google, provider: "google", provider_id: "109876543210987654321" },
      { user_id: ids.githubMfa, provider: "github", provider_id: "12345" },
      { user_id: ids.githubMfa, provider: "email", provider_id: ids.githubMfa },
      { user_id: ids.gitlab, provider: "gitlab", provider_id: "777" },
      { user_id: ids.unverified, provider: "email", provider_id: ids.unverified },
      { user_id: ids.passkey, provider: "google", provider_id: "100000000000000000001" },
      { user_id: ids.passkey, provider: "azure", provider_id: "not-configured" },
    ],
    mfaFactors: [
      { user_id: ids.githubMfa, factor_type: "totp", status: "verified" },
      { user_id: ids.google, factor_type: "totp", status: "unverified" },
    ],
    webauthnCredentials: [
      {
        id: PASSKEY_ROW_ID,
        user_id: ids.passkey,
        // json_agg renders bytea as \x-prefixed hex
        credential_id: `\\x${passkeyCredentialId.toString("hex")}`,
        public_key: `\\x${coseEd25519(passkeyX).toString("hex")}`,
        aaguid: "fbfc3007-154e-4ecc-8c0b-6e020557d7bd",
        sign_count: 5,
        transports: ["internal", "hybrid"],
        backup_eligible: true,
        backed_up: true,
        friendly_name: "MacBook",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Unit: planImport

describe("planImport", () => {
  test("maps users, accounts and passkeys", () => {
    const plan = planImport(fixture(), new Date("2026-11-03T00:00:00Z"));
    assert.equal(plan.users.length, 6);
    const pat = plan.users.find((user) => user.id === ids.password)!;
    assert.equal(pat.email, "pass@example.com", "emails are lowercased (Better Auth looks them up lowercased)");
    assert.equal(pat.name, "Pat Password");
    assert.equal(pat.image, "https://img.example/pat.png");
    assert.equal(pat.email_verified, true);
    assert.equal(pat.last_sign_in_at, "2026-10-01T00:00:00.000Z");
    assert.deepEqual(pat.raw_app_meta_data, { provider: "email", providers: ["email"] });

    assert.equal(plan.users.find((user) => user.id === ids.google)!.image, "https://img.example/g.png");
    assert.equal(plan.users.find((user) => user.id === ids.githubMfa)!.name, "hubber");
    assert.equal(plan.users.find((user) => user.id === ids.gitlab)!.name, "lab", "falls back to the email local part");
    assert.equal(plan.users.find((user) => user.id === ids.unverified)!.email_verified, false);

    const lab = plan.users.find((user) => user.id === ids.gitlab)!;
    assert.equal(lab.banned, true);
    assert.equal(lab.ban_expires, "2999-01-01T00:00:00.000Z");

    assert.equal(plan.mfaReenrollmentRequired, 1);
    assert.equal(plan.users.find((user) => user.id === ids.githubMfa)!.mfa_reenrollment_required, true);
    assert.equal(plan.users.find((user) => user.id === ids.google)!.mfa_reenrollment_required, false, "unverified factors don't count");

    const byKey = new Map(plan.accounts.map((account) => [`${account.provider_id}:${account.account_id}`, account]));
    assert.equal(plan.accounts.length, 3 + 4);
    for (const id of [ids.password, ids.githubMfa, ids.unverified]) {
      const credential = byKey.get(`credential:${id}`)!;
      assert.equal(credential.user_id, id, "credential account_id is the user id");
      assert.match(credential.password!, /^\$2a\$10\$/);
    }
    assert.equal(byKey.get("google:109876543210987654321")!.user_id, ids.google);
    assert.equal(byKey.get("github:12345")!.user_id, ids.githubMfa);
    assert.equal(byKey.get("gitlab:777")!.user_id, ids.gitlab);
    assert.equal(byKey.get("google:109876543210987654321")!.password, null);
    assert.deepEqual(plan.skippedIdentities, { "email (covered by credential)": 3, azure: 1 });
    assert.ok(plan.warnings.some((warning) => warning.includes("azure")));

    assert.equal(plan.passkeys.length, 1);
    const passkey = plan.passkeys[0];
    assert.equal(passkey.id, PASSKEY_ROW_ID);
    assert.equal(passkey.credential_id, passkeyCredentialId.toString("base64url"));
    assert.deepEqual(Buffer.from(passkey.public_key, "base64"), coseEd25519(passkeyX));
    assert.equal(passkey.counter, 5);
    assert.equal(passkey.device_type, "multiDevice");
    assert.equal(passkey.transports, "internal,hybrid");
    assert.equal(passkey.name, "MacBook");
  });

  test("rejects exports Better Auth couldn't use", () => {
    const input = fixture();
    input.users.push({ ...input.users[0], id: "00000000-0000-4000-8000-0000000000ff", email: "PASS@example.com" });
    input.users.push({ id: "00000000-0000-4000-8000-0000000000fe", email: null });
    input.users[1].encrypted_password = "$argon2id$v=19$m=65536,t=3,p=4$abc$def";
    input.identities.push({ user_id: "00000000-0000-4000-8000-00000000dead", provider: "github", provider_id: "1" });
    input.identities.push({ user_id: ids.gitlab, provider: "github", provider_id: "12345" });
    assert.throws(
      () => planImport(input),
      (error: unknown) => {
        assert.ok(error instanceof ImportValidationError);
        const text = error.problems.join("\n");
        assert.match(text, /share the email pass@example\.com/);
        assert.match(text, /has no email/);
        assert.match(text, /not bcrypt/);
        assert.match(text, /unknown user 00000000-0000-4000-8000-00000000dead/);
        assert.match(text, /duplicate github identity 12345/);
        return true;
      },
    );
  });

  test("reads bytea as a Buffer or as \\x hex", () => {
    assert.deepEqual(toBuffer(Buffer.from([1, 2])), Buffer.from([1, 2]));
    assert.deepEqual(toBuffer("\\x0102ff"), Buffer.from([1, 2, 255]));
    assert.throws(() => toBuffer("AQL/"), /bytea/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Unit: password.ts

describe("password.ts with Supabase bcrypt hashes", () => {
  test("verifies independent bcrypt test vectors ($2a$, from crypt_blowfish)", async () => {
    assert.equal(await verifyStoredPassword({ hash: "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW", password: "U*U" }), true);
    assert.equal(await verifyStoredPassword({ hash: "$2a$05$CCCCCCCCCCCCCCCCCCCCC.VGOzA784oUp/Z0DY336zx7pLYAy0lwK", password: "U*U*" }), true);
    assert.equal(await verifyStoredPassword({ hash: "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW", password: "U*U*" }), false);
  });

  test("accepts $2a$, $2b$ and $2y$ and rejects wrong passwords and malformed hashes", async () => {
    const b = bcrypt.hashSync(PASSWORD, 10) as string;
    for (const prefix of ["$2a$", "$2b$", "$2y$"]) {
      const hash = b.replace(/^\$2b\$/, prefix);
      assert.equal(isLegacyBcryptHash(hash), true);
      assert.equal(await verifyStoredPassword({ hash, password: PASSWORD }), true, prefix);
      assert.equal(await verifyStoredPassword({ hash, password: `${PASSWORD}!` }), false, prefix);
    }
    assert.equal(await verifyStoredPassword({ hash: "$2a$10$tooShort", password: PASSWORD }), false);
    assert.equal(await verifyStoredPassword({ hash: "not-a-hash", password: PASSWORD }), false);
    assert.equal(await verifyStoredPassword({ hash: "", password: PASSWORD }), false);
  });

  test("upgradeLegacyPasswordHash rehashes a matching bcrypt hash and nothing else", async () => {
    const updates: Array<[string, string]> = [];
    const deps = (password: string | null) => ({
      findCredentialAccount: async () => ({ id: "acc", password }),
      updateAccount: async (id: string, data: { password: string }) => void updates.push([id, data.password]),
      hash: async (plain: string) => `scrypt(${plain})`,
    });
    const hash = supabaseBcrypt(PASSWORD);
    assert.equal(await upgradeLegacyPasswordHash({ userId: "u", password: PASSWORD, ...deps(hash) }), true);
    assert.deepEqual(updates, [["acc", `scrypt(${PASSWORD})`]]);
    assert.equal(await upgradeLegacyPasswordHash({ userId: "u", password: "wrong", ...deps(hash) }), false);
    assert.equal(await upgradeLegacyPasswordHash({ userId: "u", password: PASSWORD, ...deps("salt:key") }), false);
    assert.equal(await upgradeLegacyPasswordHash({ userId: "u", password: undefined, ...deps(hash) }), false);
    const failing = { ...deps(hash), updateAccount: async () => Promise.reject(new Error("db down")) };
    assert.equal(await upgradeLegacyPasswordHash({ userId: "u", password: PASSWORD, ...failing }), false, "never throws");
    assert.equal(updates.length, 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Database

const PORT = 55436;

function loadPg(toolsDir: string): any {
  try {
    return webRequire("pg");
  } catch {
    return createRequire(path.join(toolsDir, "package.json"))("pg");
  }
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", windowsHide: true });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** A superuser URL to a maintenance database, plus how to stop the server if this run started it. */
function startServer(toolsDir: string): { url: string; stop: () => void } | null {
  if (process.env.PS_IMPORT_TEST_DATABASE_URL) return { url: process.env.PS_IMPORT_TEST_DATABASE_URL, stop: () => {} };
  const pkg = `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  const bin = path.join(toolsDir, "node_modules", ...pkg.split("/"), "native", "bin");
  if (!fs.existsSync(bin)) return null;
  const exe = (name: string) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);
  const dataDir = path.join(toolsDir, "import-test-cluster");
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    const init = run(exe("initdb"), ["-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale-provider=icu", "--icu-locale=en-US", "--locale=C", "-D", dataDir]);
    if (init.code !== 0) throw new Error(`initdb failed:\n${init.out}`);
  }
  const url = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
  if (run(exe("pg_ctl"), ["status", "-D", dataDir]).code === 0) return { url, stop: () => {} };
  const log = path.join(toolsDir, "import-test-postgres.log");
  // stdio is ignored and -l is used so the detached postmaster does not hold our pipes open.
  const started = spawnSync(exe("pg_ctl"), ["start", "-w", "-t", "60", "-D", dataDir, "-l", log, "-o", `-p ${PORT}`], { stdio: "ignore", windowsHide: true });
  if (started.status !== 0) throw new Error(`pg_ctl start failed; see ${log}`);
  return { url, stop: () => void run(exe("pg_ctl"), ["stop", "-m", "fast", "-D", dataDir]) };
}

function readSql(name: string): string {
  return fs.readFileSync(path.join(migrations, name), "utf8").replace(/\r\n/g, "\n");
}

/** handle_auth_user_created() with its grants, and the trigger, exactly as 0002_baseline.sql has them. */
function signupTriggerFrom0002(): string {
  const baseline = readSql("0002_baseline.sql");
  const marker = "-- source: supabase/schemas/public/functions/handle_auth_user_created.sql\n";
  const start = baseline.indexOf(marker);
  assert.ok(start >= 0, "0002 has handle_auth_user_created");
  const end = baseline.indexOf("\n-- source:", start + marker.length);
  const fn = baseline.slice(start, end);
  const triggerStart = baseline.indexOf(`CREATE TRIGGER ${SIGNUP_TRIGGER}`);
  assert.ok(triggerStart >= 0, "0002 has the signup trigger");
  const trigger = baseline.slice(triggerStart, baseline.indexOf(";", triggerStart) + 1);
  assert.match(trigger, /AFTER INSERT ON auth\.users/);
  return `${fn}\n${trigger}\n`;
}

const toolsDir = process.env.PS_AUTH_PG_DIR || (process.platform === "win32" ? "E:/tmp/ps-auth-pg" : path.join(os.tmpdir(), "ps-auth-pg"));
const server = (() => {
  try {
    return startServer(toolsDir);
  } catch (error) {
    console.warn(`database tests skipped: ${error instanceof Error ? error.message : error}`);
    return null;
  }
})();

describe("import into PlanetScale's auth schema", { skip: server ? false : "no PostgreSQL (set PS_IMPORT_TEST_DATABASE_URL or PS_AUTH_PG_DIR)" }, () => {
  const dbName = `phaseo_import_test_${process.pid}_${Date.now()}`;
  let pg: any;
  let admin: any;
  let pool: any;
  let client: any;
  const plan = planImport(fixture());
  const count = async (sql: string, values: unknown[] = []) => Number((await pool.query(sql, values)).rows[0].n);
  const tgenabled = async () =>
    (await pool.query("select tgenabled from pg_trigger where tgname = $1", [SIGNUP_TRIGGER])).rows[0].tgenabled;
  const credentialHash = async (userId: string) =>
    (await pool.query("select password from auth.accounts where provider_id = 'credential' and account_id = $1", [userId]))
      .rows[0].password as string;

  before(async () => {
    pg = loadPg(toolsDir);
    admin = new pg.Client({ connectionString: server!.url });
    await admin.connect();
    await admin.query(`create database "${dbName}"`);
    const url = new URL(server!.url);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
    await pool.query(readSql("0000_platform.sql"));
    await pool.query(readSql("0001_auth.sql"));
    // Stand-in for 0002's public.users: only the column and foreign key the signup trigger touches.
    await pool.query("create table public.users (user_id uuid primary key references auth.users (id) on delete cascade)");
    await pool.query(signupTriggerFrom0002());
    client = await pool.connect();
  });

  after(async () => {
    client?.release();
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists "${dbName}" with (force)`);
      await admin.end();
    }
    server?.stop();
  });

  test("the signup trigger from 0002 is live before the import", async () => {
    assert.equal(await tgenabled(), "O");
  });

  test("--dry-run reports the counts and writes nothing", async () => {
    const summary = await importSupabaseUsers(client, plan, { dryRun: true });
    assert.equal(summary.mode, "dry-run");
    assert.deepEqual(summary.written.users, { inserted: 6, updated: 0 });
    assert.deepEqual(summary.written.accounts, {
      credential: { inserted: 3, updated: 0 },
      github: { inserted: 1, updated: 0 },
      gitlab: { inserted: 1, updated: 0 },
      google: { inserted: 2, updated: 0 },
    });
    assert.deepEqual(summary.written.passkeys, { inserted: 1, updated: 0 });
    assert.equal(await count("select count(*) as n from auth.users"), 0);
    assert.equal(await count("select count(*) as n from auth.accounts"), 0);
    assert.equal(await tgenabled(), "O", "rolled back with the trigger enabled");
  });

  test("imports in one transaction without firing the signup trigger", async () => {
    const summary = await importSupabaseUsers(client, plan);
    assert.equal(summary.mode, "committed");
    assert.deepEqual(summary.written.users, { inserted: 6, updated: 0 });
    assert.equal(summary.mfaReenrollmentRequired, 1);
    assert.match(summary.signupTrigger, /disabled for the import, restored \(enable\)/);
    assert.deepEqual(summary.otherAuthUserTriggers, []);

    assert.equal(await count("select count(*) as n from auth.users"), 6);
    assert.equal(await count("select count(*) as n from auth.accounts"), 7);
    assert.equal(await count("select count(*) as n from auth.passkeys"), 1);
    assert.equal(await count("select count(*) as n from public.users"), 0, "public.users comes from the data copy, not the trigger");
    const flagged = await pool.query("select id from auth.users where mfa_reenrollment_required");
    assert.deepEqual(flagged.rows.map((row: any) => row.id), [ids.githubMfa]);
    const pat = (await pool.query("select * from auth.users where id = $1", [ids.password])).rows[0];
    assert.equal(pat.email, "pass@example.com");
    assert.equal(pat.name, "Pat Password");
    assert.equal(pat.email_verified, true);
    assert.equal(pat.is_anonymous, false);
    assert.equal(pat.deleted_at, null);
    assert.equal(pat.created_at.toISOString(), "2026-03-01T10:00:00.000Z");

    // The trigger is back on: a new auth.users row provisions public.users.
    assert.equal(await tgenabled(), "O");
    await pool.query("insert into auth.users (id, name, email) values ('00000000-0000-4000-8000-0000000000bb', 'Later', 'later@example.com')");
    assert.equal(await count("select count(*) as n from public.users"), 1);
  });

  test("a committing re-run refuses users missing from the export, unless --allow-stale-users", async () => {
    await assert.rejects(importSupabaseUsers(client, plan), /1 auth\.users row\(s\) are not in this export.*--allow-stale-users/);
    const dry = await importSupabaseUsers(client, plan, { dryRun: true });
    assert.equal(dry.usersInTargetNotInExport, 1, "a dry run reports them without failing");
  });

  test("a re-run is idempotent", async () => {
    const summary = await importSupabaseUsers(client, plan, { allowStaleUsers: true });
    assert.deepEqual(summary.written.users, { inserted: 0, updated: 6 });
    assert.deepEqual(summary.written.accounts.credential, { inserted: 0, updated: 3 });
    assert.deepEqual(summary.written.passkeys, { inserted: 0, updated: 1 });
    assert.equal(summary.usersInTargetNotInExport, 1, "the user created after the import is reported, not deleted");
    assert.equal(await count("select count(*) as n from auth.users"), 7);
    assert.equal(await count("select count(*) as n from auth.accounts"), 7);
    assert.equal(await count("select count(*) as n from public.users"), 1);
  });

  test("refuses to reassign an account that belongs to someone else", async () => {
    const hijack = planImport(fixture());
    hijack.accounts.find((account) => account.provider_id === "github")!.user_id = ids.gitlab;
    await assert.rejects(importSupabaseUsers(client, hijack), /already belong to another user: github:12345/);
    const owner = await pool.query("select user_id from auth.accounts where provider_id = 'github'");
    assert.equal(owner.rows[0].user_id, ids.githubMfa);
    assert.equal(await tgenabled(), "O", "a failed import leaves the trigger enabled");
  });

  describe("Better Auth on the imported rows", () => {
    let auth: any;
    const sent: Array<{ to: string; subject: string }> = [];

    before(async () => {
      const { betterAuth } = await importFromWeb("better-auth");
      const { createAuthOptions } = await import("../../../apps/web/src/lib/auth/better-auth/options.ts");
      const env = {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: "test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
        BETTER_AUTH_URL: "https://phaseo.app",
        PASSKEY_RP_ID: "phaseo.app",
      };
      const sendEmail = async (message: { to: string; subject: string; html: string }) => void sent.push(message);
      auth = betterAuth(createAuthOptions({ pool, env, sendEmail }, []));
    });

    test("a Supabase bcrypt password signs in, is rehashed with scrypt, and keeps working", async () => {
      assert.match(await credentialHash(ids.password), /^\$2a\$10\$/);

      const first = await auth.api.signInEmail({ body: { email: "Pass@Example.com", password: PASSWORD } });
      assert.equal(first.user.id, ids.password);
      assert.ok(first.token);

      const rehashed = await credentialHash(ids.password);
      assert.doesNotMatch(rehashed, /^\$2/);
      assert.match(rehashed, /^[0-9a-f]+:[0-9a-f]+$/, "Better Auth's scrypt format");

      const second = await auth.api.signInEmail({ body: { email: "pass@example.com", password: PASSWORD } });
      assert.equal(second.user.id, ids.password);
      await assert.rejects(auth.api.signInEmail({ body: { email: "pass@example.com", password: "wrong password" } }), /invalid email or password/i);

      const session = (await pool.query("select aal from auth.sessions where token = $1", [second.token])).rows[0];
      assert.equal(session.aal, "aal1");
      const user = (await pool.query("select last_sign_in_at from auth.users where id = $1", [ids.password])).rows[0];
      assert.ok(user.last_sign_in_at > new Date("2026-10-02T00:00:00Z"), "last_sign_in_at moves on sign-in");
    });

    test("a wrong password leaves the bcrypt hash alone", async () => {
      await assert.rejects(auth.api.signInEmail({ body: { email: "hub@example.com", password: "nope nope nope" } }));
      assert.match(await credentialHash(ids.githubMfa), /^\$2a\$10\$/);
    });

    test("an unconfirmed Supabase email must verify first", async () => {
      await assert.rejects(auth.api.signInEmail({ body: { email: "new@example.com", password: PASSWORD } }), /not verified/i);
      assert.ok(sent.some((message) => message.to === "new@example.com"), "a verification email was sent");
    });

    test("OAuth identities resolve to the imported users", async () => {
      const context = await auth.$context;
      for (const [providerId, accountId, userId] of [
        ["google", "109876543210987654321", ids.google],
        ["github", "12345", ids.githubMfa],
        ["gitlab", "777", ids.gitlab],
      ]) {
        const owner = await context.internalAdapter.findAccountOwnerByKey({ providerId, accountId });
        assert.equal(owner?.kind, "owned", `${providerId}:${accountId}`);
        assert.equal(owner.user.id, userId);
      }
      const flagged = await context.internalAdapter.findUserById(ids.githubMfa);
      assert.equal(flagged.mfaReenrollmentRequired, true, "exposed to aal.ts as user.mfaReenrollmentRequired");
    });

    test("an imported Supabase passkey signs in through /passkey/verify-authentication", async () => {
      const origin = "https://phaseo.app";
      const optionsResponse = await auth.handler(new Request(`${origin}/api/auth/passkey/generate-authenticate-options`));
      assert.equal(optionsResponse.status, 200);
      const { challenge } = await optionsResponse.json();
      const cookie = optionsResponse.headers
        .getSetCookie()
        .map((value: string) => value.split(";")[0])
        .join("; ");

      const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
      const signCount = Buffer.alloc(4);
      signCount.writeUInt32BE(6);
      const authenticatorData = Buffer.concat([
        crypto.createHash("sha256").update("phaseo.app").digest(),
        Buffer.from([0x05]), // user present + user verified
        signCount,
      ]);
      const signature = crypto.sign(
        null,
        Buffer.concat([authenticatorData, crypto.createHash("sha256").update(clientDataJSON).digest()]),
        passkeyKeys.privateKey,
      );
      const id = passkeyCredentialId.toString("base64url");
      const response = {
        id,
        rawId: id,
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        response: {
          authenticatorData: authenticatorData.toString("base64url"),
          clientDataJSON: clientDataJSON.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      };
      const verify = await auth.handler(
        new Request(`${origin}/api/auth/passkey/verify-authentication`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, cookie },
          body: JSON.stringify({ response }),
        }),
      );
      const body = await verify.json();
      assert.equal(verify.status, 200, JSON.stringify(body));
      assert.equal(body.session.userId, ids.passkey);
      const stored = (await pool.query("select counter from auth.passkeys where id = $1", [PASSKEY_ROW_ID])).rows[0];
      assert.equal(stored.counter, 6);
    });

    test("the import refuses to run once Better Auth has sessions, unless --allow-live", async () => {
      await assert.rejects(importSupabaseUsers(client, plan), /--allow-live/);
      const summary = await importSupabaseUsers(client, plan, { allowLive: true, dryRun: true });
      assert.deepEqual(summary.written.accounts.credential, { inserted: 0, updated: 3 });
    });

    test("a re-import keeps a password Better Auth already rehashed", async () => {
      await importSupabaseUsers(client, plan, { allowLive: true, allowStaleUsers: true });
      assert.doesNotMatch(await credentialHash(ids.password), /^\$2/);
      const again = await auth.api.signInEmail({ body: { email: "pass@example.com", password: PASSWORD } });
      assert.equal(again.user.id, ids.password);
    });
  });
});
