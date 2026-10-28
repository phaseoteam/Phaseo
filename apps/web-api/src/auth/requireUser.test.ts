import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { requireUser, tokenAssuranceLevel } from "./requireUser";

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon" } as Env;

/** An unsigned JWT-shaped token; signature checks are Supabase's job (getUser), mocked here. */
function token(claims: Record<string, unknown>) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1", ...claims })}.signature`;
}

function signedIn(factors: Array<{ id: string; factor_type: string; status: string }>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/auth/v1/user")) return Response.json({ id: "user-1", email: "user@example.com", factors });
    return new Response("unexpected", { status: 500 });
  }));
}

const request = (bearer: string) => new Request("https://phaseo.app/api/account/auth/workspaces", { headers: { authorization: `Bearer ${bearer}` } });
const totp = { id: "factor-1", factor_type: "totp", status: "verified" };

afterEach(() => vi.unstubAllGlobals());

describe("requireUser and the second factor", () => {
  it("treats a password-only session as signed out when the account has a verified factor", async () => {
    signedIn([totp]);
    expect(await requireUser(request(token({ aal: "aal1" })), env)).toBeNull();
  });

  it("accepts the session once the second factor was used", async () => {
    signedIn([totp]);
    expect(await requireUser(request(token({ aal: "aal2" })), env)).toMatchObject({ id: "user-1" });
  });

  it("fails closed when the assurance level can't be read", async () => {
    signedIn([totp]);
    expect(await requireUser(request("opaque-token"), env)).toBeNull();
  });

  it("leaves accounts without a verified factor unchanged", async () => {
    signedIn([{ id: "factor-2", factor_type: "totp", status: "unverified" }]);
    expect(await requireUser(request(token({ aal: "aal1" })), env)).toMatchObject({ id: "user-1" });
    signedIn([]);
    expect(await requireUser(request("opaque-token"), env)).toMatchObject({ id: "user-1" });
  });
});

describe("tokenAssuranceLevel", () => {
  it("reads the aal claim and ignores malformed tokens", () => {
    expect(tokenAssuranceLevel(token({ aal: "aal2" }))).toBe("aal2");
    expect(tokenAssuranceLevel(token({}))).toBeNull();
    expect(tokenAssuranceLevel("not-a-jwt")).toBeNull();
    expect(tokenAssuranceLevel("a.%%%.c")).toBeNull();
  });
});
