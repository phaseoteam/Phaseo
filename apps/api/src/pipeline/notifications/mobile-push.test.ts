import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rpc: vi.fn(),
	events: [] as Array<{ id: string }>,
	eventQueries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({
		rpc: state.rpc,
		from: (table: string) => {
			const query: Record<string, unknown> = { table, filters: [] as unknown[] };
			const builder = {
				select: (columns: string) => { query.select = columns; return builder; },
				is: (column: string, value: unknown) => { (query.filters as unknown[]).push(["is", column, value]); return builder; },
				order: () => builder,
				limit: async (limit: number) => {
					query.limit = limit;
					state.eventQueries.push(query);
					const rows = state.events.splice(0, limit);
					return { data: rows, error: null };
				},
			};
			return builder;
		},
	}),
}));

const { buildMobilePushMessage, hasMobilePushActivity, mobilePushChannelId, receiptResult, runMobilePushJob, ticketResult, EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL } =
	await import("./mobile-push");

type Push = Parameters<typeof buildMobilePushMessage>[0];

function push(id: string, overrides: Partial<Push> = {}): Push {
	return {
		id, attempts: 1, expo_push_token: `ExponentPushToken[${id}]`, channel_scheme: 2, kind: "price_changed", category: "prices-providers",
		model_slug: "deepseek/deepseek-v4", title: "DeepSeek V4 input price fell from $0.28 to $0.14 per 1M tokens", body: "From DeepSeek.",
		href: "/models/deepseek/deepseek-v4", group_key: "price:deepseek/deepseek-v4", group_count: 1, tag: "price:deepseek/deepseek-v4:2026-10-19",
		deliveries: 1, ...overrides,
	};
}

// What claim_mobile_push_deliveries returns for one device after a lab released ten models.
const grouped = push("lead", {
	kind: "model_released", category: "new-models", model_slug: null, title: "DeepSeek released 10 models",
	body: "DeepSeek V5, V5 Lite, V5 Coder and 7 more", href: "/organisations/deepseek", group_key: "release:deepseek", group_count: 10,
	tag: "release:deepseek:2026-10-19", deliveries: 10,
});

type RpcHandler = (args: Record<string, unknown>) => { data: unknown; error: null | { message: string } };

// Runs with no workspace alerts and no low balance unless a test says otherwise. The sweep reads
// the watched workspaces' balances every run, so an idle one still reports what it watched.
const idleWorkspace: RpcHandler = () => ({ data: { captured: 0, events: 0, queued: 0, deferred: 0 }, error: null });
const idleLowBalance: RpcHandler = () => ({ data: { watched: 12, firstSeen: 0, dropped: 0, rearmed: 0, coveredByTopUp: 0, alerted: 0 }, error: null });
const idleDefaults: Record<string, RpcHandler> = { fan_out_workspace_push_events: idleWorkspace, sweep_low_balance_pushes: idleLowBalance };

function mockRpc(handlers: Record<string, RpcHandler | RpcHandler[]>) {
	state.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
		const handler = handlers[name] ?? idleDefaults[name];
		if (Array.isArray(handler)) return (handler.shift() ?? (() => ({ data: [], error: null })))(args);
		if (handler) return handler(args);
		throw new Error(`unexpected rpc ${name}`);
	});
}

const fetchMock = vi.fn();

describe("mobile push job", () => {
	beforeEach(() => {
		state.rpc.mockReset();
		state.events = [];
		state.eventQueries = [];
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("builds the message the app expects", () => {
		expect(buildMobilePushMessage(push("a"))).toEqual({
			to: "ExponentPushToken[a]",
			title: "DeepSeek V4 input price fell from $0.28 to $0.14 per 1M tokens",
			body: "From DeepSeek.",
			data: {
				href: "/models/deepseek/deepseek-v4", kind: "price_changed", category: "prices-providers", modelId: "deepseek/deepseek-v4",
				group: { key: "price:deepseek/deepseek-v4", count: 1 },
				workspaceId: null,
				workspaceName: null,
			},
			channelId: "prices-providers",
			sound: null,
			tag: "price:deepseek/deepseek-v4:2026-10-19",
			collapseId: "price:deepseek/deepseek-v4:2026-10-19",
		});
	});

	it("sends a lab's burst of releases as one summary that replaces the day's earlier one", () => {
		expect(buildMobilePushMessage(grouped)).toEqual({
			to: "ExponentPushToken[lead]",
			title: "DeepSeek released 10 models",
			body: "DeepSeek V5, V5 Lite, V5 Coder and 7 more",
			data: {
				href: "/organisations/deepseek", kind: "model_released", category: "new-models", modelId: null, group: { key: "release:deepseek", count: 10 },
				workspaceId: null, workspaceName: null,
			},
			channelId: "new-models",
			sound: null,
			tag: "release:deepseek:2026-10-19",
			collapseId: "release:deepseek:2026-10-19",
		});
	});

	it("leaves ungrouped pushes untagged", () => {
		const launch = push("g", {
			kind: "provider_launched", model_slug: null, title: "Groq is now on Phaseo", body: "40 models, including Llama 5, Qwen3 Max and Kimi K3.",
			href: "/api-providers/groq", group_key: null, group_count: null, tag: null,
		});
		const message = buildMobilePushMessage(launch);
		expect(message.data).toEqual({
			href: "/api-providers/groq", kind: "provider_launched", category: "prices-providers", modelId: null, group: null, workspaceId: null, workspaceName: null,
		});
		expect(message).not.toHaveProperty("tag");
		expect(message.channelId).toBe("prices-providers");
	});

	it("sends workspace alerts on their category's channel with the workspace in data", () => {
		const lowBalance = push("w", {
			kind: "low_balance", category: "money", model_slug: null, title: "Acme: balance is $3.20",
			body: "About 2 days left at this week's pace. Add credits to keep requests running.", href: "/settings/credits", group_key: null, group_count: null, tag: null,
			workspace_id: "50000000-0000-4000-8000-000000000001", workspace_name: "Acme",
		});
		const message = buildMobilePushMessage(lowBalance);
		expect(message).toEqual({
			to: "ExponentPushToken[w]",
			title: "Acme: balance is $3.20",
			body: "About 2 days left at this week's pace. Add credits to keep requests running.",
			data: {
				href: "/settings/credits", kind: "low_balance", category: "money", modelId: null, group: null,
				workspaceId: "50000000-0000-4000-8000-000000000001", workspaceName: "Acme",
			},
			channelId: "money",
			sound: null,
		});
		expect(buildMobilePushMessage({ ...lowBalance, category: "security" }).channelId).toBe("security");
		expect(buildMobilePushMessage({ ...lowBalance, channel_scheme: 1 }).channelId).toBe("model-updates");
	});

	it("uses the single model-updates channel for app builds on channel scheme 1", () => {
		expect(buildMobilePushMessage({ ...grouped, channel_scheme: 1 }).channelId).toBe("model-updates");
		expect(buildMobilePushMessage(push("old", { channel_scheme: 1 })).channelId).toBe("model-updates");
		expect(mobilePushChannelId("deprecations", 2)).toBe("deprecations");
		expect(mobilePushChannelId("deprecations", 3)).toBe("deprecations");
		expect(mobilePushChannelId("deprecations", null)).toBe("model-updates");
		// A device on scheme 2 has deleted model-updates, so an unknown category still lands somewhere it can be shown.
		expect(mobilePushChannelId(null, 2)).toBe("new-models");
		expect(mobilePushChannelId("unknown", 2)).toBe("new-models");
	});

	it("maps Expo tickets: ok is sent, unregistered devices fail, anything else retries", () => {
		expect(ticketResult("a", { status: "ok", id: "ticket-a" })).toEqual({ id: "a", status: "sent", ticketId: "ticket-a" });
		expect(ticketResult("b", { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }))
			.toEqual({ id: "b", status: "failed", errorCode: "DeviceNotRegistered", errorMessage: "gone" });
		expect(ticketResult("c", { status: "error", details: { error: "MessageRateExceeded" } })).toEqual({ id: "c", status: "retry", errorCode: "MessageRateExceeded" });
		expect(ticketResult("d", undefined)).toEqual({ id: "d", status: "retry", errorCode: "expo_push_error" });
	});

	it("captures, fans out each new event, sends due pushes and records the results", async () => {
		state.events = [{ id: "event-1" }, { id: "event-2" }];
		const completions: unknown[] = [];
		mockRpc({
			capture_catalogue_notification_events: (args) => {
				expect(args).toEqual({ p_limit: 2000, p_max_models_per_transaction: 20 });
				return { data: { emitted: 2, skippedTransactions: 1 }, error: null };
			},
			enqueue_mobile_push_deliveries: (args) => ({
				data: args.p_event_id === "event-1" ? { queued: 2, deferred: 1, suppressed: 0 } : { queued: 1, deferred: 0, suppressed: 1 },
				error: null,
			}),
			sweep_low_balance_pushes: (args) => {
				expect(args).toEqual({});
				return { data: { watched: 12, firstSeen: 0, dropped: 2, rearmed: 1, coveredByTopUp: 1, alerted: 1 }, error: null };
			},
			fan_out_workspace_push_events: (args) => {
				expect(args).toEqual({ p_limit: 200 });
				return { data: { captured: 3, events: 2, queued: 4, deferred: 1 }, error: null };
			},
			claim_mobile_push_deliveries: [
				(args) => {
					expect(args.p_limit).toBe(100);
					expect(args.p_claim_token).toMatch(/^[0-9a-f-]{36}$/);
					return { data: [grouped, push("b"), push("c")], error: null };
				},
			],
			complete_mobile_push_deliveries: (args) => {
				completions.push(args);
				return { data: { sent: 1, retrying: 1, failed: 1, invalidated: 1 }, error: null };
			},
			claim_mobile_push_receipts: () => ({ data: [], error: null }),
		});
		fetchMock.mockResolvedValueOnce(Response.json({ data: [
			{ status: "ok", id: "ticket-a" },
			{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
			{ status: "error", message: "slow down", details: { error: "MessageRateExceeded" } },
		] }));

		const summary = await runMobilePushJob({ accessToken: "expo-secret" });

		expect(summary).toMatchObject({
			captured: 2, skippedTransactions: 1, events: 2, workspaceCaptured: 3, workspaceEvents: 2, lowBalanceAlerts: 1, queued: 7, deferred: 2, suppressed: 1,
			claimed: 3, grouped: 9, sent: 1, retrying: 1, failed: 1, invalidated: 1, receipts: 0, workspaceError: null, lowBalanceError: null,
		});
		expect(state.eventQueries[0]).toMatchObject({ table: "catalogue_notification_events", select: "id", filters: [["is", "fanned_out_at", null]] });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(EXPO_PUSH_SEND_URL);
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer expo-secret");
		const sent = JSON.parse(String(init.body)) as Array<{ title: string; tag?: string }>;
		expect(sent).toHaveLength(3);
		expect(sent[0]).toMatchObject({ title: "DeepSeek released 10 models", tag: "release:deepseek:2026-10-19" });
		const [completion] = completions as Array<{ p_claim_token: string; p_results: unknown[] }>;
		expect(completion.p_claim_token).toBe((state.rpc.mock.calls.find(([name]) => name === "claim_mobile_push_deliveries")?.[1] as { p_claim_token: string }).p_claim_token);
		// One result per push, under the id the claim returned; the database applies it to every row the push carried.
		expect(completion.p_results).toEqual([
			{ id: "lead", status: "sent", ticketId: "ticket-a" },
			{ id: "b", status: "failed", errorCode: "DeviceNotRegistered", errorMessage: "not registered" },
			{ id: "c", status: "retry", errorCode: "MessageRateExceeded", errorMessage: "slow down" },
		]);
		const order = state.rpc.mock.calls.map(([name]) => name);
		expect(order.indexOf("fan_out_workspace_push_events")).toBeGreaterThan(order.lastIndexOf("enqueue_mobile_push_deliveries"));
		expect(order.indexOf("fan_out_workspace_push_events")).toBeLessThan(order.indexOf("claim_mobile_push_deliveries"));
		// The sweep records its drops just before the fan-out queues them, so they go out in this run.
		expect(order.filter((name) => name === "sweep_low_balance_pushes")).toHaveLength(1);
		expect(order.indexOf("sweep_low_balance_pushes")).toBeGreaterThan(order.lastIndexOf("enqueue_mobile_push_deliveries"));
		expect(order.indexOf("sweep_low_balance_pushes")).toBe(order.indexOf("fan_out_workspace_push_events") - 1);
		expect(hasMobilePushActivity(summary)).toBe(true);
	});

	it("still fans out workspace alerts and sends when the low-balance sweep fails, and reports the failure", async () => {
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			sweep_low_balance_pushes: () => ({ data: null, error: { message: "canceling statement due to statement timeout" } }),
			fan_out_workspace_push_events: () => ({ data: { captured: 1, events: 1, queued: 1, deferred: 0 }, error: null }),
			claim_mobile_push_deliveries: [() => ({ data: [push("a")], error: null })],
			complete_mobile_push_deliveries: () => ({ data: { sent: 1 }, error: null }),
			claim_mobile_push_receipts: () => ({ data: [], error: null }),
		});
		fetchMock.mockResolvedValueOnce(Response.json({ data: [{ status: "ok", id: "ticket-a" }] }));

		const summary = await runMobilePushJob();

		expect(summary).toMatchObject({
			lowBalanceAlerts: 0, workspaceEvents: 1, queued: 1, claimed: 1, sent: 1, workspaceError: null,
			lowBalanceError: "mobile_push_low_balance_sweep_failed:canceling statement due to statement timeout",
		});
		expect(hasMobilePushActivity({ ...summary, workspaceEvents: 0, queued: 0, claimed: 0, sent: 0 })).toBe(true);
	});

	it("still sends catalogue news when queueing workspace alerts fails, and reports the failure", async () => {
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			fan_out_workspace_push_events: () => ({ data: null, error: { message: "statement timeout" } }),
			claim_mobile_push_deliveries: [() => ({ data: [push("a")], error: null })],
			complete_mobile_push_deliveries: () => ({ data: { sent: 1 }, error: null }),
			claim_mobile_push_receipts: () => ({ data: [], error: null }),
		});
		fetchMock.mockResolvedValueOnce(Response.json({ data: [{ status: "ok", id: "ticket-a" }] }));

		const summary = await runMobilePushJob();

		expect(summary).toMatchObject({ claimed: 1, sent: 1, workspaceError: "mobile_push_workspace_fan_out_failed:statement timeout" });
		expect(hasMobilePushActivity({ ...summary, claimed: 0, sent: 0 })).toBe(true);
	});

	it("sends in batches of 100 under a fresh claim each time and omits the token header when unset", async () => {
		const full = Array.from({ length: 100 }, (_, index) => push(`p${index}`));
		const tokens: string[] = [];
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			claim_mobile_push_deliveries: [
				(args) => { tokens.push(String(args.p_claim_token)); return { data: full, error: null }; },
				(args) => { tokens.push(String(args.p_claim_token)); return { data: [push("last")], error: null }; },
			],
			complete_mobile_push_deliveries: (args) => ({ data: { sent: (args.p_results as unknown[]).length }, error: null }),
			claim_mobile_push_receipts: () => ({ data: [], error: null }),
		});
		fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
			const messages = JSON.parse(String(init.body)) as unknown[];
			return Response.json({ data: messages.map((_, index) => ({ status: "ok", id: `t${index}` })) });
		});

		const summary = await runMobilePushJob();

		expect(summary).toMatchObject({ claimed: 101, sent: 101 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).has("authorization")).toBe(false);
		expect(new Set(tokens).size).toBe(2);
	});

	it("retries every push in a request Expo rejected", async () => {
		const completions: Array<{ p_results: unknown[] }> = [];
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			claim_mobile_push_deliveries: [() => ({ data: [push("a"), push("b")], error: null })],
			complete_mobile_push_deliveries: (args) => { completions.push(args as { p_results: unknown[] }); return { data: { retrying: 2 }, error: null }; },
			claim_mobile_push_receipts: () => ({ data: [], error: null }),
		});
		fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

		expect(await runMobilePushJob()).toMatchObject({ claimed: 2, retrying: 2, sent: 0 });
		expect(completions[0].p_results).toEqual([
			{ id: "a", status: "retry", errorCode: "expo_push_http_503" },
			{ id: "b", status: "retry", errorCode: "expo_push_http_503" },
		]);
	});

	it("records the receipts Expo returned and leaves the rest to be asked for again", async () => {
		const recorded: unknown[] = [];
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			claim_mobile_push_deliveries: [() => ({ data: [], error: null })],
			claim_mobile_push_receipts: (args) => {
				expect(args).toEqual({ p_limit: 300 });
				return { data: [
					{ id: "a", expo_ticket_id: "ticket-a" }, { id: "b", expo_ticket_id: "ticket-b" }, { id: "c", expo_ticket_id: "ticket-c" },
				], error: null };
			},
			record_mobile_push_receipts: (args) => { recorded.push(args.p_results); return { data: { checked: 2, failed: 1, invalidated: 1 }, error: null }; },
		});
		// ticket-c's receipt is not ready yet, so Expo leaves it out.
		fetchMock.mockResolvedValueOnce(Response.json({ data: {
			"ticket-a": { status: "ok" },
			"ticket-b": { status: "error", message: "uninstalled", details: { error: "DeviceNotRegistered" } },
		} }));

		expect(await runMobilePushJob()).toMatchObject({ receipts: 3, receiptsPending: 1, receiptErrors: 1, invalidated: 1, receiptError: null });
		expect(fetchMock.mock.calls[0][0]).toBe(EXPO_PUSH_RECEIPTS_URL);
		expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ ids: ["ticket-a", "ticket-b", "ticket-c"] });
		expect(recorded).toEqual([[
			{ id: "a", status: "ok" },
			{ id: "b", status: "error", errorCode: "DeviceNotRegistered", errorMessage: "uninstalled" },
		]]);
	});

	it("records nothing when the receipt request fails, so every claimed receipt is asked for again", async () => {
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			claim_mobile_push_deliveries: [() => ({ data: [], error: null })],
			claim_mobile_push_receipts: () => ({ data: [{ id: "a", expo_ticket_id: "ticket-a" }, { id: "b", expo_ticket_id: "ticket-b" }], error: null }),
		});
		fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));

		expect(await runMobilePushJob()).toMatchObject({ receipts: 2, receiptsPending: 2, receiptErrors: 0, receiptError: "expo_receipts_http_429" });
		expect(state.rpc.mock.calls.some(([name]) => name === "record_mobile_push_receipts")).toBe(false);

		// A response without data (for example an error payload) records nothing either.
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0 }, error: null }),
			claim_mobile_push_deliveries: [() => ({ data: [], error: null })],
			claim_mobile_push_receipts: () => ({ data: [{ id: "a", expo_ticket_id: "ticket-a" }], error: null }),
		});
		fetchMock.mockResolvedValueOnce(Response.json({ errors: [{ code: "PUSH_TOO_MANY_RECEIPTS" }] }));
		expect(await runMobilePushJob()).toMatchObject({ receipts: 1, receiptsPending: 1, receiptError: null });
	});

	it("maps Expo receipts: ok and error close the ticket, a missing receipt does not", () => {
		expect(receiptResult("a", { status: "ok" })).toEqual([{ id: "a", status: "ok" }]);
		expect(receiptResult("b", { status: "error", details: { error: "MessageRateExceeded" } })).toEqual([{ id: "b", status: "error", errorCode: "MessageRateExceeded" }]);
		expect(receiptResult("c", { status: "error" })).toEqual([{ id: "c", status: "error", errorCode: "receipt_error" }]);
		expect(receiptResult("d", undefined)).toEqual([]);
	});

	it("does nothing visible when there is nothing to do, and fails loudly when the database does", async () => {
		mockRpc({
			capture_catalogue_notification_events: () => ({ data: { emitted: 0, skippedTransactions: 0 }, error: null }),
			claim_mobile_push_deliveries: [() => ({ data: [], error: null })],
			claim_mobile_push_receipts: () => ({ data: [], error: null }),
		});
		const idle = await runMobilePushJob();
		// The low-balance sweep watched workspaces but found no drop: not worth a log line.
		expect(state.rpc.mock.calls.some(([name]) => name === "sweep_low_balance_pushes")).toBe(true);
		expect(idle).toMatchObject({ lowBalanceAlerts: 0, lowBalanceError: null });
		expect(hasMobilePushActivity(idle)).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();

		mockRpc({ capture_catalogue_notification_events: () => ({ data: null, error: { message: "boom" } }) });
		await expect(runMobilePushJob()).rejects.toThrow("mobile_push_capture_failed:boom");
	});
});
