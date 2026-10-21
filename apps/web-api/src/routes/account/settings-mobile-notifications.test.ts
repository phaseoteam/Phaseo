import { afterEach, describe, expect, it, vi } from "vitest";

import app from "@/index";

const USER = "6d1f5c58-4a0e-4c5a-9a59-1f9b2a6c0001";
const RULE = "2b7f3f0e-58c4-4d55-a7f6-0f0b8e6d0002";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	EXPO_ACCESS_TOKEN: "expo-access-token",
};
const BASE = "https://phaseo.app/api/account/settings/mobile-notifications";

type Call = { method: string; url: URL; body: unknown; headers: Headers };

function stubFetch(handler: (call: Call) => Response | undefined) {
	const calls: Call[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		if (url.pathname === "/auth/v1/user") {
			return request.headers.get("authorization") === "Bearer session-token"
				? Response.json({ id: USER, email: "user@example.com", created_at: "2026-01-01T00:00:00Z" })
				: Response.json({ message: "invalid token" }, { status: 401 });
		}
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
		const call = { method: request.method, url, body: text ? JSON.parse(text) : null, headers: request.headers };
		calls.push(call);
		return handler(call) ?? new Response(JSON.stringify({ message: `unexpected ${request.method} ${url.pathname}` }), { status: 500 });
	}));
	return calls;
}

function send(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) {
	const headers: Record<string, string> = {};
	if (init.token !== null) headers.authorization = `Bearer ${init.token ?? "session-token"}`;
	if (init.body !== undefined) headers["content-type"] = "application/json";
	return app.request(`${BASE}${path}`, {
		method: init.method ?? "GET",
		headers,
		body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
	}, env);
}

const ruleRow = {
	id: RULE, name: "No Qwen or Meta", enabled: true, action: "notify", event_kinds: ["model_released", "gateway_available"],
	lab_mode: "except", lab_slugs: ["qwen", "meta"], provider_mode: "all", provider_slugs: [], model_slugs: [],
	input_modalities: [], output_modalities: ["text"], only_on_phaseo: false, include_free_variants: false, position: 0,
};
const rule = {
	id: RULE, name: "No Qwen or Meta", enabled: true, action: "notify", events: ["model_released", "gateway_available"],
	labs: { mode: "except", ids: ["qwen", "meta"] }, providers: { mode: "all", ids: [] }, models: [], inputModalities: [],
	outputModalities: ["text"], onlyOnPhaseo: false, includeFreeVariants: false, position: 0,
};
const eventKinds = ["model_released", "gateway_available", "price_changed", "deprecation_announced", "provider_added", "provider_launched"];
const allCategoriesOn = {
	"new-models": true, "prices-providers": true, deprecations: true, money: true, traffic: true, security: true, jobs: true, account: true, digest: true,
};

function settingsReads(call: Call, stored: { preferences?: unknown[]; rules?: unknown[]; devices?: unknown[] } = {}) {
	if (call.method !== "GET") return undefined;
	if (call.url.pathname.endsWith("/mobile_notification_preferences")) return Response.json(stored.preferences ?? []);
	if (call.url.pathname.endsWith("/mobile_notification_rules")) return Response.json(stored.rules ?? []);
	if (call.url.pathname.endsWith("/mobile_push_devices")) return Response.json(stored.devices ?? []);
	return undefined;
}

afterEach(() => vi.unstubAllGlobals());

describe("mobile notification settings", () => {
	it("requires a signed-in user", async () => {
		stubFetch(() => undefined);
		const response = await send("", { token: null });
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "unauthorized", message: "Sign in to manage notifications." });
		expect((await send("/rules", { method: "POST", token: "forged", body: { events: ["model_released"] } })).status).toBe(401);
	});

	it("returns defaults before anything is saved", async () => {
		const calls = stubFetch((call) => settingsReads(call));
		const response = await send("");
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toEqual({ enabled: false, categories: allCategoriesOn, quietHours: null, dailyCap: 10, deviceRegistered: false, rules: [], eventKinds });
		expect(calls.some((call) => call.url.pathname.endsWith("/mobile_push_devices")), "no device lookup without an installation").toBe(false);
	});

	it("returns the user's settings, rules and this installation's registration", async () => {
		const calls = stubFetch((call) => settingsReads(call, {
			preferences: [{ enabled: true, categories: { digest: false, "prices-providers": false, unknown: false }, quiet_start: "22:00:00", quiet_end: "07:30:00", daily_cap: 5 }],
			rules: [ruleRow],
			devices: [{ status: "active" }],
		}));
		const response = await send("?installationId=install-0001");
		expect(await response.json()).toEqual({
			enabled: true, categories: { ...allCategoriesOn, digest: false, "prices-providers": false }, quietHours: { start: "22:00", end: "07:30" },
			dailyCap: 5, deviceRegistered: true, rules: [rule], eventKinds,
		});
		for (const call of calls) expect(call.url.searchParams.get("user_id")).toBe(`eq.${USER}`);
		expect(calls.find((call) => call.url.pathname.endsWith("/mobile_push_devices"))?.url.searchParams.get("installation_id")).toBe("eq.install-0001");
	});

	it("saves only the settings sent and returns the full shape", async () => {
		let saved: unknown = null;
		const calls = stubFetch((call) => {
			if (call.method === "POST" && call.url.pathname.endsWith("/mobile_notification_preferences")) {
				saved = call.body;
				return new Response(null, { status: 201 });
			}
			return settingsReads(call, { preferences: [{ enabled: true, quiet_start: null, quiet_end: null, daily_cap: 10 }] });
		});
		const response = await send("", { method: "PUT", body: { enabled: true, quietHours: null } });
		expect(response.status).toBe(200);
		expect(saved).toMatchObject({ user_id: USER, enabled: true, quiet_start: null, quiet_end: null });
		expect(saved).not.toHaveProperty("daily_cap");
		expect(calls.find((call) => call.method === "POST")?.url.searchParams.get("on_conflict")).toBe("user_id");
		expect(await response.json()).toMatchObject({ enabled: true, quietHours: null, dailyCap: 10 });

		await send("", { method: "PUT", body: { quietHours: { start: "22:00", end: "07:00" }, dailyCap: 3 } });
		expect(saved).toMatchObject({ quiet_start: "22:00", quiet_end: "07:00", daily_cap: 3 });
		expect(calls.some((call) => call.url.pathname.endsWith("/rpc/update_mobile_notification_categories"))).toBe(false);
	});

	it("merges only the categories sent, in the database", async () => {
		const merged: unknown[] = [];
		const calls = stubFetch((call) => {
			if (call.url.pathname.endsWith("/rpc/update_mobile_notification_categories")) {
				merged.push(call.body);
				return Response.json({ digest: false });
			}
			if (call.method === "POST" && call.url.pathname.endsWith("/mobile_notification_preferences")) return new Response(null, { status: 201 });
			return settingsReads(call, { preferences: [{ enabled: true, categories: { digest: false }, quiet_start: null, quiet_end: null, daily_cap: 10 }] });
		});
		const response = await send("", { method: "PUT", body: { categories: { digest: false } } });
		expect(response.status).toBe(200);
		expect(merged).toEqual([{ p_user_id: USER, p_categories: { digest: false } }]);
		expect(calls.some((call) => call.method === "POST" && call.url.pathname.endsWith("/mobile_notification_preferences")), "no other setting is written").toBe(false);
		expect((await response.json()).categories).toEqual({ ...allCategoriesOn, digest: false });

		expect((await send("", { method: "PUT", body: { enabled: true, categories: { "new-models": false, money: true } } })).status).toBe(200);
		expect(merged.at(-1)).toEqual({ p_user_id: USER, p_categories: { "new-models": false, money: true } });
		expect(calls.find((call) => call.method === "POST" && call.url.pathname.endsWith("/mobile_notification_preferences"))?.body)
			.toMatchObject({ user_id: USER, enabled: true });
	});

	it("reports a failed category write as unavailable", async () => {
		stubFetch((call) => call.url.pathname.endsWith("/rpc/update_mobile_notification_categories")
			? Response.json({ message: "boom" }, { status: 500 })
			: settingsReads(call));
		const response = await send("", { method: "PUT", body: { categories: { jobs: false } } });
		expect(response.status).toBe(503);
		expect((await response.json()).error).toBe("mobile_notification_settings_write_failed");
	});

	it.each([
		[{ categories: { tests: false } }, "Unknown field: tests."],
		[{ categories: { digest: "off" } }, "categories.digest: digest must be true or false."],
		[{ categories: ["digest"] }, "categories: categories must be an object of true or false values."],
		[{ dailyCap: 0 }, "dailyCap: dailyCap must be a whole number from 1 to 100."],
		[{ dailyCap: 2.5 }, "dailyCap: dailyCap must be a whole number from 1 to 100."],
		[{ quietHours: { start: "22:00", end: "22:00" } }, "quietHours: Quiet hours must start and end at different times."],
		[{ quietHours: { start: "10pm", end: "07:00" } }, 'quietHours.start: Quiet hours use 24-hour "HH:MM" times, such as "22:00".'],
		[{ enabled: "yes" }, "enabled: enabled must be true or false."],
		[{ newModelReleases: true }, "Unknown field: newModelReleases."],
	])("rejects invalid settings %j", async (body, message) => {
		stubFetch(() => undefined);
		const response = await send("", { method: "PUT", body });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_settings", message });
	});

	it("rejects a body that is not JSON", async () => {
		stubFetch(() => undefined);
		const response = await send("", { method: "PUT", body: "{" });
		expect(await response.json()).toEqual({ error: "invalid_json", message: "Send a JSON body." });
	});
});

describe("mobile push devices", () => {
	const device = { expoPushToken: "ExponentPushToken[abc_123-XYZ]", platform: "android", timeZone: "Europe/London", deviceName: "Pixel 9", appVersion: "1.0.0" };

	it("registers one token per installation through the database", async () => {
		const calls = stubFetch((call) => call.url.pathname.endsWith("/rpc/register_mobile_push_device") ? Response.json("device-id") : undefined);
		const response = await send("/devices/install-0001", { method: "PUT", body: device });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(calls[0].body).toEqual({
			p_user_id: USER, p_installation_id: "install-0001", p_expo_push_token: device.expoPushToken, p_platform: "android",
			p_time_zone: "Europe/London", p_device_name: "Pixel 9", p_app_version: "1.0.0", p_channel_scheme: 1,
		});
	});

	it("stores the channel scheme the app reports, and scheme 1 when it reports none", async () => {
		const calls = stubFetch((call) => call.url.pathname.endsWith("/rpc/register_mobile_push_device") ? Response.json("device-id") : undefined);
		expect((await send("/devices/install-0001", { method: "PUT", body: { ...device, channelScheme: 2 } })).status).toBe(200);
		expect(calls[0].body).toMatchObject({ p_channel_scheme: 2 });
		await send("/devices/install-0001", { method: "PUT", body: device });
		expect(calls[1].body).toMatchObject({ p_channel_scheme: 1 });
	});

	it.each([
		["/devices/install-0001", { ...device, expoPushToken: "not-a-token" }, 'expoPushToken: expoPushToken must be an Expo push token such as "ExponentPushToken[...]".'],
		["/devices/install-0001", { ...device, platform: "web" }, 'platform: platform must be "android" or "ios".'],
		["/devices/install-0001", { ...device, timeZone: "Mars/Olympus" }, 'timeZone: timeZone must be an IANA time zone such as "Europe/London".'],
		["/devices/install-0001", { expoPushToken: device.expoPushToken, platform: "ios" }, "timeZone: timeZone is required."],
		["/devices/install-0001", { ...device, channelScheme: 1.5 }, "channelScheme: channelScheme must be a whole number from 1 to 100."],
		["/devices/install-0001", { ...device, channelScheme: 0 }, "channelScheme: channelScheme must be a whole number from 1 to 100."],
		["/devices/install-0001", { ...device, channelScheme: "2" }, "channelScheme: channelScheme must be a whole number from 1 to 100."],
		["/devices/short", device, "installationId is not valid."],
	])("rejects an invalid device on %s", async (path, body, message) => {
		const calls = stubFetch(() => undefined);
		const response = await send(path, { method: "PUT", body });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_device", message });
		expect(calls).toHaveLength(0);
	});

	it("disables only the caller's installation on sign-out", async () => {
		const calls = stubFetch((call) => call.method === "PATCH" ? new Response(null, { status: 204 }) : undefined);
		const response = await send("/devices/install-0001", { method: "DELETE" });
		expect(await response.json()).toEqual({ ok: true });
		expect(calls[0].body).toMatchObject({ status: "disabled" });
		expect(calls[0].url.searchParams.get("user_id")).toBe(`eq.${USER}`);
		expect(calls[0].url.searchParams.get("installation_id")).toBe("eq.install-0001");
	});
});

describe("mobile notification rules", () => {
	const input = {
		name: "  No Qwen or Meta  ", events: ["model_released", "gateway_available", "model_released"],
		labs: { mode: "except", ids: ["Qwen", "meta"] }, outputModalities: ["text"],
	};

	// The database allocates the position and applies the defaults (supabase/tests/mobile-push-rules.test.mjs).
	function ruleStore(result: unknown = { rule: { ...ruleRow, position: 5 } }, status = 200) {
		const calls = stubFetch((call) => call.url.pathname.endsWith("/rpc/create_mobile_notification_rule")
			? Response.json(result, { status })
			: undefined);
		return { calls };
	}

	it("creates a rule with normalised lists in one locked database call", async () => {
		const store = ruleStore();
		const response = await send("/rules", { method: "POST", body: input });
		expect(response.status).toBe(201);
		expect(store.calls).toHaveLength(1);
		expect(store.calls[0].method).toBe("POST");
		expect(store.calls[0].url.pathname).toBe("/rest/v1/rpc/create_mobile_notification_rule");
		expect(store.calls[0].body).toEqual({
			p_user_id: USER,
			p_rule: { name: "No Qwen or Meta", event_kinds: ["model_released", "gateway_available"], lab_mode: "except", lab_slugs: ["qwen", "meta"], output_modalities: ["text"] },
			p_max_rules: 50,
		});
		expect(await response.json()).toEqual({ rule: { ...rule, position: 5 } });
	});

	it("accepts rules about providers launching on Phaseo", async () => {
		const store = ruleStore({ rule: { ...ruleRow, event_kinds: ["provider_launched"], lab_mode: "all", lab_slugs: [] } });
		const response = await send("/rules", { method: "POST", body: { events: ["provider_launched"] } });
		expect(response.status).toBe(201);
		expect(store.calls[0].body).toMatchObject({ p_rule: { event_kinds: ["provider_launched"] } });
		expect((await response.json()).rule.events).toEqual(["provider_launched"]);
	});

	it("caps users at 50 rules", async () => {
		const store = ruleStore({ error: "rule_limit_reached" });
		const response = await send("/rules", { method: "POST", body: input });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "rule_limit_reached", message: "You can have up to 50 notification rules. Delete one to add another." });
		expect(store.calls).toHaveLength(1);
	});

	it("reports a failed create as unavailable", async () => {
		ruleStore({ message: "boom" }, 500);
		const response = await send("/rules", { method: "POST", body: input });
		expect(response.status).toBe(503);
		expect((await response.json()).error).toBe("mobile_notification_rule_write_failed");
	});

	it.each([
		[{ events: [] }, "events: Choose at least one event."],
		[{ events: ["model_rumoured"] }, "events.0: Events must be any of: model_released, gateway_available, price_changed, deprecation_announced, provider_added, provider_launched."],
		[{ labs: { mode: "all" } }, "events: events must be a list."],
		[{ events: ["price_changed"], labs: { mode: "only", ids: [] } }, 'labs.ids: Choose at least one lab for "only" or "except", or use "all".'],
		[{ events: ["price_changed"], providers: { mode: "sometimes", ids: ["openai"] } }, 'providers.mode: provider mode must be "all", "only" or "except".'],
		[{ events: ["price_changed"], models: Array.from({ length: 201 }, (_, index) => `lab/model-${index}`) }, "models: List at most 200 models."],
		[{ events: ["price_changed"], models: ["Not A Slug"] }, 'models.0: models must be lowercase ids such as "openai".'],
		[{ events: ["price_changed"], action: "silence" }, 'action: action must be "notify" or "mute".'],
		[{ events: ["price_changed"], userId: USER }, "Unknown field: userId."],
	])("rejects invalid rule %j", async (body, message) => {
		const store = ruleStore();
		const response = await send("/rules", { method: "POST", body });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_rule", message });
		expect(store.calls).toHaveLength(0);
	});

	it("updates only the fields sent, on the caller's own rule", async () => {
		let patch: unknown = null;
		const calls = stubFetch((call) => {
			if (call.method !== "PATCH") return undefined;
			patch = call.body;
			return Response.json([{ ...ruleRow, enabled: false, provider_mode: "only", provider_slugs: ["amazon-bedrock"] }]);
		});
		const response = await send(`/rules/${RULE}`, { method: "PATCH", body: { id: RULE, enabled: false, providers: { mode: "only", ids: ["amazon-bedrock"] } } });
		expect(response.status).toBe(200);
		expect(patch).toEqual({ enabled: false, provider_mode: "only", provider_slugs: ["amazon-bedrock"], updated_at: expect.any(String) });
		expect(calls[0].url.searchParams.get("id")).toBe(`eq.${RULE}`);
		expect(calls[0].url.searchParams.get("user_id")).toBe(`eq.${USER}`);
		expect(await response.json()).toEqual({ rule: { ...rule, enabled: false, providers: { mode: "only", ids: ["amazon-bedrock"] } } });
	});

	it("reports a missing or foreign rule as not found", async () => {
		stubFetch((call) => call.method === "PATCH" || call.method === "DELETE" ? Response.json([]) : undefined);
		expect((await send(`/rules/${RULE}`, { method: "PATCH", body: { enabled: false } })).status).toBe(404);
		expect((await send(`/rules/${RULE}`, { method: "DELETE" })).status).toBe(404);
		expect((await send("/rules/not-a-uuid", { method: "DELETE" })).status).toBe(404);
		const empty = await send(`/rules/${RULE}`, { method: "PATCH", body: {} });
		expect(await empty.json()).toEqual({ error: "invalid_rule", message: "Change at least one field of the rule." });
	});

	it("deletes the caller's rule", async () => {
		const calls = stubFetch((call) => call.method === "DELETE" ? Response.json([{ id: RULE }]) : undefined);
		const response = await send(`/rules/${RULE}`, { method: "DELETE" });
		expect(await response.json()).toEqual({ ok: true });
		expect(calls[0].url.searchParams.get("user_id")).toBe(`eq.${USER}`);
	});

	it("reorders rules only when every rule is listed once", async () => {
		const results = [true, false];
		const calls = stubFetch((call) => call.url.pathname.endsWith("/rpc/reorder_mobile_notification_rules") ? Response.json(results.shift()) : undefined);
		const ids = [RULE, "2b7f3f0e-58c4-4d55-a7f6-0f0b8e6d0003"];
		expect(await (await send("/rules/order", { method: "PUT", body: { ids } })).json()).toEqual({ ok: true });
		expect(calls[0].body).toEqual({ p_user_id: USER, p_rule_ids: ids });
		const rejected = await send("/rules/order", { method: "PUT", body: { ids: [RULE] } });
		expect(rejected.status).toBe(400);
		expect(await rejected.json()).toEqual({ error: "invalid_rule_order", message: "List every one of your rule ids exactly once." });
		expect((await send("/rules/order", { method: "PUT", body: { ids: ["x"] } })).status).toBe(400);
	});
});

describe("test push", () => {
	const claim = { deviceId: "device-1", expoPushToken: "ExponentPushToken[abc]" };

	function testPush(claimResult: unknown, ticket: unknown = { status: "ok", id: "ticket-1" }) {
		return stubFetch((call) => {
			if (call.url.pathname.endsWith("/rpc/claim_mobile_push_test")) return Response.json(claimResult);
			if (call.url.hostname === "exp.host") return Response.json({ data: [ticket] });
			if (call.method === "PATCH" && call.url.pathname.endsWith("/mobile_push_devices")) return new Response(null, { status: 204 });
			return undefined;
		});
	}

	it("sends one push to the caller's device now", async () => {
		const calls = testPush(claim);
		const response = await send("/test", { method: "POST", body: { installationId: "install-0001" } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(calls[0].body).toEqual({ p_user_id: USER, p_installation_id: "install-0001" });
		const expo = calls.find((call) => call.url.hostname === "exp.host");
		expect(expo?.url.pathname).toBe("/--/api/v2/push/send");
		expect(expo?.headers.get("authorization")).toBe("Bearer expo-access-token");
		expect(expo?.body).toEqual([{
			to: "ExponentPushToken[abc]", title: "Phaseo test notification", body: "Notifications from Phaseo will look like this.",
			data: { href: "/", kind: "test", category: "tests", modelId: null, group: null }, channelId: "model-updates", sound: null,
		}]);
	});

	it("uses the tests channel once the app has created the category channels", async () => {
		for (const [channelScheme, channelId] of [[1, "model-updates"], [2, "tests"], [3, "tests"]] as const) {
			const calls = testPush({ ...claim, channelScheme });
			expect((await send("/test", { method: "POST", body: { installationId: "install-0001" } })).status).toBe(200);
			const expo = calls.find((call) => call.url.hostname === "exp.host");
			expect((expo?.body as Array<{ channelId: string }>)[0].channelId).toBe(channelId);
		}
	});

	it("limits test pushes and says when to retry", async () => {
		const calls = testPush({ error: "rate_limited", retryAfterSeconds: 240 });
		const response = await send("/test", { method: "POST", body: { installationId: "install-0001" } });
		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("240");
		expect(await response.json()).toEqual({ error: "rate_limited", message: "You can send 3 test notifications every 10 minutes. Try again shortly." });
		expect(calls.some((call) => call.url.hostname === "exp.host")).toBe(false);
	});

	it("reports an unregistered device and retires a token Expo no longer knows", async () => {
		testPush({ error: "device_not_registered" });
		expect((await send("/test", { method: "POST", body: { installationId: "install-0001" } })).status).toBe(404);

		const calls = testPush(claim, { status: "error", details: { error: "DeviceNotRegistered" } });
		const response = await send("/test", { method: "POST", body: { installationId: "install-0001" } });
		expect(response.status).toBe(404);
		expect((await response.json()).error).toBe("device_not_registered");
		const retired = calls.find((call) => call.method === "PATCH");
		expect(retired?.body).toMatchObject({ status: "invalid" });
		expect(retired?.url.searchParams.get("user_id")).toBe(`eq.${USER}`);
	});

	it("rejects a malformed installation id", async () => {
		const calls = testPush(claim);
		const response = await send("/test", { method: "POST", body: { installationId: "no" } });
		expect(await response.json()).toEqual({ error: "invalid_device", message: "installationId: installationId is not valid." });
		expect(calls).toHaveLength(0);
	});
});
