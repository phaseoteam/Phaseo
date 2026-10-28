import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOGIN_SCOPES, parseScopeArgument } from "../src/api.ts";
import { helpKeyForCommand, parseArgs, parseTopupAmountFlag, renderHelp, renderTopup, waitForTopup } from "../src/index.ts";

test("billing:write is opt-in and adds to the default login scopes", () => {
	assert.equal(DEFAULT_LOGIN_SCOPES.includes("billing:write"), false);
	const scopes = parseScopeArgument("billing:write").split(" ");
	assert.equal(scopes.includes("billing:write"), true);
	for (const scope of DEFAULT_LOGIN_SCOPES) assert.equal(scopes.includes(scope), true, `${scope} is kept`);
	assert.equal(scopes.length, DEFAULT_LOGIN_SCOPES.length + 1);
	assert.equal(parseScopeArgument("credits:read,billing:write"), "credits:read billing:write", "a mixed list stays narrow");
});

test("parses --amount in US dollars", () => {
	assert.equal(parseTopupAmountFlag("20"), 20);
	assert.equal(parseTopupAmountFlag("$12.50"), 12.5);
	assert.throws(() => parseTopupAmountFlag(undefined), /--amount <usd> is required/);
	assert.throws(() => parseTopupAmountFlag("0"), /positive number/);
	assert.throws(() => parseTopupAmountFlag("twenty"), /positive number/);
});

test("parses credits add flags", () => {
	const parsed = parseArgs(["credits", "add", "--amount", "20", "--no-wait", "--json", "--workspace", "ws_1"]);
	assert.deepEqual(parsed.command, ["credits", "add"]);
	assert.equal(parsed.flags.amount, "20");
	assert.equal(parsed.flags["no-wait"], true);
	assert.equal(parsed.flags.workspace, "ws_1");
	assert.equal(helpKeyForCommand(["credits", "add"]), "credits add");
	assert.equal(helpKeyForCommand(["credits", "topups", "get"]), "credits topups");
	assert.match(renderHelp(["credits"]), /phaseo login --scopes billing:write/);
	assert.match(renderHelp(["credits"]), /do not retry them automatically/);
});

test("renders a top-up for people and agents", () => {
	const text = renderTopup({
		id: "t_1", amount_usd: 20, status: "pending", reason: null, payment_method: { brand: "visa", last4: "4242" },
		message: "Waiting for a workspace owner or admin to confirm the charge.", expires_at: "2026-10-28T16:00:00.000Z",
	});
	assert.match(text, /Top-up t_1: \$20\.00 \(pending\)/);
	assert.match(text, /Card: visa ending 4242/);
	assert.match(text, /Expires: 2026-10-28T16:00:00.000Z/);
	assert.match(renderTopup({ id: "t_2", amount_usd: 12.5, status: "declined", reason: "declined" }), /\$12\.50 \(declined, declined\)/);
	assert.match(renderTopup({ id: "t_3", amount_usd: 20, status: "pending", checkout_url: "https://phaseo.app/settings/credits/topups/t_3?token=x" }), /Checkout: https:\/\/phaseo\.app/);
});

test("waits until the top-up is final", async () => {
	let clock = Date.parse("2026-10-28T15:00:00Z");
	const responses = [
		{ id: "t_1", status: "pending", final: false },
		{ id: "t_1", status: "confirmed", final: false },
		{ id: "t_1", status: "paid", final: true },
	];
	const updates: string[] = [];
	const result = await waitForTopup("t_1", { id: "t_1", status: "pending", final: false, expires_at: "2026-10-28T15:30:00Z" }, {
		fetchTopup: async () => responses.shift(),
		now: () => clock,
		sleepFn: async (ms) => { clock += ms; },
		onUpdate: (topup) => updates.push(topup.status),
	});
	assert.equal(result.timedOut, false);
	assert.equal(result.topup.status, "paid");
	assert.deepEqual(updates, ["confirmed", "paid"]);
});

test("stops on declined and expired without retrying", async () => {
	for (const status of ["declined", "expired", "failed"]) {
		let calls = 0;
		const result = await waitForTopup("t_1", { id: "t_1", status: "pending", final: false, expires_at: new Date(Date.now() + 60_000).toISOString() }, {
			fetchTopup: async () => { calls += 1; return { id: "t_1", status, reason: status, final: true }; },
			sleepFn: async () => undefined,
		});
		assert.equal(result.topup.status, status);
		assert.equal(calls, 1, `${status} ends polling`);
	}
});

test("gives up waiting five minutes after the request expires", async () => {
	let clock = Date.parse("2026-10-28T15:00:00Z");
	let calls = 0;
	const result = await waitForTopup("t_1", { id: "t_1", status: "pending", final: false, expires_at: "2026-10-28T15:30:00Z" }, {
		fetchTopup: async () => { calls += 1; return { id: "t_1", status: "confirmed", final: false }; },
		now: () => clock,
		sleepFn: async (ms) => { clock += ms; },
		intervalMs: 60_000,
	});
	assert.equal(result.timedOut, true);
	assert.equal(result.topup.status, "confirmed");
	assert.equal(calls, 35);
});
