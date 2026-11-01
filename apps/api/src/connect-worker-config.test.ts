import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ConnectRoom as RoomClass } from "@/connect/connect-room";
import type { AuthFailure, AuthSuccess } from "@/pipeline/before/auth";
import worker, { ConnectRoom, createConnectWorker, type ConnectWorkerEnv } from "./connect-worker";

const config = (name: string) => readFileSync(join(__dirname, "..", name), "utf8").replace(/\r\n/g, "\n");
const vars = (toml: string) => {
	const section = /^\[vars\]\n([\s\S]*?)^\[/m.exec(toml)?.[1] ?? "";
	return Object.fromEntries([...section.matchAll(/^([A-Z0-9_]+) = "([^"]*)"$/gm)].map((match) => [match[1], match[2]]));
};
const DESKTOP_ID = "desk_0123456789abcdef";

function setup(auth: AuthSuccess | AuthFailure = { ok: true, workspaceId: "ws-1", apiKeyId: "key-1", apiKeyRef: "kid_x", apiKeyKid: "x" }) {
	const forwarded: Request[] = [];
	const names: string[] = [];
	const env = {
		CONNECT_ROOM: {
			idFromName: (name: string) => { names.push(name); return name; },
			get: () => ({ fetch: async (request: Request) => { forwarded.push(request); return new Response("room", { status: 200 }); } }),
		},
	} as unknown as ConnectWorkerEnv;
	const authenticate = vi.fn(async () => auth);
	const app = createConnectWorker(authenticate);
	const call = (path: string, headers: Record<string, string> = {}, method = "GET") =>
		app.fetch(new Request(`https://connect.phaseo.app${path}`, { method, headers: { upgrade: "websocket", ...headers } }), env, { waitUntil: () => {} } as unknown as ExecutionContext);
	return { forwarded, names, authenticate, call };
}

describe("phaseo-connect (the Connect relay Worker)", () => {
	const connect = config("wrangler.connect.toml");

	it("hosts ConnectRoom with SQLite storage at connect.phaseo.app, apart from the gateway", () => {
		expect(ConnectRoom).toBe(RoomClass);
		expect(worker.fetch).toBeTypeOf("function");
		expect(connect).toMatch(/^name = "phaseo-connect"$/m);
		expect(connect).toMatch(/^main = "src\/connect-worker\.ts"$/m);
		expect(connect).toMatch(/\[\[durable_objects\.bindings\]\]\s+name = "CONNECT_ROOM"\s+class_name = "ConnectRoom"\s+\[/);
		expect(connect).toMatch(/new_sqlite_classes = \["ConnectRoom"\]/);
		expect(connect).toMatch(/\[\[routes\]\]\s+pattern = "connect\.phaseo\.app"\s+custom_domain = true/);
		expect(connect).toContain('"web_socket_auto_reply_to_close"');
		for (const forbidden of ["[triggers]", "[[queues.consumers]]", "workers_dev = true"]) expect(connect).not.toContain(forbidden);
		// Only phaseo-connect hosts the room.
		for (const name of ["wrangler.toml", "wrangler.realtime.toml"]) expect(config(name)).not.toContain("ConnectRoom");
	});

	it("keeps every shared setting equal to phaseo-gateway's, so the key check behaves the same", () => {
		const gateway = vars(config("wrangler.toml"));
		const relay = vars(connect);
		expect(Object.keys(relay).length).toBeGreaterThan(5);
		for (const [name, value] of Object.entries(relay)) expect({ name, value }).toEqual({ name, value: gateway[name] });
		const cacheId = (toml: string) => /binding = "GATEWAY_CACHE"\s+id = "([^"]+)"/.exec(toml)?.[1];
		expect(cacheId(connect)).toBe(cacheId(config("wrangler.toml")));
	});

	it("checks the desktop's gateway key and passes the room only what it verified", async () => {
		const { call, forwarded, names, authenticate } = setup();
		const response = await call(`/v1/desktop/${DESKTOP_ID}`, { authorization: "Bearer phaseo_v1_sk_x_y", "x-connect-workspace": "someone-else" });
		expect(response.status).toBe(200);
		expect(authenticate).toHaveBeenCalledOnce();
		expect(names).toEqual([DESKTOP_ID]);
		const headers = Object.fromEntries(forwarded[0].headers);
		expect(headers["x-connect-role"]).toBe("desktop");
		expect(headers["x-connect-workspace"]).toBe("ws-1");
		expect(headers["x-connect-key-hash"]).toMatch(/^[0-9a-f]{64}$/);
		expect(headers.authorization).toBeUndefined();
	});

	it("refuses a desktop whose key fails", async () => {
		const { call, forwarded } = setup({ ok: false, reason: "invalid_secret" });
		const response = await call(`/v1/desktop/${DESKTOP_ID}`, { authorization: "Bearer bad" });
		expect([response.status, await response.json()]).toEqual([401, { error: "unauthorized" }]);
		expect(forwarded).toHaveLength(0);
	});

	it("passes a phone's relay token to the room, which checks it", async () => {
		const { call, forwarded, authenticate } = setup();
		expect((await call(`/v1/phone/${DESKTOP_ID}`)).status).toBe(401);
		expect((await call(`/v1/phone/${DESKTOP_ID}`, { authorization: "Bearer relay-token", "x-connect-role": "desktop" })).status).toBe(200);
		expect(authenticate).not.toHaveBeenCalled();
		expect(Object.fromEntries(forwarded[0].headers)).toMatchObject({ "x-connect-role": "phone", authorization: "Bearer relay-token" });
		expect(forwarded[0].headers.get("x-connect-workspace")).toBeNull();
	});

	it("answers only WebSocket upgrades on its two paths", async () => {
		const { call } = setup();
		expect((await call("/v1/desktop/short")).status).toBe(404);
		expect((await call("/")).status).toBe(404);
		expect((await call(`/v1/desktop/${DESKTOP_ID}`, {}, "POST")).status).toBe(404);
		expect((await call(`/v1/desktop/${DESKTOP_ID}`, { upgrade: "h2c" })).status).toBe(426);
	});
});
