import { afterEach, describe, expect, it, vi } from "vitest";
import { syncProviderCatalog } from "./provider-catalog-sync";
vi.mock("@/data/supabase", () => ({ getDataClient: vi.fn() }));
vi.mock("@/lib/provider-model-notifications", () => ({ notifyPendingProviderModels: vi.fn(async () => undefined) }));
import { getDataClient } from "@/data/supabase";

const feedModel = { id: "sample/model", name: "Model", provider_model_slug: "model-1", capabilities: ["responses"], availability: "not_ready" };

function client({ reviewStatus, applyError }: { reviewStatus?: string; applyError?: string } = {}) {
	const source = { provider_slug: "sample", status: "active", management_mode: "remote", catalog_url: "https://example.invalid/models", etag: null, last_modified: null, poll_interval_seconds: 3600, consecutive_failures: 0, updated_at: "2026-10-07T00:00:00Z", created_by: "owner-user" };
	const rows: Record<string, unknown> = {
		provider_catalog_sources: source,
		provider_catalog_sync_runs: { id: "run-1" },
		v2_providers: { metadata: reviewStatus ? { self_serve: { provider_review_status: reviewStatus } } : {} },
		provider_account_links: { status: "active", linked_by: "owner-user" },
		provider_onboarding_submissions: [],
	};
	function query(table: string) {
		const result = () => ({ data: rows[table] ?? [], error: null });
		const builder: Record<string, unknown> = {
			maybeSingle: async () => result(), single: async () => result(),
			then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
		};
		for (const method of ["select", "eq", "in", "gt", "order", "limit", "update", "insert"]) builder[method] = () => builder;
		return builder;
	}
	const rpc = vi.fn(async (name: string) => name === "apply_provider_catalog_feed_snapshot" && applyError
		? { data: null, error: { code: "P0001", message: applyError } }
		: { data: name === "claim_provider_catalog_sync" ? true : name === "consume_provider_catalog_refresh" ? false : name === "apply_provider_catalog_feed_snapshot" ? 1 : true, error: null });
	vi.mocked(getDataClient).mockReturnValue({ from: query, rpc } as never);
	return rpc;
}

function serveFeed(document: unknown) {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).startsWith("https://cloudflare-dns.com/")
		? Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] })
		: Response.json(document));
}

describe("feed-declared rate limits", () => {
	afterEach(() => vi.restoreAllMocks());

	it("replaces limits from the feed without review or a version check", async () => {
		const rpc = client({ reviewStatus: "approved" });
		serveFeed({ data: [feedModel], rate_limits: [{ requests_per_minute: 100 }, { model: "model-1", tokens_per_day: 5_000_000 }] });
		expect((await syncProviderCatalog({} as never, "sample", "webhook")).status).toBe("applied");
		expect(rpc).toHaveBeenCalledWith("save_provider_rate_limits", {
			p_provider_slug: "sample", p_actor_id: null, p_actor_kind: "provider", p_expected_version: null, p_check_version: false,
			p_limits: [
				{ model: null, requests_per_minute: 100, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null },
				{ model: "model-1", requests_per_minute: null, requests_per_day: null, tokens_per_minute: null, tokens_per_day: 5_000_000 },
			],
		});
		expect(rpc).toHaveBeenCalledWith("apply_provider_catalog_feed_snapshot", expect.anything());
	});

	it.each(["provider_catalog_version_conflict", "provider_catalog_namespace_not_owned"])("keeps current limits when the snapshot itself fails to apply (%s)", async (applyError) => {
		const rpc = client({ reviewStatus: "approved", applyError });
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		serveFeed({ data: [feedModel], rate_limits: [{ requests_per_minute: 100 }] });
		await syncProviderCatalog({} as never, "sample", "manual").catch(() => undefined);
		expect(rpc).toHaveBeenCalledWith("apply_provider_catalog_feed_snapshot", expect.anything());
		expect(rpc).not.toHaveBeenCalledWith("save_provider_rate_limits", expect.anything());
	});

	it("applies limits after the snapshot", async () => {
		const rpc = client({ reviewStatus: "approved" });
		serveFeed({ data: [feedModel], rate_limits: [{ requests_per_minute: 100 }] });
		await syncProviderCatalog({} as never, "sample", "manual");
		const order = rpc.mock.calls.map(([name]) => name);
		expect(order.indexOf("save_provider_rate_limits")).toBeGreaterThan(order.indexOf("apply_provider_catalog_feed_snapshot"));
	});

	it("leaves console-managed limits alone when the feed declares none", async () => {
		const rpc = client({ reviewStatus: "approved" });
		serveFeed({ data: [feedModel] });
		expect((await syncProviderCatalog({} as never, "sample", "poll")).status).toBe("applied");
		expect(rpc).not.toHaveBeenCalledWith("save_provider_rate_limits", expect.anything());
	});

	it("waits for the provider application to be approved", async () => {
		const rpc = client({ reviewStatus: "awaiting_approval" });
		serveFeed({ data: [feedModel], rate_limits: [{ requests_per_minute: 100 }] });
		expect((await syncProviderCatalog({} as never, "sample", "manual")).status).toBe("applied");
		expect(rpc).not.toHaveBeenCalledWith("save_provider_rate_limits", expect.anything());
	});

	it("rejects the snapshot when a limit names a model outside the feed", async () => {
		const rpc = client({ reviewStatus: "approved" });
		serveFeed({ data: [feedModel], rate_limits: [{ model: "sample/model", requests_per_minute: 100 }] });
		expect((await syncProviderCatalog({} as never, "sample", "manual")).status).toBe("rejected");
		expect(rpc).not.toHaveBeenCalledWith("save_provider_rate_limits", expect.anything());
		expect(rpc).not.toHaveBeenCalledWith("apply_provider_catalog_feed_snapshot", expect.anything());
	});
});
