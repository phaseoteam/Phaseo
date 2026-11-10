/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import UsageEntityHoverCard from "./UsageEntityHoverCard";

vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string) => key,
}));
// The app's Link needs a router; a plain anchor is enough here.
vi.mock("@/components/link", () => ({
	// jsdom cannot navigate, so the stand-in link only reports the click.
	default: ({ href, children, onClick, ...props }: { href: string; children: ReactNode; onClick?: (event: ReactMouseEvent) => void }) => (
		<a
			href={href}
			{...props}
			onClick={(event) => {
				event.preventDefault();
				onClick?.(event);
			}}
		>
			{children}
		</a>
	),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	vi.useFakeTimers();
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
	act(() => root.render(node));
	return container.querySelector<HTMLElement>("[data-slot=hover-card-trigger]")!;
}

function open(trigger: HTMLElement) {
	act(() => {
		const enter = new MouseEvent("pointerenter");
		Object.defineProperty(enter, "pointerType", { value: "mouse" });
		trigger.dispatchEvent(enter);
		trigger.dispatchEvent(new MouseEvent("mouseenter"));
		trigger.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
	});
	act(() => vi.advanceTimersByTime(300));
	return document.querySelector<HTMLElement>("[data-slot=hover-card-content]")!;
}

describe("UsageEntityHoverCard", () => {
	it("makes the trigger the link, with no View button in the card", () => {
		const onRowClick = vi.fn();
		const trigger = render(
			<div onClick={onRowClick}>
				<UsageEntityHoverCard
					title="Claude Fable 5.2"
					meta="Anthropic · anthropic/claude-fable-5-2"
					href="/models/anthropic/claude-fable-5-2"
					rows={[{ key: "provider", label: "Provider", value: "Anthropic" }]}
				>
					Claude Fable 5.2
				</UsageEntityHoverCard>
			</div>,
		);
		expect(trigger.tagName).toBe("A");
		expect(trigger.getAttribute("href")).toBe("/models/anthropic/claude-fable-5-2");

		act(() => trigger.click());
		expect(onRowClick).not.toHaveBeenCalled();

		const card = open(trigger);
		expect(card.textContent).toContain("Anthropic · anthropic/claude-fable-5-2");
		expect(card.textContent).toContain("ProviderAnthropic");
		expect(card.querySelector("a")).toBeNull();
		expect(card.querySelector("button")).toBeNull();
		expect(card.querySelector("dl")?.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
	});

	it("shows Requested as only when the requested id differs from the routed one", () => {
		const routed = "anthropic/claude-fable-5-2";
		let trigger = render(
			<UsageEntityHoverCard title="Fable" requestedAs={{ id: "anthropic/claude-fable-latest", routedId: routed }}>
				Fable
			</UsageEntityHoverCard>,
		);
		let card = open(trigger);
		expect(card.textContent).toContain("requestedAs");
		expect(card.textContent).toContain("anthropic/claude-fable-latest");

		act(() => root.render(null));
		trigger = render(
			<UsageEntityHoverCard title="Fable" requestedAs={{ id: routed, routedId: routed }}>
				Fable
			</UsageEntityHoverCard>,
		);
		card = open(trigger);
		expect(card.textContent).not.toContain("requestedAs");
	});

	it("gives a card without a link a focusable trigger, and shows the headline and badges", () => {
		const trigger = render(
			<UsageEntityHoverCard title="Key" headline="$12.50" headlineLabel="spend" badges={<span>Active</span>}>
				Key
			</UsageEntityHoverCard>,
		);
		expect(trigger.tagName).toBe("SPAN");
		expect(trigger.tabIndex).toBe(0);
		const card = open(trigger);
		expect(card.textContent).toContain("$12.50spend");
		expect(card.textContent).toContain("Active");
	});

	it("renders just the trigger when disabled", () => {
		render(
			<UsageEntityHoverCard title="Off" disabled>
				Off
			</UsageEntityHoverCard>,
		);
		expect(container.querySelector("[data-slot=hover-card-trigger]")).toBeNull();
		expect(container.textContent).toBe("Off");
	});
});
