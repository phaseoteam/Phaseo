import { QueryObserver } from "@tanstack/react-query";
import { createWebQueryClient } from "./queryClient";
import { privateSettingsOptions } from "./privateSettings";
import { clearAccountQueryCache, invalidateAccountQueries } from "./invalidation";

const scope = { userId: "alice", workspaceId: "workspace-a" };
describe("private settings cache", () => {
	let client: ReturnType<typeof createWebQueryClient>;
	beforeEach(() => { jest.useFakeTimers(); client = createWebQueryClient(); });
	afterEach(() => { client.clear(); jest.useRealTimers(); });
	it.each(["apps", "keys", "teams", "routing", "guardrails", "privacy", "byok", "presets", "private-models", "transactions", "notifications", "profile", "broadcast", "webhooks", "oauth-apps", "oauth-apps/client-1", "beta", "observability/destinations/new/webhook"])("reuses %s for five minutes and revalidates on return", async (resource) => {
		const queryFn = jest.fn(async () => ({ name: resource }));
		const options = { ...privateSettingsOptions(scope, `/api/account/settings/${resource}`), queryFn };
		await client.fetchQuery(options);
		jest.advanceTimersByTime(299_999);
		await client.fetchQuery(options);
		expect(queryFn).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(1);
		await client.fetchQuery(options);
		expect(queryFn).toHaveBeenCalledTimes(2);
	});
	it("isolates accounts, workspaces, resources and filters", () => {
		const keys = [
			privateSettingsOptions(scope, "/keys"),
			privateSettingsOptions({ ...scope, userId: "bob" }, "/keys"),
			privateSettingsOptions({ ...scope, workspaceId: "workspace-b" }, "/keys"),
			privateSettingsOptions(scope, "/teams"),
			privateSettingsOptions(scope, "/teams?preferredWorkspaceId=other"),
			privateSettingsOptions(scope, "/oauth-apps/client-a"),
			privateSettingsOptions(scope, "/oauth-apps/client-b"),
			privateSettingsOptions(scope, "/observability/destinations/new/webhook"),
			privateSettingsOptions(scope, "/observability/destinations/new/langfuse"),
		].map((options) => JSON.stringify(options.queryKey));
		expect(new Set(keys).size).toBe(keys.length);
	});
	it("manual refresh and completed writes bypass freshness", async () => {
		const queryFn = jest.fn(async () => ["metadata"]);
		const options = { ...privateSettingsOptions(scope, "/keys"), queryFn };
		await client.fetchQuery(options);
		const observer = new QueryObserver(client, options);
		const stop = observer.subscribe(() => undefined);
		await observer.refetch();
		await invalidateAccountQueries(client);
		expect(queryFn).toHaveBeenCalledTimes(3);
		stop(); observer.destroy();
	});
	it("marks inactive views stale after mutations", async () => {
		const queryFn = jest.fn(async () => ["metadata"]);
		const options = { ...privateSettingsOptions(scope, "/keys"), queryFn };
		await client.fetchQuery(options);
		await invalidateAccountQueries(client);
		expect(queryFn).toHaveBeenCalledTimes(1);
		await client.fetchQuery(options);
		expect(queryFn).toHaveBeenCalledTimes(2);
	});
	it("does not poll or replace an open editor's draft on focus", () => {
		const options = privateSettingsOptions(scope, "/routing");
		expect(options.refetchInterval).toBe(false);
		expect(options.refetchOnWindowFocus).toBe(false);
		expect(options.refetchOnReconnect).toBe(false);
	});
	it("discards cached and in-flight settings on sign out", async () => {
		const options = privateSettingsOptions(scope, "/keys");
		client.setQueryData(options.queryKey, ["alice"]);
		let finish!: (value: string[]) => void;
		const pendingOptions = privateSettingsOptions(scope, "/teams");
		const pending = client.fetchQuery({ ...pendingOptions, queryFn: () => new Promise<string[]>((resolve) => { finish = resolve; }) }).catch(() => undefined);
		clearAccountQueryCache(client);
		finish(["late Alice response"]);
		await pending;
		expect(client.getQueryData(options.queryKey)).toBeUndefined();
		expect(client.getQueryData(pendingOptions.queryKey)).toBeUndefined();
		expect(client.getQueryData(privateSettingsOptions({ ...scope, userId: "bob" }, "/keys").queryKey)).toBeUndefined();
	});
});
