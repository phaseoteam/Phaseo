import { it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PrivateSettingsProvider, PrivateSettingsQuery, revalidateStaleSettings, useSettingsWrite } from "./PrivateSettingsQuery";
import { readCachedSettings } from "@/features/settings/cachedSettingsActions";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { createClient } from "@/utils/supabase/client";
import { settleWrites } from "@/lib/query/settleWrites";

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useQueryClient: vi.fn() }));
vi.mock("@/lib/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/react", async () => {
	const { privateQuery } = await vi.importActual<{ privateQuery: Record<string, string> }>("../../../../messages/en-GB/settings-ui.json");
	return { useTranslations: () => (key: string) => privateQuery[key] };
});
vi.mock("@/features/settings/cachedSettingsActions", () => ({ readCachedSettings: vi.fn() }));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/web-api/client", async () => ({ ...(await vi.importActual("@/lib/web-api/client")), fetchAccountWebApi: vi.fn() }));
const scope = { userId: "alice", workspaceId: "workspace-a" };
let options: { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> };
const getSession = vi.fn();
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createClient).mockReturnValue({ auth: { getSession } } as never);
	getSession.mockResolvedValue({ data: { session: { user: { id: "alice" }, access_token: "test-token" } } });
	vi.mocked(useQuery).mockImplementation((value) => { options = value as never; return { data: { name: "private data" }, error: null, refetch: vi.fn() } as never; });
});
function render(resource?: "apps") {
	return renderToStaticMarkup(<PrivateSettingsProvider scope={scope}><PrivateSettingsQuery<{ name: string }> path="/api/account/settings/apps" resource={resource}>{(data) => <p>{data.name}</p>}</PrivateSettingsQuery></PrivateSettingsProvider>);
}
it.each([401, 402, 403, 404])("hides cached data after access fails with %s", (status) => {
	vi.mocked(useQuery).mockReturnValue({ data: { name: "private data" }, error: new WebApiError("/settings", status) } as never);
	const html = render();
	expect(html).not.toContain("private data");
	expect(html).toContain("Your session or workspace access changed");
});
it("retains data with a warning on transient errors", () => {
	vi.mocked(useQuery).mockReturnValue({ data: { name: "private data" }, error: new Error("offline") } as never);
	const html = render();
	expect(html).toContain("private data");
	expect(html).toContain("Refresh failed");
});
it("has no manual refresh button and leaves revalidation to the view", () => {
	const html = render();
	expect(html).toContain("private data");
	expect(html).not.toContain("<button");
	expect(options).toMatchObject({ refetchOnWindowFocus: false, refetchOnReconnect: false, refetchInterval: false });
});
it("revalidates only stale data and reports whether it changed", async () => {
	const data = { name: "a" };
	const refetch = vi.fn();
	await expect(revalidateStaleSettings({ data, isStale: false, refetch })).resolves.toBe(false);
	expect(refetch).not.toHaveBeenCalled();
	refetch.mockResolvedValueOnce({ isSuccess: true, data });
	await expect(revalidateStaleSettings({ data, isStale: true, refetch })).resolves.toBe(false);
	refetch.mockResolvedValueOnce({ isSuccess: true, data: { name: "b" } });
	await expect(revalidateStaleSettings({ data, isStale: true, refetch })).resolves.toBe(true);
	refetch.mockResolvedValueOnce({ isSuccess: false, data });
	await expect(revalidateStaleSettings({ data, isStale: true, refetch })).resolves.toBe(false);
});
it("does not initialize an editor from expired data while the first read is pending", () => {
	vi.mocked(useQuery).mockReturnValue({ data: { name: "expired draft" }, isStale: true, isFetching: true, isFetchedAfterMount: false } as never);
	expect(render()).not.toContain("expired draft");
});
it("renders a fresh cached editor immediately", () => {
	vi.mocked(useQuery).mockReturnValue({ data: { name: "fresh draft" }, isStale: false, isFetching: false, isFetchedAfterMount: false } as never);
	expect(render()).toContain("fresh draft");
});
it("keeps an already revalidated editor mounted during subsequent writes", () => {
	vi.mocked(useQuery).mockReturnValue({ data: { name: "current draft" }, isStale: true, isFetching: true, isFetchedAfterMount: true } as never);
	expect(render()).toContain("current draft");
});
it("does not fetch for the previous user's scope", async () => {
	getSession.mockResolvedValue({ data: { session: { user: { id: "bob" } } } });
	render("apps");
	await expect(options.queryFn({ signal: new AbortController().signal })).rejects.toMatchObject({ status: 401 });
	expect(readCachedSettings).not.toHaveBeenCalled();
	expect(fetchAccountWebApi).not.toHaveBeenCalled();
});
it("sends workspace and abort signal to the private API", async () => {
	render();
	const signal = new AbortController().signal;
	vi.mocked(fetchAccountWebApi).mockResolvedValue({ name: "fresh" });
	await options.queryFn({ signal });
	expect(fetchAccountWebApi).toHaveBeenCalledWith("/api/account/settings/apps?workspaceId=workspace-a", expect.anything(), { signal });
});
it("honors access denial returned by a production server action", async () => {
	vi.mocked(readCachedSettings).mockResolvedValue({ denied: 403 });
	render("apps");
	await expect(options.queryFn({ signal: new AbortController().signal })).rejects.toMatchObject({ status: 403 });
});
it("ignores a server-action response completed after cancellation", async () => {
	const controller = new AbortController();
	vi.mocked(readCachedSettings).mockImplementation(async () => { controller.abort(); return { data: { apps: [] } } as never; });
	render("apps");
	await expect(options.queryFn({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});

it("only invalidates once a write settles, without caching its secret response", async () => {
	const invalidateQueries = vi.fn(async () => undefined);
	vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries } as never);
	let write!: ReturnType<typeof useSettingsWrite>;
	function Capture() { write = useSettingsWrite(); return null; }
	renderToStaticMarkup(<Capture />);
	let finish!: (value: { plaintext: string }) => void;
	const operation = write(new Promise<{ plaintext: string }>((resolve) => { finish = resolve; }));
	expect(invalidateQueries).not.toHaveBeenCalled();
	finish({ plaintext: "one-time-test-secret" });
	await expect(operation).resolves.toEqual({ plaintext: "one-time-test-secret" });
	expect(invalidateQueries).toHaveBeenCalledTimes(1);
	await expect(write(Promise.reject(new Error("partial failure")))).rejects.toThrow("partial failure");
	expect(invalidateQueries).toHaveBeenCalledTimes(2);
});

it("fetches enterprise directories with same-origin credentials and no HTTP cache", async () => {
	const originalFetch = global.fetch;
	const request = vi.fn(async () => new Response(JSON.stringify({ members: [], departments: [] })));
	global.fetch = request;
	try {
		renderToStaticMarkup(<PrivateSettingsProvider scope={scope}><PrivateSettingsQuery path="/api/enterprise/directory" workspaceId="workspace-b">{() => <p>Directory</p>}</PrivateSettingsQuery></PrivateSettingsProvider>);
		const signal = new AbortController().signal;
		await options.queryFn({ signal });
		expect(request).toHaveBeenCalledWith("/api/enterprise/directory?workspaceId=workspace-b", { credentials: "same-origin", cache: "no-store", signal });
	} finally { global.fetch = originalFetch; }
});

it("invalidates partial bulk writes only after every sibling has settled", async () => {
	const invalidateQueries = vi.fn(async () => undefined);
	vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries } as never);
	let write!: ReturnType<typeof useSettingsWrite>;
	function Capture() { write = useSettingsWrite(); return null; }
	renderToStaticMarkup(<Capture />);
	let finish!: () => void;
	const slow = new Promise<void>((resolve) => { finish = resolve; });
	const result = write(settleWrites([Promise.reject(new Error("partial failure")), slow])).catch((error) => error);
	await Promise.resolve();
	await Promise.resolve();
	expect(invalidateQueries).not.toHaveBeenCalled();
	finish();
	expect(await result).toEqual(new Error("partial failure"));
	expect(invalidateQueries).toHaveBeenCalledTimes(1);
});
