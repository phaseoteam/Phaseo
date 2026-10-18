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

const { buildMobilePushMessage, hasMobilePushActivity, receiptResult, runMobilePushJob, ticketResult, EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL } = await import("./mobile-push");

function push(id: string, token = `ExponentPushToken[${id}]`) {
	return { id, event_id: "event-1", attempts: 1, expo_push_token: token, kind: "price_changed", model_slug: "deepseek/deepseek-v4",
		title: "DeepSeek V4 input price fell from $0.28 to $0.14 per 1M tokens", body: "From DeepSeek.", href: "/models/deepseek/deepseek-v4" };
}

type RpcHandler = (args: Record<string, unknown>) => { data: unknown; error: null | { message: string } };

function mockRpc(handlers: Record<string, RpcHandler | RpcHandler[]>) {
	state.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
		const handler = handlers[name];
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
			data: { href: "/models/deepseek/deepseek-v4", kind: "price_changed", modelId: "deepseek/deepseek-v4" },
			channelId: "model-updates",
			sound: null,
		});
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
			claim_mobile_push_deliveries: [
				(args) => {
					expect(args.p_limit).toBe(100);
					expect(args.p_claim_token).toMatch(/^[0-9a-f-]{36}$/);
					return { data: [push("a"), push("b"), push("c")], error: null };
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

		expect(summary).toMatchObject({ captured: 2, skippedTransactions: 1, events: 2, queued: 3, deferred: 1, suppressed: 1, claimed: 3, sent: 1, retrying: 1, failed: 1, invalidated: 1, receipts: 0 });
		expect(state.eventQueries[0]).toMatchObject({ table: "catalogue_notification_events", select: "id", filters: [["is", "fanned_out_at", null]] });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(EXPO_PUSH_SEND_URL);
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer expo-secret");
		expect(JSON.parse(String(init.body))).toHaveLength(3);
		const [completion] = completions as Array<{ p_claim_token: string; p_results: unknown[] }>;
		expect(completion.p_claim_token).toBe((state.rpc.mock.calls.find(([name]) => name === "claim_mobile_push_deliveries")?.[1] as { p_claim_token: string }).p_claim_token);
		expect(completion.p_results).toEqual([
			{ id: "a", status: "sent", ticketId: "ticket-a" },
			{ id: "b", status: "failed", errorCode: "DeviceNotRegistered", errorMessage: "not registered" },
			{ id: "c", status: "retry", errorCode: "MessageRateExceeded", errorMessage: "slow down" },
		]);
		expect(hasMobilePushActivity(summary)).toBe(true);
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
		expect(hasMobilePushActivity(idle)).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();

		mockRpc({ capture_catalogue_notification_events: () => ({ data: null, error: { message: "boom" } }) });
		await expect(runMobilePushJob()).rejects.toThrow("mobile_push_capture_failed:boom");
	});
});
