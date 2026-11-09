/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import catalogue from "../../../../../messages/en-GB/catalogue.json";
import { UptimeSparkline, type UptimeTrendPoint } from "./ProviderCard";

// ESM-only and unused by the sparkline.
vi.mock("@number-flow/react", () => ({ __esModule: true, default: () => null }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	// Fake timers: the hover card's open delay is advanced, never waited on.
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

const points: UptimeTrendPoint[] = [
	{ dayOffset: 2, value: 100, noTraffic: true },
	{ dayOffset: 1, value: 50, noTraffic: false },
	{ dayOffset: 0, value: 100, noTraffic: true },
];

function render(interactive = true) {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: catalogue }}>
			<UptimeSparkline points={points} interactive={interactive} />
		</AppIntlProvider>,
	));
}

/** Runs every pending timer (open delays, positioning) and the updates they schedule. */
async function settle() {
	await act(async () => { await vi.runAllTimersAsync(); });
}

const bars = () => Array.from(container.querySelectorAll("button"));

it("labels each bar with its day and rate, and says when a day had no traffic", () => {
	render();
	expect(bars().map((bar) => bar.getAttribute("aria-label"))).toEqual([
		"2 days ago: no traffic",
		"1 day ago: 50.0%",
		"Today: no traffic",
	]);
	expect(container.textContent).not.toContain("--");
});

it("opens a bar's card on tap", async () => {
	render();
	const bar = bars()[1]!;
	await act(async () => {
		const down = new Event("pointerdown", { bubbles: true });
		Object.defineProperty(down, "pointerType", { value: "touch" });
		bar.dispatchEvent(down);
		bar.click();
	});
	await settle();
	expect(document.body.querySelector('[data-slot="hover-card-content"]')?.textContent).toBe("1 day ago: 50.0%");
});

it("opens a bar's card on keyboard focus", async () => {
	render();
	await act(async () => { bars()[2]!.focus(); });
	// Focus opens after the trigger's short delay, which the fake timers advance.
	await settle();
	expect(document.body.querySelector('[data-slot="hover-card-content"]')?.textContent).toBe("Today: no traffic");
});

it("draws plain bars, without buttons, inside another control", () => {
	render(false);
	expect(bars()).toHaveLength(0);
	expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Daily uptime");
});

it("draws nothing for a provider with no traffic in the 3 days", () => {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: catalogue }}>
			<UptimeSparkline points={points.map((point) => ({ ...point, value: null, noTraffic: true }))} />
		</AppIntlProvider>,
	));
	expect(container.innerHTML).toBe("");
});
