/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import catalogue from "../../../../../messages/en-GB/catalogue.json";
import ModelPricingInsightsClient from "./ModelPricingInsightsClient";

jest.mock("@/components/(data)/model/pricing/PricingInsights", () => ({
	__esModule: true,
	default: ({ historyRules, usageRows, effectivePricingRows }: { historyRules: unknown[]; usageRows: unknown[]; effectivePricingRows: unknown[] }) => (
		<output>{`history:${historyRules.length} usage:${usageRows.length} effective:${effectivePricingRows.length}`}</output>
	),
}));

let root: Root;
let container: HTMLDivElement;
const originalFetch = global.fetch;
let resolveHistory: (response: Response) => void;
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	jest.useFakeTimers();
	// Usage and effective pricing answer at once; history hangs until resolved.
	global.fetch = jest.fn((input: string | URL | Request) => {
		const url = String(input);
		if (url.includes("pricing-history")) return new Promise<Response>((resolve) => { resolveHistory = resolve; });
		return Promise.resolve(json({ rows: [{ dayBucket: "2026-10-01" }] }));
	}) as typeof fetch;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	global.fetch = originalFetch;
	jest.useRealTimers();
});

async function flush() {
	// React Query batches notifications on a zero-delay timer.
	for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(0); });
}

it("shows the loaded series once a slow one passes the wait, then fills it in", async () => {
	act(() => root.render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<NextIntlClientProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: catalogue }}>
				<ModelPricingInsightsClient modelId="lab/model" providers={[]} providerIds={["provider-a"]} />
			</NextIntlClientProvider>
		</QueryClientProvider>,
	));
	await flush();
	expect(container.querySelector("output")).toBeNull();
	expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();

	await act(async () => { jest.advanceTimersByTime(2_500); });
	await flush();
	expect(container.querySelector("output")?.textContent).toBe("history:0 usage:1 effective:1");

	await act(async () => { resolveHistory(json({ rules: [{ ruleId: "r1" }] })); });
	await flush();
	expect(container.querySelector("output")?.textContent).toBe("history:1 usage:1 effective:1");
	expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain("/api/_web/models/lab%2Fmodel/");
});
