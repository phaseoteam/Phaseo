/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import catalogue from "../../../../../messages/en-GB/catalogue.json";
import { ProviderUptimeCell, UptimeSparkline, type UptimeTrendPoint } from "./ProviderCard";
import type { PricingRuntimeStats } from "./pricingRuntimeStats";

// ESM-only and unused by the uptime cell.
vi.mock("@number-flow/react", () => ({ __esModule: true, default: () => null }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	// Fake timers: the hover card's open delay is advanced, never waited on.
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
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

const points: UptimeTrendPoint[] = [
	{ dayOffset: 2, value: 100, noTraffic: true },
	{ dayOffset: 1, value: 50, noTraffic: false },
	{ dayOffset: 0, value: 99.5, noTraffic: false },
];

// Request counts that must never reach a public page.
const runtimeStats = {
	uptimePct3d: 74.6,
	healthRequests3d: 48_213,
	uptimeDaily3d: [
		{ dayOffset: 0, uptimePct: 99.5, requests: 31_877, noTraffic: false },
		{ dayOffset: 1, uptimePct: 50, requests: 16_336, noTraffic: false },
	],
	attemptHealth3d: { reachabilityPct: 99.9, capacityPct: 96.2, callErrorPct: 90, uptimePct: 74.6 },
} as unknown as PricingRuntimeStats;

function render(node: ReactNode) {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: catalogue }}>
			{node}
		</AppIntlProvider>,
	));
}

/** Runs every pending timer (open delays, positioning) and the updates they schedule. */
async function settle() {
	await act(async () => { await vi.runAllTimersAsync(); });
}

const card = () => document.body.querySelector('[data-slot="hover-card-content"]');

function renderCell() {
	render(<ProviderUptimeCell valueLabel="74.6%" uptimePct={74.6} runtimeStats={runtimeStats} points={points} />);
}

it("makes the whole cell one trigger instead of one per bar", () => {
	renderCell();
	const buttons = container.querySelectorAll("button");
	expect(buttons).toHaveLength(1);
	expect(buttons[0]!.getAttribute("aria-label")).toBe("3-day uptime: 74.6%");
	expect(buttons[0]!.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Daily uptime");
});

it("opens on tap with the 3-day rate, each UTC day and the attempt breakdown, but no counts", async () => {
	renderCell();
	const trigger = container.querySelector("button")!;
	await act(async () => {
		const down = new Event("pointerdown", { bubbles: true });
		Object.defineProperty(down, "pointerType", { value: "touch" });
		trigger.dispatchEvent(down);
		trigger.click();
	});
	await settle();
	const text = card()?.textContent ?? "";
	expect(text).toContain("3-day uptime");
	expect(text).toContain("Last 3 days · UTC");
	expect(card()?.querySelector('[data-slot="hover-card-stat"]')?.textContent).toBe("74.6%");
	const rows = Array.from(card()!.querySelectorAll("dt")).map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`);
	expect(rows).toEqual([
		"Tue 10 Nov=99.5%",
		"Mon 9 Nov=50.0%",
		"Sun 8 Nov=No traffic",
		"Reachable=99.9%",
		"Accepted=96.2%",
		"Completed=90.0%",
	]);
	for (const count of ["48,213", "48213", "31,877", "16,336"]) expect(text).not.toContain(count);
});

it("opens on keyboard focus", async () => {
	renderCell();
	await act(async () => { container.querySelector("button")!.focus(); });
	await settle();
	expect(card()?.textContent).toContain("3-day uptime");
});

it("shows a plain value without a card when no day has data", () => {
	const empty = points.map((point) => ({ ...point, value: null, noTraffic: true }));
	render(<ProviderUptimeCell valueLabel="--" uptimePct={null} runtimeStats={null} points={empty} />);
	expect(container.querySelectorAll("button")).toHaveLength(0);
	expect(container.textContent).toBe("--");
});

it("draws the sparkline as a picture, without buttons", () => {
	render(<UptimeSparkline points={points} />);
	expect(container.querySelectorAll("button")).toHaveLength(0);
	expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Daily uptime");
});
