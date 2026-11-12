/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DisplayPreferencesProvider } from "@/components/providers/DisplayPreferencesProvider";
import { TimestampHoverCard } from "./TimestampHoverCard";

// The provider asks the account API for saved preferences; without it the
// defaults apply, which is what these tests want.
vi.mock("@/lib/fetchers/internal/accountAuthClient", () => ({
	getBrowserAccessToken: () => Promise.reject(new Error("no auth in tests")),
}));
vi.mock("@/lib/web-api/client", () => ({
	fetchAccountWebApi: () => Promise.reject(new Error("no API in tests")),
}));
vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}(${Object.values(values).join(",")})` : key,
}));

const NOW = new Date("2026-11-10T12:00:00.000Z");

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

function render(node: ReactNode) {
	act(() => root.render(<DisplayPreferencesProvider locale="en-GB">{node}</DisplayPreferencesProvider>));
	return container.querySelector<HTMLElement>("[data-slot=hover-card-trigger]");
}

function pointerEvent(type: string, bubbles = true) {
	const event = new MouseEvent(type, { bubbles });
	Object.defineProperty(event, "pointerType", { value: "mouse" });
	return event;
}

function open(trigger: HTMLElement) {
	act(() => {
		trigger.dispatchEvent(pointerEvent("pointerenter", false));
		trigger.dispatchEvent(new MouseEvent("mouseenter"));
		trigger.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
	});
	act(() => vi.advanceTimersByTime(300));
	return document.querySelector<HTMLElement>("[data-slot=hover-card-content]");
}

describe("TimestampHoverCard", () => {
	it("gives the instant a focusable, dotted trigger and a card with relative, zone, UTC and Unix", () => {
		const value = "2026-11-10T11:57:00.000Z";
		const trigger = render(<TimestampHoverCard value={value}>10 Nov, 11:57</TimestampHoverCard>);
		expect(trigger).not.toBeNull();
		expect(trigger!.tabIndex).toBe(0);
		expect(trigger!.className).toContain("decoration-dotted");

		const card = open(trigger!);
		expect(card).not.toBeNull();
		const text = card!.textContent ?? "";
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		expect(text).toContain(`3 minutes ago · ${zone}`);
		expect(text).toContain("utc");
		expect(text).toContain("unix");
		expect(text).toContain(String(Math.floor(Date.parse(value) / 1000)));
		expect(text).toContain("10 Nov 2026");
		expect(card!.querySelector("dl")?.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
	});

	it("shows a period's duration as the headline, then its extra rows", () => {
		const trigger = render(
			<TimestampHoverCard
				variant="period"
				start="2026-11-10T11:00:00.000Z"
				end="2026-11-10T11:04:12.000Z"
				durationLabel="took"
				extraRows={[{ key: "requests", label: "Requests", value: "12" }]}
			>
				period
			</TimestampHoverCard>,
		);
		const text = open(trigger!)?.textContent ?? "";
		expect(text).toContain("took4m 12s");
		expect(text).toContain("start");
		expect(text).toContain("end");
		expect(text).toContain("Requests12");
		expect(text).toContain("56 minutes ago");
	});

	it("counts a date in days and takes a custom title and meta", () => {
		const trigger = render(
			<TimestampHoverCard variant="date" value="2027-01-14T00:00:00.000Z" title="Retires 14 Jan 2027">
				badge
			</TimestampHoverCard>,
		);
		const text = open(trigger!)?.textContent ?? "";
		expect(text).toContain("Retires 14 Jan 2027");
		expect(text).toContain("in 65 days");
		expect(text).toContain("14 Jan 2027");
	});

	it("uses the child as the trigger with asChild", () => {
		const trigger = render(
			<TimestampHoverCard value="2026-11-10T11:57:00.000Z" asChild>
				<button type="button">open</button>
			</TimestampHoverCard>,
		);
		expect(trigger?.tagName).toBe("BUTTON");
	});

	it("renders only the text for a missing or invalid time", () => {
		const trigger = render(<TimestampHoverCard value="not a date">-</TimestampHoverCard>);
		expect(trigger).toBeNull();
		expect(container.textContent).toBe("-");
	});
});
