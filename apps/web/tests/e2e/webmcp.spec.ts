import { expect, test } from "@playwright/test";

test.describe("site-wide WebMCP integration", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			const tools: Array<{ name: string; execute: (input: Record<string, unknown>) => unknown }> = [];
			Object.defineProperty(document, "modelContext", {
				configurable: true,
				value: {
					registerTool(tool: { name: string; execute: (input: Record<string, unknown>) => unknown }, options?: { signal?: AbortSignal }) {
						tools.push(tool);
						options?.signal?.addEventListener("abort", () => {
							const index = tools.indexOf(tool);
							if (index >= 0) tools.splice(index, 1);
						}, { once: true });
					},
				},
			});
			Object.defineProperty(window, "__PHASEO_WEBMCP_TEST_TOOLS__", { value: tools });
		});
	});

	test("registers existing Phaseo workflows on ordinary pages", async ({ page }) => {
		await page.goto("/about");
		await page.waitForFunction(() => ((window as typeof window & { __PHASEO_WEBMCP_TEST_TOOLS__?: unknown[] }).__PHASEO_WEBMCP_TEST_TOOLS__ ?? []).length === 8);
		const names = await page.evaluate(() => (
			(window as typeof window & { __PHASEO_WEBMCP_TEST_TOOLS__?: Array<{ name: string }> }).__PHASEO_WEBMCP_TEST_TOOLS__ ?? []
		).map((tool) => tool.name));
		expect(names).toEqual([
			"discover_phaseo_capabilities",
			"search_phaseo_models",
			"inspect_phaseo_model",
			"find_phaseo_gateway_routes",
			"compare_phaseo_model_evidence",
			"estimate_phaseo_text_cost",
			"open_phaseo_model_comparison",
			"open_phaseo_request_builder",
		]);
	});

	test("uses the existing catalogue search endpoint", async ({ page }) => {
		await page.route("**/api/_web/search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ m: [["openai/gpt-5", "GPT-5", "OpenAI reasoning", "/models/openai/gpt-5", "openai", "2026"]], o: [], b: [], p: [], s: [], c: [] }) }));
		await page.goto("/about");
		await page.waitForFunction(() => ((window as typeof window & { __PHASEO_WEBMCP_TEST_TOOLS__?: Array<{ name: string }> }).__PHASEO_WEBMCP_TEST_TOOLS__ ?? []).some((tool) => tool.name === "search_phaseo_models"));
		const result = await page.evaluate(async () => {
			const tools = (window as typeof window & { __PHASEO_WEBMCP_TEST_TOOLS__?: Array<{ name: string; execute: (input: Record<string, unknown>) => Promise<string> }> }).__PHASEO_WEBMCP_TEST_TOOLS__ ?? [];
			return tools.find((tool) => tool.name === "search_phaseo_models")?.execute({ query: "OpenAI reasoning" });
		});
		expect(JSON.parse(result ?? "{}").models[0].modelId).toBe("openai/gpt-5");
	});
});
