import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn() }));
vi.mock("@/data/supabase", () => ({
	getDataClient: () => ({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) }),
}));

import { handlePublicCataloguePurgeScheduledEvent, shouldPurgeCatalogue } from "./public-catalogue-purge";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const pending = (changedAgoMs: number, pendingAgoMs = changedAgoMs) => ({
	revision: 5,
	purged_revision: 4,
	changed_at: ago(changedAgoMs),
	pending_since: ago(pendingAgoMs),
});

let state: ReturnType<typeof pending> | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	state = pending(60_000);
	mocks.rpc.mockReset().mockImplementation((name: string) => {
		if (name === "get_public_catalogue_purge_state") {
			return { maybeSingle: async () => ({ data: state, error: null }) };
		}
		return Promise.resolve({ data: null, error: null });
	});
	mocks.insert.mockReset().mockResolvedValue({ error: null });
	fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const env = { REVALIDATION_SECRET: "secret" } as any;
const event = { scheduledTime: NOW } as ScheduledController;
const ctxWith = (purge: ReturnType<typeof vi.fn>) => ({ cache: { purge } });

it("waits for writes to go quiet, but not forever", () => {
	expect(shouldPurgeCatalogue({ ...pending(0), purged_revision: 5 }, NOW)).toBe(false);
	expect(shouldPurgeCatalogue(pending(10_000), NOW)).toBe(false);
	expect(shouldPurgeCatalogue(pending(30_000), NOW)).toBe(true);
	// Still writing every few seconds, but the change started 5 minutes ago.
	expect(shouldPurgeCatalogue(pending(5_000, 5 * 60_000), NOW)).toBe(true);
});

it("purges Cloudflare first, then the website, then records the revision", async () => {
	const order: string[] = [];
	const purge = vi.fn(async () => { order.push("cloudflare"); return { success: true }; });
	fetchMock.mockImplementation(async () => { order.push("website"); return new Response("{}"); });
	mocks.rpc.mockImplementation((name: string, args?: unknown) => {
		if (name === "get_public_catalogue_purge_state") return { maybeSingle: async () => ({ data: state, error: null }) };
		order.push(`${name}:${JSON.stringify(args)}`);
		return Promise.resolve({ error: null });
	});

	await handlePublicCataloguePurgeScheduledEvent(event, env, ctxWith(purge));

	expect(order).toEqual(["cloudflare", "website", 'mark_public_catalogue_purged:{"p_revision":5}']);
	expect(purge.mock.calls[0][0].tags).toEqual(expect.arrayContaining(["web-api-models", "web-api-model-details", "web-api-search"]));
	const [url, init] = fetchMock.mock.calls[0];
	expect(url).toBe("https://phaseo.app/api/cache/revalidate");
	expect(init.headers.authorization).toBe("Bearer secret");
	expect(JSON.parse(init.body)).toEqual({ scope: "catalogue" });
	expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ scope: "catalogue-auto", target_id: "5", purge_succeeded: true, purge_error: null }));
});

it("does nothing while the catalogue is unchanged", async () => {
	state = { ...pending(60_000), purged_revision: 5 };
	const purge = vi.fn();
	await handlePublicCataloguePurgeScheduledEvent(event, env, ctxWith(purge));
	expect(purge).not.toHaveBeenCalled();
	expect(fetchMock).not.toHaveBeenCalled();
});

it("leaves the change pending when the Cloudflare purge fails", async () => {
	const purge = vi.fn(async () => ({ success: false, errors: "rate limited" }));
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await handlePublicCataloguePurgeScheduledEvent(event, env, ctxWith(purge));
	expect(fetchMock).not.toHaveBeenCalled();
	expect(mocks.rpc).not.toHaveBeenCalledWith("mark_public_catalogue_purged", expect.anything());
	error.mockRestore();
});

it("still records the Cloudflare purge when the website call fails", async () => {
	const purge = vi.fn(async () => ({ success: true }));
	fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await handlePublicCataloguePurgeScheduledEvent(event, env, ctxWith(purge));
	expect(mocks.rpc).toHaveBeenCalledWith("mark_public_catalogue_purged", { p_revision: 5 });
	expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ purge_error: { website: "http_503" } }));
	error.mockRestore();
});
