import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureDb, makeClient } from "./helpers";

let db: PGlite;
const ADA = "00000000-0000-0000-0000-000000000001";
const GRACE = "00000000-0000-0000-0000-000000000002";

beforeAll(async () => {
	db = await createFixtureDb();
});

describe("role emulation (PGlite: one session, real SET ROLE + RLS)", () => {
	it("authenticated: each request is BEGIN; set_config(claims, method, path, role); statement; COMMIT", async () => {
		const ada = makeClient(db, { role: "authenticated", claims: { sub: ADA, email: "ada@example.com" } });
		await ada.from("notes").select("body");
		const [setup, main] = ada.statements;
		expect(setup!.sql).toBe(
			"select set_config('request.jwt.claims', $1, true), set_config('request.method', $2, true), set_config('request.path', $3, true), set_config('role', $4, true) /*app='test',route='%2Ftest',table='notes'*/",
		);
		expect(setup!.params).toEqual([JSON.stringify({ sub: ADA, email: "ada@example.com", role: "authenticated" }), "GET", "/notes", "authenticated"]);
		expect(main!.sql.startsWith("WITH pgrst_source AS")).toBe(true);
	});

	it("authenticated only sees and changes its own rows (auth.uid() policies)", async () => {
		const ada = makeClient(db, { role: "authenticated", claims: { sub: ADA } });
		const grace = makeClient(db, { role: "authenticated", claims: { sub: GRACE } });
		expect((await ada.from("notes").select("body")).data).toEqual([{ body: "ada note" }]);
		expect((await grace.from("notes").select("body")).data).toEqual([{ body: "grace note" }]);
		expect((await ada.rpc("current_role_name")).data).toBe("authenticated");

		// default user_id = auth.uid(); WITH CHECK passes
		const inserted = await ada.from("notes").insert({ body: "second" }).select("user_id,body").single();
		expect(inserted.data).toEqual({ user_id: ADA, body: "second" });

		// RLS hides Grace's row from Ada's update/delete
		const upd = await ada.from("notes").update({ body: "hacked" }).eq("body", "grace note").select();
		expect(upd.data).toEqual([]);
		const del = await ada.from("notes").delete({ count: "exact" }).eq("body", "grace note");
		expect(del.count).toBe(0);

		// WITH CHECK violation: 42501 -> 403 for an authenticated request
		const forged = await ada.from("notes").insert({ body: "forged", user_id: GRACE });
		expect(forged.status).toBe(403);
		expect(forged.error).toMatchObject({ code: "42501", message: 'new row violates row-level security policy for table "notes"' });
	});

	it("anon: missing privilege is 42501 -> 401", async () => {
		const anon = makeClient(db, { role: "anon" });
		expect((await anon.from("labs").select("lab_slug").eq("lab_slug", "openai")).data).toEqual([{ lab_slug: "openai" }]);
		const denied = await anon.from("notes").select("body");
		expect(denied.status).toBe(401);
		expect(denied.error).toMatchObject({ code: "42501", message: "permission denied for table notes" });
	});

	it("the role and claims do not leak past the request transaction", async () => {
		const ada = makeClient(db, { role: "authenticated", claims: { sub: ADA } });
		await ada.from("notes").select("body");
		const after = (await db.query<{ role: string; claims: string | null }>("select current_user::text as role, nullif(current_setting('request.jwt.claims', true), '') as claims")).rows[0];
		expect(after).toEqual({ role: "postgres", claims: null });
	});

	it("service_role: reads run as the connection user with no setup statement", async () => {
		const svc = makeClient(db, { role: "service_role" });
		const res = await svc.from("notes").select("body").order("body");
		expect(res.data!.map((r) => r.body)).toContain("grace note");
		expect(svc.statements).toHaveLength(1);
	});

	it("service_role writes set request.jwt.claims role=service_role (auth.role()-guarded triggers pass)", async () => {
		const svc = makeClient(db, { role: "service_role" });
		const ok = await svc.from("protected_settings").update({ locked_value: "by service" }).eq("id", 1).select("locked_value");
		expect(ok.data).toEqual([{ locked_value: "by service" }]);
		expect(svc.statements[0]!.params).toEqual([JSON.stringify({ role: "service_role" }), "PATCH", "/protected_settings"]);

		const noClaims = makeClient(db, { role: "service_role", serviceRoleClaims: "never" });
		const blocked = await noClaims.from("protected_settings").update({ locked_value: "nope" }).eq("id", 1);
		expect(blocked.error?.code).toBe("42501");

		const user = makeClient(db, { role: "authenticated", claims: { sub: ADA } });
		const userBlocked = await user.from("protected_settings").update({ locked_value: "user" }).eq("id", 1);
		expect(userBlocked.status).toBe(403);
	});
});
