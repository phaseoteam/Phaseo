// Purpose: Buffered requests keep the server-tool counters that only the executor's own
//          (authoritative) usage carries, such as Claude's web_search_requests.
// Why: Buffered clients are billed from the materialised client-protocol stream, which has no
//      server-tool counters, so Claude web searches were unbilled on buffered requests (AUDIT N21).

import { describe, expect, it, vi } from "vitest";
import { readAuthoritativeServerToolMeters } from "./text-generate";

describe("readAuthoritativeServerToolMeters", () => {
	it("returns the search counters from an authoritative usage finalizer", async () => {
		const usageFinalizer = vi.fn(async () => ({
			usage: { input_tokens: 10, native_web_search_requests: 2, server_tool_use: { web_search_requests: 2 } },
		}));
		await expect(readAuthoritativeServerToolMeters({ usageFinalizerAuthoritative: true, usageFinalizer }))
			.resolves.toEqual({ native_web_search_requests: 2, server_tool_use: { web_search_requests: 2 } });
	});

	it("does not call a finalizer that is not authoritative", async () => {
		const usageFinalizer = vi.fn(async () => ({ usage: { native_web_search_requests: 2 } }));
		await expect(readAuthoritativeServerToolMeters({ usageFinalizer })).resolves.toBeNull();
		expect(usageFinalizer).not.toHaveBeenCalled();
	});

	it("returns null without counters or when the finalizer fails", async () => {
		await expect(readAuthoritativeServerToolMeters({
			usageFinalizerAuthoritative: true,
			usageFinalizer: async () => ({ usage: { input_tokens: 10 } }),
		})).resolves.toBeNull();
		await expect(readAuthoritativeServerToolMeters({
			usageFinalizerAuthoritative: true,
			usageFinalizer: async () => { throw new Error("boom"); },
		})).resolves.toBeNull();
	});
});
