import assert from "node:assert/strict";
import test from "node:test";
import {
	buildParityRequest,
	parityCommandKeys,
	parityHelpEntries,
	parseIpAllowlist,
	renderParityResult,
	runParityCommand,
	type ParityDeps,
	type ParityInput,
} from "../src/parity.ts";

const input = (stdin = "", env: Record<string, string> = {}): ParityInput => ({ readStdin: async () => stdin, env });
const build = (command: string, flags: Record<string, string | boolean> = {}, stdin = "", env: Record<string, string> = {}) =>
	buildParityRequest(command.split(" "), flags, input(stdin, env));

test("rate limit tier commands", async () => {
	assert.deepEqual(await build("rate-limits tier get"), { method: "GET", path: "/rate-limits/tier" });
	assert.deepEqual(await build("rate-limits tier raise"), { method: "POST", path: "/rate-limits/tier/raise" });
});

test("invites accept takes the code as an argument or from stdin", async () => {
	assert.deepEqual(await build("invites accept JOIN-CODE-1"), { method: "POST", path: "/invites/accept", body: { token: "JOIN-CODE-1" } });
	assert.deepEqual(await build("invites accept", { "code-stdin": true }, " JOIN-CODE-2\n"), { method: "POST", path: "/invites/accept", body: { token: "JOIN-CODE-2" } });
	await assert.rejects(build("invites accept"), /Invite code is required/);
	assert.deepEqual(await build("invites requests"), { method: "GET", path: "/invites/requests" });
	assert.deepEqual(await build("invites requests", { status: "all" }), { method: "GET", path: "/invites/requests?status=all" });
});

test("routing auto update sends only the fields given", async () => {
	assert.deepEqual(await build("routing auto get"), { method: "GET", path: "/routing/auto" });
	assert.deepEqual(await build("routing auto update", { "allowed-patterns": "openai/*, anthropic/claude-*", objective: "cost", "allow-fallbacks": "false" }), {
		method: "PATCH",
		path: "/routing/auto",
		body: { allowed_patterns: ["openai/*", "anthropic/claude-*"], objective: "cost", allow_fallbacks: false },
	});
	assert.deepEqual(await build("routing auto update", { "spend-profile": "custom", "max-input-price-per-million": "2", "max-output-price-per-million": "none", "allowed-patterns": "none" }), {
		method: "PATCH",
		path: "/routing/auto",
		body: { allowed_patterns: [], spend_profile: "custom", max_input_price_per_million: 2, max_output_price_per_million: null },
	});
	await assert.rejects(build("routing auto update"), /Provide a field to change/);
	await assert.rejects(build("routing auto update", { "allow-fallbacks": "maybe" }), /must be true or false/);
});

test("routing successors", async () => {
	assert.deepEqual(await build("routing successors list"), { method: "GET", path: "/routing/successor/replacements" });
	assert.deepEqual(await build("routing successors set", { model: "openai/gpt-4", successor: "openai/gpt-5" }), {
		method: "PUT", path: "/routing/successor/replacements", body: { model: "openai/gpt-4", successor: "openai/gpt-5" },
	});
	assert.deepEqual(await build("routing successors set", { model: "openai/gpt-4", never: true }), {
		method: "PUT", path: "/routing/successor/replacements", body: { model: "openai/gpt-4", successor: null },
	});
	await assert.rejects(build("routing successors set", { model: "openai/gpt-4" }), /--successor <id> or --never/);
	await assert.rejects(build("routing successors set", { model: "openai/gpt-4", successor: "x/y", never: true }), /--successor <id> or --never/);
	assert.deepEqual(await build("routing successors remove", { model: "openai/gpt-4" }), {
		method: "DELETE", path: "/routing/successor/replacements?model=openai%2Fgpt-4",
	});
	await assert.rejects(build("routing successors remove"), /--model is required/);
});

test("observability destination checks keep settings out of argv when asked", async () => {
	assert.deepEqual(await build("observability destinations test dest_1"), { method: "POST", path: "/observability/destinations/dest_1/test" });
	assert.deepEqual(await build("observability destinations sample dest_1"), { method: "POST", path: "/observability/destinations/dest_1/sample" });
	const expected = { method: "POST", path: "/observability/destinations/test", body: { type: "webhook", config: { url: "https://hooks.example.com" } } };
	assert.deepEqual(await build("observability destinations test-config", { type: "webhook", "config-stdin": true }, '{"url":"https://hooks.example.com"}'), expected);
	assert.deepEqual(await build("observability destinations test-config", { type: "webhook", "config-env": "HOOK" }, "", { HOOK: '{"url":"https://hooks.example.com"}' }), expected);
	assert.deepEqual(await build("observability destinations test-config", { type: "webhook", "config-json": '{"url":"https://hooks.example.com"}' }), expected);
	await assert.rejects(build("observability destinations test-config", { type: "webhook" }), /--config-stdin/);
	await assert.rejects(build("observability destinations test-config", { type: "webhook", "config-env": "MISSING" }), /MISSING is empty or not set/);
});

test("authorized apps", async () => {
	assert.deepEqual(await build("authorized-apps list"), { method: "GET", path: "/me/authorized-apps" });
	assert.deepEqual(await build("authorized-apps revoke auth_1"), { method: "DELETE", path: "/me/authorized-apps/auth_1" });
	assert.deepEqual(await build("authorized-apps update-scopes auth_1", { scopes: "me:read, keys:read" }), {
		method: "PATCH", path: "/me/authorized-apps/auth_1", body: { scopes: ["me:read", "keys:read"] },
	});
	await assert.rejects(build("authorized-apps update-scopes auth_1"), /--scopes is required/);
});

test("authorized-apps revoke asks first and needs --yes when not interactive", async () => {
	const calls: string[] = [];
	const deps = (interactive: boolean, answer = false): ParityDeps => ({
		...input(),
		interactive,
		confirm: async () => answer,
		request: async (path, options) => { calls.push(`${options.method} ${path}`); return { revoked: true, id: "auth_1" }; },
		write: () => {},
	});
	await assert.rejects(runParityCommand(["authorized-apps", "revoke", "auth_1"], {}, deps(false)), /Re-run with --yes/);
	await assert.rejects(runParityCommand(["authorized-apps", "revoke", "auth_1"], {}, deps(true, false)), /Cancelled/);
	assert.deepEqual(calls, []);
	assert.equal(await runParityCommand(["authorized-apps", "revoke", "auth_1"], { yes: true }, deps(false)), true);
	assert.deepEqual(calls, ["DELETE /me/authorized-apps/auth_1"]);
	assert.equal(await runParityCommand(["authorized-apps", "frobnicate"], {}, deps(false)), false);
});

test("profile", async () => {
	assert.deepEqual(await build("profile get"), { method: "GET", path: "/me/profile" });
	assert.deepEqual(await build("profile update", { "display-name": "Ada", "default-workspace": "none", "obfuscate-info": "true" }), {
		method: "PATCH", path: "/me/profile", body: { display_name: "Ada", default_workspace_id: null, obfuscate_info: true },
	});
	await assert.rejects(build("profile update"), /Provide a field to change/);
});

test("classifiers test builds a saved or draft test", async () => {
	assert.deepEqual(await build("classifiers test 00000000-0000-4000-8000-0000000000aa", { prompt: "Why was I charged twice?", response: "Let me check." }), {
		method: "POST",
		path: "/classifiers/test",
		body: { classifier_id: "00000000-0000-4000-8000-0000000000aa", sample: { prompt: "Why was I charged twice?", response: "Let me check." } },
	});
	const dimensions = [{ key: "topic", values: [{ value: "billing" }, { value: "bugs" }] }];
	assert.deepEqual(await build("classifiers test", { model: "openai/gpt-5-mini", "dimensions-json": JSON.stringify(dimensions), "prompt-stdin": true }, "A long prompt\n"), {
		method: "POST",
		path: "/classifiers/test",
		body: { classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "A long prompt" } },
	});
	await assert.rejects(build("classifiers test", { model: "openai/gpt-5-mini" }), /sample prompt is required/);
	await assert.rejects(build("classifiers test", { prompt: "hi" }), /saved classifier id, or a draft/);
});

test("--ip-allowlist parsing for keys update", () => {
	assert.deepEqual(parseIpAllowlist("Office=203.0.113.0/24, VPN=2001:db8::1"), [
		{ label: "Office", address: "203.0.113.0/24" },
		{ label: "VPN", address: "2001:db8::1" },
	]);
	assert.deepEqual(parseIpAllowlist("none"), []);
	assert.throws(() => parseIpAllowlist("203.0.113.1"), /label=address/);
});

test("help covers every command and its groups", () => {
	const entries = parityHelpEntries();
	for (const key of parityCommandKeys()) assert.ok(entries[key]?.usage[0]?.startsWith(`phaseo ${key}`), key);
	for (const group of ["rate-limits tier", "invites", "routing successors", "observability destinations", "authorized-apps", "profile", "classifiers"]) {
		assert.ok(entries[group]?.usage.length, group);
	}
	assert.match(entries["authorized-apps revoke"].usage[0], /--yes/);
});

test("human output", () => {
	assert.equal(renderParityResult("routing successors list", { data: [{ model: "openai/gpt-4", successor: null, updated_at: "x" }] }), "openai/gpt-4 -> never\n");
	assert.equal(renderParityResult("authorized-apps list", { data: [] }), "No results.\n");
	assert.equal(renderParityResult("profile get", { data: { display_name: "Ada", obfuscate_info: false } }), "display name: Ada\nobfuscate info: false\n");
	assert.equal(renderParityResult("invites accept", { data: { id: "req_1", status: "pending" } }), "Asked to join the workspace.\nID: req_1\n");
});

test("parity commands never collide with the management commands", async () => {
	const { managementCommandKeys, resolveManagementCommand } = await import("../src/management.ts");
	const management = new Set(managementCommandKeys());
	for (const key of parityCommandKeys()) {
		assert.equal(management.has(key), false, `${key} is also a management command`);
		// The management runner runs first, so it must not claim any parity command line.
		assert.equal(resolveManagementCommand([...key.split(" "), "arg"]), null, `${key} resolves as a management command`);
		for (const other of management) assert.equal(other.startsWith(`${key} `), false, `${key} is a group of ${other}`);
	}
});

test("root help merges management and parity usage for shared groups", async () => {
	const { renderHelp } = await import("../src/index.ts");
	const routing = renderHelp(["routing"]);
	assert.match(routing, /phaseo routing dynamic-routes list/);
	assert.match(routing, /phaseo routing successors set/);
	const observability = renderHelp(["observability", "destinations"]);
	assert.match(observability, /phaseo observability destinations create/);
	assert.match(observability, /phaseo observability destinations test-config/);
	assert.equal((observability.match(/phaseo observability destinations test-config/g) ?? []).length, 1);
	assert.match(renderHelp(["profile"]), /phaseo profile update/);
});
