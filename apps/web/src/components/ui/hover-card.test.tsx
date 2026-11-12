/** @vitest-environment jsdom */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

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

function renderCard(node: ReactNode) {
	act(() => root.render(node));
	return container.querySelector<HTMLElement>("[data-slot=hover-card-trigger]")!;
}

// jsdom has no PointerEvent; React reads pointerType off the native event.
function pointerEvent(type: string, pointerType: string, bubbles = true) {
	const event = new MouseEvent(type, { bubbles });
	Object.defineProperty(event, "pointerType", { value: pointerType });
	return event;
}

function hover(trigger: HTMLElement) {
	act(() => {
		trigger.dispatchEvent(pointerEvent("pointerenter", "mouse", false));
		trigger.dispatchEvent(new MouseEvent("mouseenter"));
		trigger.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
	});
}

const isOpen = () => document.querySelector("[data-slot=hover-card-content]") !== null;

// The time a hovered card takes to open, found by stepping the fake clock.
function openDelayOf(trigger: HTMLElement) {
	hover(trigger);
	for (let elapsed = 0; elapsed <= 1000; elapsed += 10) {
		if (isOpen()) return elapsed;
		act(() => vi.advanceTimersByTime(10));
	}
	return Number.POSITIVE_INFINITY;
}

it("opens after the delay given on HoverCard", () => {
	const trigger = renderCard(
		<HoverCard openDelay={120}>
			<HoverCardTrigger>Trigger</HoverCardTrigger>
			<HoverCardContent>Card</HoverCardContent>
		</HoverCard>,
	);
	expect(openDelayOf(trigger)).toBe(120);
});

it("opens after 150 ms when no delay is given", () => {
	const trigger = renderCard(
		<HoverCard>
			<HoverCardTrigger>Trigger</HoverCardTrigger>
			<HoverCardContent>Card</HoverCardContent>
		</HoverCard>,
	);
	expect(openDelayOf(trigger)).toBe(150);
});

it("prefers a delay given on the trigger", () => {
	const trigger = renderCard(
		<HoverCard openDelay={400}>
			<HoverCardTrigger delay={80}>Trigger</HoverCardTrigger>
			<HoverCardContent>Card</HoverCardContent>
		</HoverCard>,
	);
	expect(openDelayOf(trigger)).toBe(80);
});

it("opens on a touch tap without firing the surrounding click handler", () => {
	const onRowClick = vi.fn();
	renderCard(
		<div onClick={onRowClick}>
			<HoverCard>
				<HoverCardTrigger>Trigger</HoverCardTrigger>
				<HoverCardContent>Card</HoverCardContent>
			</HoverCard>
		</div>,
	);
	const trigger = container.querySelector<HTMLElement>("[data-slot=hover-card-trigger]")!;
	act(() => {
		trigger.dispatchEvent(pointerEvent("pointerdown", "touch"));
		trigger.click();
	});
	expect(isOpen()).toBe(true);
	expect(onRowClick).not.toHaveBeenCalled();
});

it("leaves a mouse click to the surrounding click handler", () => {
	const onRowClick = vi.fn();
	renderCard(
		<div onClick={onRowClick}>
			<HoverCard>
				<HoverCardTrigger>Trigger</HoverCardTrigger>
				<HoverCardContent>Card</HoverCardContent>
			</HoverCard>
		</div>,
	);
	const trigger = container.querySelector<HTMLElement>("[data-slot=hover-card-trigger]")!;
	act(() => {
		trigger.dispatchEvent(pointerEvent("pointerdown", "mouse"));
		trigger.click();
	});
	expect(onRowClick).toHaveBeenCalledTimes(1);
});
