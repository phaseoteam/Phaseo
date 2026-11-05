// The request detail applies the workspace's contents setting to search queries and fetched URLs,
// not only to the I/O log.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataClient } from "@/data/supabase";
import { investigateGeneration, runWithUsageContext } from "./actions";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as any;
afterEach(() => vi.unstubAllGlobals());

const detailMetadata = {
	labels: { team: "a" },
	search_observability: {
		usedManagedWebSearch: true, resultCount: 1, citationCount: 0,
		results: [{ title: "Secret result", url: "https://secret.example/r", snippet: "s" }],
		citations: [], nativeSearches: [], managedSearches: [{ query: "acquisition target", resultCount: 1 }],
	},
	web_fetch_observability: { requestCount: 1, fetches: [{ url: "https://secret.example/page", finalUrl: null, title: "Secret page", status: 200 }] },
};

async function detailFor(role: string, contentsAccess: "members" | "admins") {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = decodeURIComponent(input instanceof Request ? input.url : String(input));
		void init;
		if (url.includes("/rest/v1/gateway_requests")) return Response.json({ request_id: "req-1", workspace_id: "ws-1", detail_metadata: detailMetadata, provider_attempts: [] });
		if (url.includes("/rest/v1/workspace_settings")) return Response.json({ io_logging_contents_access: contentsAccess });
		if (url.includes("/rpc/")) return Response.json(null);
		return Response.json([]);
	}));
	const account = { client: getDataClient(env), workspaceId: "ws-1", role, user: { id: "user-1" } } as any;
	const result = await runWithUsageContext({ account, env }, () => investigateGeneration("req-1"));
	expect(result.success).toBe(true);
	return result.data!;
}

describe("request detail search and fetch details", () => {
	it("hides them from members when contents are limited to owners and admins", async () => {
		const data = await detailFor("member", "admins");
		expect(JSON.stringify(data.request)).not.toContain("secret.example");
		expect(JSON.stringify(data.request)).not.toContain("acquisition target");
		expect(data.request.detail_metadata).toMatchObject({
			labels: { team: "a" },
			search_observability: { resultCount: 1, results: [], managedSearches: [] },
			web_fetch_observability: { requestCount: 1, fetches: [{ url: null, finalUrl: null, title: null, status: 200 }] },
		});
		expect(data.ioLog).toMatchObject({ status: "restricted" });
	});

	it("shows them to admins and, by default, to members", async () => {
		for (const [role, access] of [["admin", "admins"], ["member", "members"]] as const) {
			const data = await detailFor(role, access);
			expect(data.request.detail_metadata).toMatchObject(detailMetadata);
		}
	});
});
