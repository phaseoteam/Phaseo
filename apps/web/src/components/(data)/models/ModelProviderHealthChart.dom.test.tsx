/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import ModelProviderHealthChart from "./ModelProviderHealthChart";

// The line chart needs layout jsdom does not have; the headline and its explanations are what is tested.
vi.mock("recharts", () => {
	const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	const Nothing = () => null;
	return { CartesianGrid: Nothing, Line: Nothing, LineChart: Pass, ResponsiveContainer: Pass, XAxis: Nothing, YAxis: Nothing };
});
vi.mock("@/components/ui/chart", () => ({
	ChartContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	ChartTooltip: () => null,
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	vi.useFakeTimers();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

function render(totals: Parameters<typeof ModelProviderHealthChart>[0]["totals"]) {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: catalogue }}>
			{/* One hour at 33.3% completed among idle hours: the hourly average would read about 97%. */}
			<ModelProviderHealthChart
				successSeries={[{ bucket: new Date().toISOString(), overallSuccessPct: null, worstProviderSuccessPct: null, requests: 0, reachabilityPct: 100, capacityPct: 100, callErrorPct: 33.3 }]}
				totals={totals}
			/>
		</AppIntlProvider>,
	));
}

const headline = () => Array.from(container.querySelectorAll("dl > div")).map((row) => [
	row.querySelector("dt")?.textContent,
	row.querySelector("dd")?.textContent,
]);

const labelButton = (label: string) => {
	const button = Array.from(container.querySelectorAll("dt button")).find((element) => element.textContent === label);
	if (!button) throw new Error(`no ${label} button`);
	return button as HTMLButtonElement;
};

/** Runs every pending timer (popover open, positioning) and the updates they schedule. */
async function settle() {
	await act(async () => { await vi.runAllTimersAsync(); });
}

it("shows the true 24-hour shares from attemptHealth24h, with the matching caption", () => {
	render({ reachabilityPct: 100, capacityPct: 100, callErrorPct: 33.3 });
	expect(headline()).toEqual([["Reachable", "100.0%"], ["Accepted", "100.0%"], ["Completed", "33.3%"]]);
	expect(container.textContent).toContain("Last 24 hours · share of all provider attempts.");
	expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
		"Provider health by hour over the last 24 hours. Across all attempts in that time, Reachable: 100.0%. Accepted: 100.0%. Completed: 33.3%.",
	);
});

it("reads 100% with no failures when there were no attempts in 24 hours", async () => {
	render(null);
	expect(headline()).toEqual([["Reachable", "100.0%"], ["Accepted", "100.0%"], ["Completed", "100.0%"]]);
	await act(async () => { labelButton("Completed").click(); });
	await settle();
	expect(document.body.textContent).toContain("No failures");
});

it("opens a metric's explanation on click, with the failure share behind the headline", async () => {
	render({ reachabilityPct: 100, capacityPct: 100, callErrorPct: 33.3 });
	const button = labelButton("Completed");
	expect(button.getAttribute("aria-expanded")).toBe("false");
	await act(async () => { button.click(); });
	await settle();
	expect(button.getAttribute("aria-expanded")).toBe("true");
	const popup = document.body.querySelector('[data-slot="popover-content"]');
	expect(popup?.textContent).toContain("Of the calls the provider accepted, how often they finished without a provider error.");
	expect(popup?.textContent).toContain("66.7% failed after the provider accepted them");
	// A second click closes it again.
	await act(async () => { button.click(); });
	await settle();
	expect(button.getAttribute("aria-expanded")).toBe("false");
});
