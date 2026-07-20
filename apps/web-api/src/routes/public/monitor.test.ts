import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("public monitor history", () => {
	it("returns compact paged history through a parameterized Worker route", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("get_monitor_history_stats")
			? new Response(JSON.stringify([{ total_commits: 3, total_changes: 7, last_sha: "abc" }]), { status: 200 })
			: new Response(JSON.stringify([{ event_id: "event-1", committed_at: "2026-07-17", provider_kind: "model", model_id: "openai/gpt-test", field: "status", action: "changed" }]), { status: 200 })));
		const response = await app.request("https://phaseo.app/api/_web/monitor/history?commit_limit=2&commit_offset=0", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toBe("web-api-monitor-history");
		const payload = await response.json() as { hasMore: boolean; nextCommitOffset: number; totalChanges: number; entries: unknown[][] };
		expect(payload).toMatchObject({ hasMore: true, nextCommitOffset: 2, totalChanges: 7 });
		expect(payload.entries[0]?.slice(0, 4)).toEqual(["event-1", "2026-07-17", "model", "openai/gpt-test"]);
	});
});
