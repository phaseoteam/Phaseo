import test from "node:test";
import assert from "node:assert/strict";
import {
	buildManagementRequest,
	confirmDestructive,
	managementCommandKeys,
	managementHelpEntries,
	readSecretFlag,
	renderManagementResult,
	resolveManagementCommand,
	runManagementCommand,
	type ManagementDeps,
	type ManagementInput,
} from "../src/management.ts";
import { helpKeyForCommand, isCommandGroup, parseArgs, renderHelp, shouldPrintUpdateNoticeForCommand } from "../src/index.ts";

const noInput: ManagementInput = {
	readStdin: async () => {
		throw new Error("stdin should not be read");
	},
	env: {},
};

async function build(argv: string[], input: ManagementInput = noInput) {
	const parsed = parseArgs(argv);
	return buildManagementRequest(parsed.command, parsed.flags, input);
}

function fakeDeps(overrides: Partial<ManagementDeps> = {}) {
	const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
	let written = "";
	const deps: ManagementDeps = {
		...noInput,
		request: async (path, options) => {
			calls.push({ path, ...options });
			return { data: { id: "res_1", name: "Result" } };
		},
		confirm: async () => false,
		interactive: false,
		write: (text) => {
			written += text;
		},
		...overrides,
	};
	return { deps, calls, output: () => written };
}

test("resolves the longest management command and keeps the remaining positional args", () => {
	const match = resolveManagementCommand(["identity", "scim", "tokens", "revoke", "tok_1"]);
	assert.equal(match?.key, "identity scim tokens revoke");
	assert.deepEqual(match?.args, ["tok_1"]);
	assert.equal(resolveManagementCommand(["nope", "list"]), null);
});

test("byok reads secrets from stdin or the environment, never argv", async () => {
	const fromStdin = await build(
		["byok", "create", "--provider", "openai", "--name", "Prod", "--routing-mode", "fallback", "--allowed-models", "openai/gpt-5,openai/gpt-5-mini", "--key-stdin"],
		{ readStdin: async () => "sk-from-stdin\n", env: {} },
	);
	assert.deepEqual(fromStdin, {
		method: "POST",
		path: "/byok",
		body: { name: "Prod", routing_mode: "fallback", allowed_models: ["openai/gpt-5", "openai/gpt-5-mini"], provider: "openai", key: "sk-from-stdin" },
	});

	const fromDefaultEnv = await build(["byok", "create", "--provider", "openai", "--name", "Prod"], { ...noInput, env: { PHASEO_BYOK_KEY: "sk-env" } });
	assert.equal(fromDefaultEnv.body?.key, "sk-env");

	const fromNamedEnv = await build(["byok", "create", "--provider", "openai", "--name", "Prod", "--key-env", "MY_KEY"], { ...noInput, env: { MY_KEY: "sk-named" } });
	assert.equal(fromNamedEnv.body?.key, "sk-named");

	await assert.rejects(build(["byok", "create", "--provider", "openai", "--name", "Prod", "--key", "sk-argv"]), /not accepted on the command line/);
	await assert.rejects(build(["byok", "create", "--provider", "openai", "--name", "Prod"]), /PHASEO_BYOK_KEY/);
	await assert.rejects(
		build(["byok", "create", "--provider", "openai", "--name", "Prod", "--key-env", "MISSING"]),
		/MISSING is empty or not set/,
	);
});

test("byok update only rotates the key when asked and requires a change", async () => {
	const rename = await build(["byok", "update", "cred_1", "--name", "Renamed", "--enabled", "false"], { ...noInput, env: { PHASEO_BYOK_KEY: "ignored" } });
	assert.deepEqual(rename, { method: "PATCH", path: "/byok/cred_1", body: { name: "Renamed", enabled: false } });
	await assert.rejects(build(["byok", "update", "cred_1"]), /Provide a field to update/);
	assert.deepEqual(await build(["byok", "reorder", "--provider", "openai", "--routing-mode", "priority", "--key-ids", "a,b"]), {
		method: "POST",
		path: "/byok/reorder",
		body: { provider: "openai", routing_mode: "priority", key_ids: ["a", "b"] },
	});
	assert.deepEqual(await build(["byok", "list", "--provider", "openai", "--limit", "5"]), { method: "GET", path: "/byok?provider=openai&limit=5" });
});

test("readSecretFlag leaves optional secrets unset", async () => {
	assert.equal(await readSecretFlag({}, { ...noInput, env: { PHASEO_BYOK_KEY: "x" } }, { flag: "key", defaultEnv: "PHASEO_BYOK_KEY", required: false }), undefined);
});

test("builds budget and department budget requests", async () => {
	assert.deepEqual(await build(["budgets", "create", "--interval", "monthly", "--limit", "250"]), {
		method: "POST",
		path: "/budgets",
		body: { interval: "monthly", limit: 250 },
	});
	assert.deepEqual(await build(["budgets", "update", "b1", "--limit", "10.5"]), { method: "PATCH", path: "/budgets/b1", body: { limit: 10.5 } });
	await assert.rejects(build(["budgets", "create", "--interval", "monthly"]), /--limit is required/);
	assert.deepEqual(await build(["department-budgets", "list", "--department", "d1"]), { method: "GET", path: "/department-budgets?department_id=d1" });
	assert.deepEqual(await build(["department-budgets", "create", "--department", "d1", "--interval", "weekly", "--limit", "5"]), {
		method: "POST",
		path: "/department-budgets",
		body: { department_id: "d1", interval: "weekly", limit: 5 },
	});
});

test("builds spend rule and spend block requests", async () => {
	assert.deepEqual(
		await build(["spend-rules", "create", "--name", "Cap", "--metric", "spend", "--period", "month", "--threshold-percents", "50,80,100", "--action", "block", "--destination-ids", "n1"]),
		{
			method: "POST",
			path: "/spend-rules",
			body: { name: "Cap", metric: "spend", period: "month", threshold_percents: [50, 80, 100], action: "block", destination_ids: ["n1"] },
		},
	);
	assert.deepEqual(await build(["spend-rules", "create", "--body-json", "{\"metric\":\"forecast\",\"runway_days\":7}", "--name", "Runway"]), {
		method: "POST",
		path: "/spend-rules",
		body: { metric: "forecast", runway_days: 7, name: "Runway" },
	});
	await assert.rejects(build(["spend-rules", "create", "--threshold-percents", "50,abc"]), /integers/);
	assert.deepEqual(await build(["spend-rules", "test", "r1"]), { method: "POST", path: "/spend-rules/r1/test", body: {} });
	assert.deepEqual(await build(["spend-rules", "preview", "r1"]), { method: "GET", path: "/spend-rules/r1/preview" });
	assert.deepEqual(await build(["spend-rules", "history", "r1", "--limit", "20"]), { method: "GET", path: "/spend-rules/r1/history?limit=20" });
	assert.deepEqual(await build(["spend-blocks", "list", "--include-lifted"]), { method: "GET", path: "/spend-blocks?include_lifted=true" });
	assert.deepEqual(await build(["spend-blocks", "lift", "blk_1"]), { method: "POST", path: "/spend-blocks/blk_1/lift", body: {} });
});

test("builds rate limit policy and assignment requests", async () => {
	assert.deepEqual(await build(["rate-limits", "policies", "create", "--name", "Tight", "--requests-per-minute", "60", "--fail-closed", "true"]), {
		method: "POST",
		path: "/rate-limits/policies",
		body: { name: "Tight", requests_per_minute: 60, fail_closed: true },
	});
	await assert.rejects(build(["rate-limits", "policies", "create", "--requests-per-minute", "1.5", "--name", "x"]), /must be an integer/);
	assert.deepEqual(await build(["rate-limits", "assignments", "list", "--policy", "p1", "--target-type", "key"]), {
		method: "GET",
		path: "/rate-limits/assignments?policy_id=p1&target_type=key",
	});
	assert.deepEqual(await build(["rate-limits", "assignments", "create", "--policy", "p1", "--target-type", "member", "--target", "u1"]), {
		method: "POST",
		path: "/rate-limits/assignments",
		body: { policy_id: "p1", target_type: "member", target_id: "u1" },
	});
	assert.deepEqual(await build(["rate-limits", "assignments", "update", "a1", "--policy", "p2"]), { method: "PATCH", path: "/rate-limits/assignments/a1", body: { policy_id: "p2" } });
});

test("builds observability requests and reads destination config from stdin", async () => {
	assert.deepEqual(await build(["observability", "logging-policy", "update", "--retention-days", "30", "--include-provider-payloads", "false"]), {
		method: "PATCH",
		path: "/observability/logging-policy",
		body: { retention_days: 30, include_provider_payloads: false },
	});
	assert.deepEqual(
		await build(["observability", "destinations", "create", "--type", "langfuse", "--name", "LF", "--config-stdin"], { readStdin: async () => "{\"secret_key\":\"sk\"}", env: {} }),
		{ method: "POST", path: "/observability/destinations", body: { name: "LF", type: "langfuse", config: { secret_key: "sk" } } },
	);
	await assert.rejects(build(["observability", "destinations", "create", "--type", "langfuse", "--name", "LF"]), /--config-stdin, --config-env or --config-json is required/);
	await assert.rejects(build(["observability", "destinations", "update", "d1", "--type", "s3"]), /cannot be changed/);
});

test("builds notification settings with nested auto top-up fields", async () => {
	assert.deepEqual(
		await build(["notifications", "settings", "update", "--auto-top-up", "true", "--auto-top-up-threshold-usd", "5", "--auto-top-up-amount-usd", "20", "--payment-method", "pm_1", "--low-balance-email", "true", "--low-balance-threshold-usd", "2.5"]),
		{
			method: "PATCH",
			path: "/notifications/settings",
			body: {
				auto_top_up: { enabled: true, balance_threshold_nanos: 5_000_000_000, amount_nanos: 20_000_000_000, payment_method_id: "pm_1" },
				low_balance_email: { enabled: true, threshold_usd: 2.5 },
			},
		},
	);
	await assert.rejects(build(["notifications", "settings", "update", "--auto-top-up-amount-usd", "20"]), /--auto-top-up true\|false is required/);
	await assert.rejects(build(["notifications", "settings", "update"]), /Provide a settings flag/);
});

test("builds notification destination and route requests", async () => {
	assert.deepEqual(
		await build(["notifications", "destinations", "create", "--name", "Ops", "--type", "slack", "--target-stdin"], { readStdin: async () => "https://hooks.example.test/abc\n", env: {} }),
		{ method: "POST", path: "/notifications/destinations", body: { name: "Ops", type: "slack", target: "https://hooks.example.test/abc" } },
	);
	assert.deepEqual(await build(["notifications", "destinations", "test", "n1"]), { method: "POST", path: "/notifications/destinations/n1/test", body: {} });
	assert.deepEqual(await build(["notifications", "destinations", "test", "--type", "email", "--target", "ops@example.test"]), {
		method: "POST",
		path: "/notifications/destinations/test",
		body: { type: "email", target: "ops@example.test" },
	});
	assert.deepEqual(await build(["notifications", "destinations", "rotate-secret", "n1"]), { method: "POST", path: "/notifications/destinations/n1/rotate-secret", body: {} });
	assert.deepEqual(await build(["notifications", "routes", "set", "spend_alert", "--destination-ids", "n1,n2"]), {
		method: "PUT",
		path: "/notifications/routes/spend_alert",
		body: { destination_ids: ["n1", "n2"] },
	});
	assert.deepEqual(await build(["notifications", "routes", "set", "spend_alert", "--clear"]), { method: "PUT", path: "/notifications/routes/spend_alert", body: { destination_ids: [] } });
});

test("builds dynamic route requests", async () => {
	assert.deepEqual(await build(["routing", "dynamic-routes", "create", "--name", "Cheap", "--config-json", "{\"schemaVersion\":2}"]), {
		method: "POST",
		path: "/routing/dynamic-routes",
		body: { name: "Cheap", config: { schemaVersion: 2 } },
	});
	assert.deepEqual(await build(["routing", "dynamic-routes", "delete", "r1", "--confirm-name", "Cheap route"]), {
		method: "DELETE",
		path: "/routing/dynamic-routes/r1?confirm_name=Cheap+route",
	});
	assert.deepEqual(await build(["routing", "dynamic-routes", "set-keys", "r1", "--key-ids", "k1,k2"]), { method: "PUT", path: "/routing/dynamic-routes/r1/keys", body: { key_ids: ["k1", "k2"] } });
	assert.deepEqual(await build(["routing", "dynamic-routes", "deploy", "r1", "3"]), { method: "POST", path: "/routing/dynamic-routes/r1/versions/3/deploy", body: {} });
	await assert.rejects(build(["routing", "dynamic-routes", "deploy", "r1"]), /Version is required/);
});

test("builds private model and classifier requests", async () => {
	const created = await build(
		["private-models", "create", "--model-reference", "acme/llm", "--name", "Acme", "--base-url", "https://llm.example.test/v1", "--upstream-model", "llm-1", "--context-length", "8192"],
		{ ...noInput, env: { PHASEO_PRIVATE_MODEL_CREDENTIAL: "secret-cred" } },
	);
	assert.deepEqual(created, {
		method: "POST",
		path: "/private-models",
		body: { model_reference: "acme/llm", name: "Acme", base_url: "https://llm.example.test/v1", upstream_model_id: "llm-1", context_length: 8192, credential: "secret-cred" },
	});
	await assert.rejects(build(["private-models", "update", "pm1", "--credential", "x"]), /not accepted on the command line/);
	assert.deepEqual(await build(["classifiers", "create", "--name", "Topic", "--model", "openai/gpt-5-mini", "--dimensions-json", "[{\"key\":\"topic\",\"values\":[]}]", "--sample-rate", "0.1"]), {
		method: "POST",
		path: "/classifiers",
		body: { name: "Topic", model: "openai/gpt-5-mini", dimensions: [{ key: "topic", values: [] }], sample_rate: 0.1 },
	});
	await assert.rejects(build(["classifiers", "create", "--name", "Topic", "--model", "m"]), /--dimensions-json is required/);
});

test("builds preset version, label, fork, upstream, and publisher requests", async () => {
	assert.deepEqual(await build(["presets", "versions", "list", "@support"]), { method: "GET", path: "/presets/%40support/versions" });
	assert.deepEqual(await build(["presets", "versions", "create", "p1", "--release-notes", "Tighter prompt"]), { method: "POST", path: "/presets/p1/versions", body: { release_notes: "Tighter prompt" } });
	assert.deepEqual(await build(["presets", "labels", "set", "p1", "production", "--version", "3"]), { method: "PUT", path: "/presets/p1/labels/production", body: { version: "3" } });
	await assert.rejects(build(["presets", "labels", "set", "p1", "production"]), /--version-id or --version/);
	assert.deepEqual(await build(["presets", "labels", "delete", "p1", "staging"]), { method: "DELETE", path: "/presets/p1/labels/staging" });
	assert.deepEqual(await build(["presets", "fork", "p1"]), { method: "POST", path: "/presets/p1/fork", body: {} });
	assert.deepEqual(await build(["presets", "upstream", "p1", "--version-id", "v9"]), { method: "POST", path: "/presets/p1/upstream", body: { version_id: "v9" } });
	assert.deepEqual(await build(["presets", "publisher", "set", "--handle", "acme"]), { method: "PUT", path: "/presets/publisher", body: { handle: "acme" } });
});

test("builds workspace role, invite, and join request requests", async () => {
	assert.deepEqual(await build(["workspaces", "set-role", "ws", "u1", "--role", "admin"]), { method: "PATCH", path: "/workspaces/ws/members/u1", body: { role: "admin" } });
	assert.deepEqual(await build(["workspaces", "invites", "create", "ws", "--role", "member", "--max-uses", "5"]), { method: "POST", path: "/workspaces/ws/invites", body: { role: "member", max_uses: 5 } });
	assert.deepEqual(await build(["workspaces", "invites", "revoke", "ws", "inv1"]), { method: "DELETE", path: "/workspaces/ws/invites/inv1" });
	assert.deepEqual(await build(["workspaces", "join-requests", "list", "ws", "--status", "pending"]), { method: "GET", path: "/workspaces/ws/join-requests?status=pending" });
	assert.deepEqual(await build(["workspaces", "join-requests", "approve", "ws", "jr1"]), { method: "POST", path: "/workspaces/ws/join-requests/jr1/approve", body: {} });
	assert.deepEqual(await build(["workspaces", "join-requests", "reject", "ws", "jr1"]), { method: "POST", path: "/workspaces/ws/join-requests/jr1/reject", body: {} });
});

test("builds identity requests", async () => {
	assert.deepEqual(await build(["identity", "sso", "update", "--enabled", "true", "--mode", "saml", "--domains", "acme.test,acme.example"]), {
		method: "PUT",
		path: "/identity/sso",
		body: { enabled: true, mode: "saml", domains: ["acme.test", "acme.example"] },
	});
	await assert.rejects(build(["identity", "sso", "update", "--mode", "saml"]), /--enabled is required/);
	assert.deepEqual(await build(["identity", "scim", "update", "--enabled", "false"]), { method: "PUT", path: "/identity/scim", body: { enabled: false } });
	assert.deepEqual(await build(["identity", "scim", "tokens", "create", "--label", "Okta"]), { method: "POST", path: "/identity/scim/tokens", body: { label: "Okta" } });
	assert.deepEqual(await build(["identity", "scim", "tokens", "revoke", "t1"]), { method: "DELETE", path: "/identity/scim/tokens/t1" });
	assert.deepEqual(await build(["identity", "directory", "update", "u1", "--department", "d1", "--department-position", "lead"]), {
		method: "PUT",
		path: "/identity/directory/members/u1",
		body: { department_id: "d1", department_position: "lead", department_mode: "department" },
	});
	assert.deepEqual(await build(["identity", "departments", "create", "--name", "Eng", "--color", "blue"]), { method: "POST", path: "/identity/departments", body: { name: "Eng", color: "blue" } });
	assert.deepEqual(await build(["identity", "departments", "set-member", "d1", "u1", "--position", "lead", "--primary", "true"]), {
		method: "PUT",
		path: "/identity/departments/d1/members/u1",
		body: { position: "lead", primary: true },
	});
	assert.deepEqual(await build(["identity", "group-mappings", "create", "--scim-group", "g1", "--department", "d1", "--access-role", "admin"]), {
		method: "POST",
		path: "/identity/group-mappings",
		body: { scim_group_id: "g1", department_id: "d1", access_role: "admin" },
	});
	assert.equal(resolveManagementCommand(["identity", "departments", "get", "d1"]), null);
});

test("builds workload identity, audit event, app, feedback, and test run requests", async () => {
	assert.deepEqual(
		await build(["workload-identity", "policies", "create", "--name", "CI", "--provider", "github_actions", "--owner-id", "acme", "--claim-conditions-json", "{\"repository\":\"acme/app\"}"]),
		{ method: "POST", path: "/workload-identity/policies", body: { name: "CI", provider: "github_actions", owner_id: "acme", claim_conditions: { repository: "acme/app" } } },
	);
	await assert.rejects(build(["workload-identity", "policies", "update", "p1", "--provider", "vercel"]), /Provide a field to update/);
	assert.deepEqual(await build(["audit-events", "list", "--action", "key.created", "--target-type", "key", "--limit", "10"]), {
		method: "GET",
		path: "/audit-events?limit=10&action=key.created&target_type=key",
	});
	assert.deepEqual(await build(["apps", "update", "a1", "--public", "false", "--docs-url", "https://docs.example.test"]), {
		method: "PATCH",
		path: "/apps/a1",
		body: { docs_url: "https://docs.example.test", is_public: false },
	});
	assert.deepEqual(await build(["apps", "merge", "a1", "--into", "a2"]), { method: "POST", path: "/apps/a1/merge", body: { target_app_id: "a2" } });
	assert.deepEqual(await build(["feedback", "create", "--request-id", "req_1", "--rating", "positive", "--score", "1"]), {
		method: "POST",
		path: "/feedback",
		body: { request_id: "req_1", rating: "positive", score: 1 },
	});
	assert.deepEqual(await build(["feedback", "summary", "--group-by", "preset", "--since", "2026-10-01"]), { method: "GET", path: "/feedback/summary?group_by=preset&since=2026-10-01" });
	assert.deepEqual(await build(["preset-test-runs", "update", "run1", "--status", "completed", "--summary-json", "{\"pass\":9}"]), {
		method: "PATCH",
		path: "/preset-test-runs/run1",
		body: { status: "completed", summary: { pass: 9 } },
	});
});

test("destructive commands require --yes when not interactive and prompt when interactive", async () => {
	const blocked = fakeDeps();
	await assert.rejects(runManagementCommand(["byok", "delete", "c1"], {}, blocked.deps), /Re-run with --yes/);
	assert.equal(blocked.calls.length, 0);

	const allowed = fakeDeps();
	assert.equal(await runManagementCommand(["byok", "delete", "c1"], { yes: true }, allowed.deps), true);
	assert.deepEqual(allowed.calls, [{ path: "/byok/c1", method: "DELETE", body: undefined }]);

	const declined = fakeDeps({ interactive: true, confirm: async () => false });
	await assert.rejects(runManagementCommand(["spend-blocks", "lift", "b1"], {}, declined.deps), /Cancelled/);
	assert.equal(declined.calls.length, 0);

	const accepted = fakeDeps({ interactive: true, confirm: async () => true });
	await runManagementCommand(["spend-blocks", "lift", "b1"], {}, accepted.deps);
	assert.equal(accepted.calls.length, 1);

	await assert.rejects(confirmDestructive("Danger.", { json: true }, { interactive: true, confirm: async () => true }), /--yes/);

	for (const tokens of [
		["identity", "scim", "tokens", "revoke", "t"],
		["workspaces", "invites", "revoke", "w", "i"],
		["notifications", "destinations", "rotate-secret", "n"],
		["apps", "merge", "a", "--into", "b"],
		["presets", "labels", "delete", "p", "l"],
		["routing", "dynamic-routes", "delete", "r"],
	]) {
		const parsed = parseArgs(tokens);
		const { deps, calls } = fakeDeps();
		await assert.rejects(runManagementCommand(parsed.command, parsed.flags, deps), /--yes/, tokens.join(" "));
		assert.equal(calls.length, 0);
	}
});

test("validation errors surface before the confirmation prompt", async () => {
	const { deps } = fakeDeps({ interactive: true, confirm: async () => assert.fail("should not prompt") });
	await assert.rejects(runManagementCommand(["apps", "merge", "a1"], {}, deps), /--into is required/);
});

test("human output hides one-time secrets unless --show-secret is passed", () => {
	const body = { data: { id: "tok_1", label: "Okta", token: "scim_secret_value" } };
	const hidden = renderManagementResult("identity scim tokens create", body, {});
	assert.match(hidden, /Created SCIM token: Okta/);
	assert.doesNotMatch(hidden, /scim_secret_value/);
	assert.match(hidden, /Secret hidden/);
	assert.match(renderManagementResult("identity scim tokens create", body, { "show-secret": true }), /Token: scim_secret_value/);

	const invite = renderManagementResult("workspaces invites create", { data: { id: "inv_1" }, token: "invite_token" }, {});
	assert.doesNotMatch(invite, /invite_token/);

	const detail = renderManagementResult("notifications destinations rotate-secret", { data: { id: "n1", name: "Hooks", signing_secret: "whsec_1" } }, {});
	assert.doesNotMatch(detail, /whsec_1/);
});

test("renders list and detail output for terminals", () => {
	assert.equal(
		renderManagementResult("byok list", { data: [{ id: "c1", name: "Prod", enabled: true }, { id: "c2", name: "Backup\u001b[31m", enabled: false }] }, {}),
		"on Prod c1\noff Backup [31m c2\n",
	);
	assert.equal(renderManagementResult("budgets list", { data: [] }, {}), "No results.\n");
	assert.equal(
		renderManagementResult("notifications routes list", { data: { spend_alert: ["n1", "n2"], low_balance: [] } }, {}),
		"Spend alert: n1, n2\nLow balance: none\n",
	);
	assert.equal(
		renderManagementResult("identity directory list", { data: { members: [{ user_id: "u1", email: "a@example.test" }] } }, {}),
		"Members:\n  a@example.test u1\n",
	);
});

test("--json prints the raw API response", async () => {
	const { deps, output } = fakeDeps();
	await runManagementCommand(["budgets", "get", "b1"], { json: true }, deps);
	assert.deepEqual(JSON.parse(output()), { data: { id: "res_1", name: "Result" } });
});

test("every management command has help, and nested groups resolve to their own help", () => {
	const entries = managementHelpEntries();
	for (const key of managementCommandKeys()) {
		assert.ok(entries[key]?.usage[0]?.startsWith(`phaseo ${key}`), key);
		assert.equal(helpKeyForCommand(key.split(" ")), key);
	}
	assert.equal(helpKeyForCommand(["rate-limits", "policies"]), "rate-limits policies");
	assert.equal(isCommandGroup("notifications destinations"), true);
	assert.equal(isCommandGroup("byok"), true);
	assert.match(renderHelp(["presets"]), /phaseo presets labels set/);
	assert.match(renderHelp(["presets"]), /phaseo presets create/);
	assert.match(renderHelp(["feedback"]), /feedback:read/);
	assert.match(renderHelp(["data-contribution"]), /data-contribution classifiers create/);
	assert.match(renderHelp([]), /phaseo byok --help/);
});

test("S1: secret fields in --body-json are rejected for BYOK and private models", async () => {
	const env = { ...noInput, env: { PHASEO_BYOK_KEY: "sk-env", PHASEO_PRIVATE_MODEL_CREDENTIAL: "cred-env" } };
	for (const field of ["key", "value", "api_key"]) {
		await assert.rejects(build(["byok", "update", "c1", "--body-json", JSON.stringify({ [field]: "sk-argv" })], env), /must not contain .*--key-stdin or --key-env/);
	}
	await assert.rejects(build(["byok", "create", "--provider", "openai", "--name", "P", "--body-json", "{\"key\":\"sk-argv\"}"], env), /must not contain key/);
	for (const field of ["credential", "api_key"]) {
		await assert.rejects(build(["private-models", "update", "pm1", "--body-json", JSON.stringify({ [field]: "x" })], env), /--credential-stdin or --credential-env/);
	}
	assert.deepEqual(await build(["byok", "update", "c1", "--body-json", "{\"name\":\"ok\"}"], env), { method: "PATCH", path: "/byok/c1", body: { name: "ok" } });
});

test("S1: observability destination config can come from a named environment variable", async () => {
	const input = { ...noInput, env: { LF_CONFIG: "{\"secret_key\":\"sk\"}" } };
	assert.deepEqual(await build(["observability", "destinations", "update", "d1", "--config-env", "LF_CONFIG"], input), {
		method: "PATCH",
		path: "/observability/destinations/d1",
		body: { config: { secret_key: "sk" } },
	});
	await assert.rejects(build(["observability", "destinations", "update", "d1", "--config-env", "MISSING"]), /MISSING is empty or not set/);
	assert.match(renderHelp(["observability", "destinations", "create"]), /process lists/);
});

test("S2: builds key rotate/invalidate, webhook test, analytics export, and event requests", async () => {
	assert.deepEqual(await build(["keys", "rotate", "k1", "--previous-key-expires-at", "2026-11-01T00:00:00Z"]), {
		method: "POST",
		path: "/keys/k1/rotate",
		body: { previous_key_expires_at: "2026-11-01T00:00:00Z" },
	});
	assert.deepEqual(await build(["keys", "invalidate", "k1"]), { method: "POST", path: "/keys/k1/invalidate", body: {} });
	assert.deepEqual(await build(["webhooks", "test", "w1"]), { method: "POST", path: "/webhook-endpoints/w1/test", body: {} });
	assert.deepEqual(await build(["analytics", "export", "--date", "2026-10-27", "--model", "openai/gpt-5", "--workspace", "ws"]), {
		method: "GET",
		path: "/analytics/export?date=2026-10-27&model=openai%2Fgpt-5&workspace_id=ws",
	});
	assert.deepEqual(await build(["events", "list", "--category", "outcome", "--event", "converted", "--limit", "5"]), {
		method: "GET",
		path: "/events?category=outcome&event=converted&limit=5",
	});
	assert.deepEqual(await build(["events", "create", "--event-name", "converted", "--request-id", "req_1", "--numeric-value", "1"]), {
		method: "POST",
		path: "/events",
		body: { event_name: "converted", request_id: "req_1", numeric_value: 1 },
	});
	await assert.rejects(build(["events", "create", "--category", "app"]), /--event-name is required/);

	const invalidate = fakeDeps();
	await assert.rejects(runManagementCommand(["keys", "invalidate", "k1"], {}, invalidate.deps), /--yes/);
	assert.equal(invalidate.calls.length, 0);

	const rotated = renderManagementResult("keys rotate", { data: { id: "k2", name: "Prod", key: "phaseo_v1_sk_secret" } }, {});
	assert.doesNotMatch(rotated, /phaseo_v1_sk_secret/);

	const csv = "date,model\r\n2026-10-27,openai/gpt-5\r\n";
	const exported = fakeDeps({ request: async () => csv });
	await runManagementCommand(["analytics", "export"], { json: true }, exported.deps);
	assert.equal(exported.output(), csv);
	assert.match(renderHelp(["keys"]), /phaseo keys rotate/);
	assert.match(renderHelp(["keys"]), /phaseo keys create/);
});

test("S3: --department sets department_mode so the override is kept", async () => {
	assert.deepEqual(await build(["identity", "directory", "update", "u1", "--department", "d1"]), {
		method: "PUT",
		path: "/identity/directory/members/u1",
		body: { department_id: "d1", department_mode: "department" },
	});
	await assert.rejects(build(["identity", "directory", "update", "u1", "--department", "d1", "--department-mode", "none"]), /--department-mode department/);
	assert.deepEqual((await build(["identity", "directory", "update", "u1", "--department-mode", "none"])).body, { department_mode: "none" });
});

test("S4: observability destination create requires --name before any request", async () => {
	const { deps, calls } = fakeDeps();
	await assert.rejects(
		runManagementCommand(["observability", "destinations", "create"], { type: "langfuse", "config-json": "{}" }, deps),
		/--name is required/,
	);
	assert.equal(calls.length, 0);
	assert.match(renderHelp(["observability", "destinations", "create"]), /--type <type> --name <name>/);
});

test("S5: keys rotate needs confirmation with or without --previous-key-expires-at", async () => {
	for (const flags of [{}, { "previous-key-expires-at": "2026-11-01T00:00:00Z" }, { json: true }]) {
		const { deps, calls } = fakeDeps();
		await assert.rejects(runManagementCommand(["keys", "rotate", "k1"], flags, deps), /Re-run with --yes/);
		assert.equal(calls.length, 0);
	}
	const declined = fakeDeps({ interactive: true, confirm: async () => false });
	await assert.rejects(runManagementCommand(["keys", "rotate", "k1"], {}, declined.deps), /Cancelled/);
	assert.equal(declined.calls.length, 0);
	const confirmed = fakeDeps();
	await runManagementCommand(["keys", "rotate", "k1"], { yes: true }, confirmed.deps);
	assert.deepEqual(confirmed.calls, [{ path: "/keys/k1/rotate", method: "POST", body: {} }]);
	assert.match(renderHelp(["keys", "rotate"]), /--yes/);
});

test("S6: analytics export stdout gets no update notice", () => {
	assert.equal(shouldPrintUpdateNoticeForCommand(["analytics", "export"]), false);
	assert.equal(shouldPrintUpdateNoticeForCommand(["analytics", "get"]), true);
	assert.equal(shouldPrintUpdateNoticeForCommand(["integrations", "credential"]), false);
});
