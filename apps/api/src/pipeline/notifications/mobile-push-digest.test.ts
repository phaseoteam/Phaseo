import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ rpc: state.rpc }),
}));

const { buildMobilePushDigestMessage, hasMobilePushDigestActivity, isMobilePushDigestWindow, runMobilePushDigestJob } = await import("./mobile-push-digest");
const { EXPO_PUSH_SEND_URL } = await import("./mobile-push");

type Digest = Parameters<typeof buildMobilePushDigestMessage>[0];

const workspaceId = "10000000-0000-4000-8000-000000000001";

function digest(id: string, overrides: Partial<Digest> = {}): Digest {
	return {
		id, attempts: 1, expoPushToken: `ExponentPushToken[${id}]`, channelScheme: 2,
		title: "Your Phaseo week: $42.18 spent, up 12%",
		body: "Acme and 2 other workspaces: 12,340 requests · 18.2M tokens · Top model: Claude Sonnet 5.5 · 6 new models launched",
		href: `/account/week?workspace=${workspaceId}&week=2026-W43`, tag: "digest:2026-W43", isoWeek: "2026-W43",
		workspaceId, workspaceName: "Acme", ...overrides,
	};
}

type RpcHandler = (args: Record<string, unknown>) => { data: unknown; error: null | { message: string } };

function mockRpc(handlers: Record<string, RpcHandler[]>) {
	state.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
		const handler = handlers[name]?.shift();
		if (!handler) throw new Error(`unexpected rpc ${name}`);
		return handler(args);
	});
}

const claimResult = (pushes: Digest[], extra: Record<string, unknown> = {}) => ({
	data: { built: 0, skipped: 0, queued: 0, deferred: 0, more: false, closed: 0, pushes, ...extra },
	error: null,
});

const fetchMock = vi.fn();
// Sunday 25 October 2026, 18:00 UTC.
const sunday = new Date("2026-10-25T18:00:00Z");

describe("weekly digest push", () => {
	beforeEach(() => {
		state.rpc.mockReset();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("sends text only, on the digest channel, tagged by ISO week", () => {
		expect(buildMobilePushDigestMessage(digest("a"))).toEqual({
			to: "ExponentPushToken[a]",
			title: "Your Phaseo week: $42.18 spent, up 12%",
			body: "Acme and 2 other workspaces: 12,340 requests · 18.2M tokens · Top model: Claude Sonnet 5.5 · 6 new models launched",
			data: {
				href: `/account/week?workspace=${workspaceId}&week=2026-W43`, kind: "weekly_summary", category: "digest", modelId: null, group: null,
				workspaceId, workspaceName: "Acme",
			},
			channelId: "digest",
			sound: null,
			tag: "digest:2026-W43",
			collapseId: "digest:2026-W43",
		});
		// Old builds only have the one channel.
		expect(buildMobilePushDigestMessage(digest("b", { channelScheme: 1 })).channelId).toBe("model-updates");
		expect(buildMobilePushDigestMessage(digest("c", { workspaceName: null })).data.workspaceName).toBeNull();
		const message = JSON.stringify(buildMobilePushDigestMessage(digest("d")));
		expect(message).not.toMatch(/image|richContent|attachment/i);
	});

	it("only runs from Sunday to Tuesday UTC", () => {
		expect(isMobilePushDigestWindow(new Date("2026-10-24T23:59:59Z"))).toBe(false);
		expect(isMobilePushDigestWindow(new Date("2026-10-25T00:00:00Z"))).toBe(true);
		expect(isMobilePushDigestWindow(new Date("2026-10-26T18:00:00Z"))).toBe(true);
		expect(isMobilePushDigestWindow(new Date("2026-10-27T23:59:59Z"))).toBe(true);
		expect(isMobilePushDigestWindow(new Date("2026-10-28T00:00:00Z"))).toBe(false);
		expect(isMobilePushDigestWindow(new Date("2026-10-30T12:00:00Z"))).toBe(false);
	});

	it("makes no query outside those days", async () => {
		const summary = await runMobilePushDigestJob({ now: new Date("2026-10-28T12:00:00Z") });
		expect(state.rpc).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(hasMobilePushDigestActivity(summary)).toBe(false);
	});

	it("makes one call when nothing is due", async () => {
		mockRpc({ claim_mobile_push_digests: [() => claimResult([])] });
		const summary = await runMobilePushDigestJob({ now: sunday });
		expect(state.rpc).toHaveBeenCalledTimes(1);
		expect(state.rpc).toHaveBeenCalledWith("claim_mobile_push_digests", { p_limit: 100, p_claim_token: expect.any(String) });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(hasMobilePushDigestActivity(summary)).toBe(false);
	});

	it("sends what is due and records the results under the same claim", async () => {
		const claims: string[] = [];
		mockRpc({
			claim_mobile_push_digests: [(args) => {
				claims.push(String(args.p_claim_token));
				return claimResult([digest("phone"), digest("tablet"), digest("gone")], { built: 1, queued: 3, deferred: 1, closed: 2 });
			}],
			complete_mobile_push_deliveries: [(args) => {
				expect(args.p_claim_token).toBe(claims[0]);
				expect(args.p_results).toEqual([
					{ id: "phone", status: "sent", ticketId: "ticket-phone" },
					{ id: "tablet", status: "retry", errorCode: "MessageRateExceeded" },
					{ id: "gone", status: "failed", errorCode: "DeviceNotRegistered", errorMessage: "not registered" },
				]);
				return { data: { sent: 1, retrying: 1, failed: 1, invalidated: 1 }, error: null };
			}],
		});
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [
			{ status: "ok", id: "ticket-phone" },
			{ status: "error", details: { error: "MessageRateExceeded" } },
			{ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
		] }), { status: 200 }));

		const summary = await runMobilePushDigestJob({ now: sunday, accessToken: "expo-token" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(EXPO_PUSH_SEND_URL);
		expect((init.headers as Record<string, string>).authorization).toBe("Bearer expo-token");
		const sent = JSON.parse(String(init.body)) as Array<{ to: string; channelId: string; tag: string; collapseId: string; data: { kind: string } }>;
		expect(sent.map((message) => [message.to, message.channelId, message.tag, message.collapseId, message.data.kind])).toEqual([
			["ExponentPushToken[phone]", "digest", "digest:2026-W43", "digest:2026-W43", "weekly_summary"],
			["ExponentPushToken[tablet]", "digest", "digest:2026-W43", "digest:2026-W43", "weekly_summary"],
			["ExponentPushToken[gone]", "digest", "digest:2026-W43", "digest:2026-W43", "weekly_summary"],
		]);
		expect(summary).toEqual({ built: 1, skipped: 0, queued: 3, deferred: 1, closed: 2, claimed: 3, sent: 1, retrying: 1, failed: 1, invalidated: 1 });
		expect(hasMobilePushDigestActivity(summary)).toBe(true);
	});

	it("keeps going while more users wait to be written, then stops", async () => {
		mockRpc({
			claim_mobile_push_digests: [
				() => claimResult([], { built: 20, more: true }),
				() => claimResult([digest("a")], { built: 3 }),
			],
			complete_mobile_push_deliveries: [() => ({ data: { sent: 1, retrying: 0, failed: 0, invalidated: 0 }, error: null })],
		});
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ status: "ok", id: "t" }] }), { status: 200 }));
		const summary = await runMobilePushDigestJob({ now: sunday });
		expect(state.rpc.mock.calls.filter(([name]) => name === "claim_mobile_push_digests")).toHaveLength(2);
		expect(summary.built).toBe(23);
		expect(summary.sent).toBe(1);
	});

	it("sends at most ten full batches a run and leaves the rest for the next run", async () => {
		const full = Array.from({ length: 100 }, (_, index) => digest(`d${index}`));
		mockRpc({
			claim_mobile_push_digests: Array.from({ length: 11 }, () => () => claimResult(full)),
			complete_mobile_push_deliveries: Array.from({ length: 10 }, () => () => ({ data: { sent: 100, retrying: 0, failed: 0, invalidated: 0 }, error: null })),
		});
		fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: full.map((push) => ({ status: "ok", id: `t-${push.id}` })) }), { status: 200 }));
		const summary = await runMobilePushDigestJob({ now: sunday });
		expect(state.rpc.mock.calls.filter(([name]) => name === "claim_mobile_push_digests")).toHaveLength(10);
		expect(fetchMock).toHaveBeenCalledTimes(10);
		expect(summary).toMatchObject({ claimed: 1000, sent: 1000 });
	});

	it("retries every push when Expo cannot be reached", async () => {
		mockRpc({
			claim_mobile_push_digests: [() => claimResult([digest("a"), digest("b")])],
			complete_mobile_push_deliveries: [(args) => {
				expect(args.p_results).toEqual([
					{ id: "a", status: "retry", errorCode: "expo_push_http_503" },
					{ id: "b", status: "retry", errorCode: "expo_push_http_503" },
				]);
				return { data: { sent: 0, retrying: 2, failed: 0, invalidated: 0 }, error: null };
			}],
		});
		fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
		expect((await runMobilePushDigestJob({ now: sunday })).retrying).toBe(2);
	});

	it("fails loudly when the claim fails", async () => {
		mockRpc({ claim_mobile_push_digests: [() => ({ data: null, error: { message: "boom" } })] });
		await expect(runMobilePushDigestJob({ now: sunday })).rejects.toThrow("mobile_push_digest_claim_failed:boom");
	});
});
