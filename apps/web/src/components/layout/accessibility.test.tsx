/** @vitest-environment jsdom */
// Regression tests for the WCAG 2.2 AA fixes: skip link, cookie banner focus
// space, chart names and the release calendar's targets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key} ${JSON.stringify(values)}` : key,
	useLocale: () => "en-GB",
}));
vi.mock("@/components/navigation/IntentLink", () => ({
	IntentLink: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
		<a href={href} className={className}>{children}</a>
	),
}));
vi.mock("@/components/link", () => ({
	default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
		<a href={href} className={className}>{children}</a>
	),
}));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/providers/DisplayPreferencesProvider", () => ({
	useDisplayFormatters: () => ({ dateParts: (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}` }),
}));
vi.mock("recharts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("recharts")>();
	return { ...actual, ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</> };
});

import { SkipLink } from "./SkipLink";
import { CookieConsentManager, type CookieConsentCopy } from "@/components/analytics/CookieConsentManager";
import { ChartContainer } from "@/components/ui/chart";
import * as Recharts from "recharts";
import ModelCalendarChart from "@/components/(data)/models/ModelCalendar/ModelCalendarChart";
import type { ModelEvent } from "@/lib/fetchers/updates/types";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	if (!("ResizeObserver" in globalThis)) {
		Object.assign(globalThis, {
			ResizeObserver: class {
				observe() {}
				disconnect() {}
				unobserve() {}
			},
		});
	}
	window.localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.documentElement.style.removeProperty("--cookie-banner-space");
	document.documentElement.style.scrollPaddingBottom = "";
});

function render(node: ReactNode) {
	act(() => root.render(node));
}

/** Renders whatever title ChartContainer gives the chart element. */
function TitleProbe({ title }: { title?: string }) {
	return <svg data-testid="probe"><title>{title ?? ""}</title></svg>;
}
const probeTitle = () => container.querySelector("[data-testid=probe] title")?.textContent;

describe("SkipLink", () => {
	it("links to the main content region", () => {
		render(<SkipLink />);
		const link = container.querySelector("a")!;
		expect(link.getAttribute("href")).toBe("#main-content");
		expect(link.textContent).toBe("skipToContent");
	});
});

describe("CookieConsentManager", () => {
	const copy: CookieConsentCopy = {
		accept: "Accept",
		acceptedTitle: "Accepted",
		bodyAfterPrivacy: ".",
		bodyBeforePrivacy: "We use cookies.",
		decline: "Decline",
		declinedTitle: "Declined",
		feedbackMessage: "Saved",
		privacyPolicy: "Privacy Policy",
		title: "Cookie preferences",
	};

	it("labels the banner and reserves space so focus is never hidden under it", () => {
		render(<CookieConsentManager copy={copy} />);
		const region = container.querySelector("[role=region]")!;
		expect(region).not.toBeNull();
		const labelId = region.getAttribute("aria-labelledby")!;
		expect(document.getElementById(labelId)?.textContent).toBe("Cookie preferences");
		expect(document.documentElement.style.getPropertyValue("--cookie-banner-space")).toMatch(/px$/);

		const decline = [...container.querySelectorAll("button")].find((button) => button.textContent === "Decline")!;
		act(() => decline.click());
		expect(container.querySelector("[role=region]")).toBeNull();
		expect(document.documentElement.style.getPropertyValue("--cookie-banner-space")).toBe("");
	});
});

describe("ChartContainer", () => {
	it("names the chart from aria-label", () => {
		render(
			<ChartContainer config={{}} aria-label="Weekly tokens">
				<TitleProbe />
			</ChartContainer>,
		);
		expect(probeTitle()).toBe("Weekly tokens");
		expect(container.querySelector("[data-slot=chart]")?.hasAttribute("aria-label")).toBe(false);
	});

	it("names the chart from the nearest heading and follows heading changes", async () => {
		render(
			<section>
				<h3>Latency</h3>
				<ChartContainer config={{}}>
					<TitleProbe />
				</ChartContainer>
			</section>,
		);
		expect(probeTitle()).toBe("Latency");
		// The heading observer's callback is a microtask, which an async act flushes.
		await act(async () => {
			container.querySelector("h3")!.textContent = "Throughput";
		});
		expect(probeTitle()).toBe("Throughput");
	});

	it("names a chart nested in its own ResponsiveContainer and caps series names", () => {
		render(
			<ChartContainer config={{ a: { label: "A" }, b: { label: "B" }, c: { label: "C" }, d: { label: "D" } }}>
				<Recharts.ResponsiveContainer>
					<TitleProbe />
				</Recharts.ResponsiveContainer>
			</ChartContainer>,
		);
		expect(probeTitle()).toBe("A, B, C, …");
	});
});

describe("ModelCalendarChart", () => {
	const now = new Date();
	const event = (id: string, type: string): ModelEvent =>
		({
			date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
			types: [type],
			model: { model_id: id, name: id, organisation_id: "org", organisation: { organisation_id: "org", name: "Org" } },
		}) as unknown as ModelEvent;

	it("keeps bars proportional and offers 24px buttons that open the month list", () => {
		const events = [
			...Array.from({ length: 19 }, (_, index) => event(`released-${index}`, "Released")),
			event("retired-1", "Retired"),
		];
		render(<ModelCalendarChart events={events} monthsWindow={1} />);

		const widths = [...container.querySelectorAll<HTMLElement>("[aria-hidden=true] .flex > div")].map((segment) => segment.style.width);
		expect(widths).toEqual(["95%", "5%"]);

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		expect(buttons).toHaveLength(2);
		for (const button of buttons) expect(button.className).toContain("h-6");

		act(() => buttons[1]!.click());
		expect(document.querySelector("[role=dialog]")?.textContent).toContain("eventsInMonth");
	});

	it("returns focus to the matching count button when a dialog opened from a bar closes", async () => {
		render(<ModelCalendarChart events={[event("released-1", "Released"), event("retired-1", "Retired")]} monthsWindow={1} />);
		const retiredButton = [...container.querySelectorAll<HTMLButtonElement>("button")][1]!;
		const retiredBar = container.querySelectorAll<HTMLElement>("[aria-hidden=true] .flex > div")[1]!;

		act(() => retiredBar.click());
		const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
		expect(dialog).not.toBeNull();

		const focused = new Promise<void>((resolve) => {
			retiredButton.addEventListener("focus", () => resolve(), { once: true });
		});
		await act(async () => {
			dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await focused;
		});
		expect(document.activeElement).toBe(retiredButton);
	});
});
