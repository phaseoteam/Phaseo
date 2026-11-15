/** @vitest-environment jsdom */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NumberInput } from "./number-input";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function render(node: ReactNode) {
	act(() => root.render(node));
	return container.querySelector<HTMLInputElement>("[data-slot=number-input-control]")!;
}

function press(input: HTMLInputElement, key: string, init: KeyboardEventInit = {}) {
	act(() => {
		input.focus();
		input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
	});
}

it("formats the value with the given locale and format", () => {
	const input = render(
		<NumberInput aria-label="Monthly budget" defaultValue={250} locale="en-US" format={{ style: "currency", currency: "USD" }} />
	);
	expect(input.value).toBe("$250.00");
	expect(input.getAttribute("aria-label")).toBe("Monthly budget");
});

it("steps with the arrow keys and reports the new value", () => {
	const onValueChange = vi.fn();
	const input = render(<NumberInput aria-label="Requests per minute" defaultValue={600} step={50} onValueChange={onValueChange} />);
	press(input, "ArrowUp");
	expect(onValueChange).toHaveBeenLastCalledWith(650, expect.anything());
	press(input, "ArrowDown");
	expect(onValueChange).toHaveBeenLastCalledWith(600, expect.anything());
});

it("clamps to max and disables the increase button there", () => {
	const onValueChange = vi.fn();
	const input = render(<NumberInput aria-label="Temperature" defaultValue={2} min={0} max={2} step={0.1} onValueChange={onValueChange} />);
	press(input, "ArrowUp");
	expect(onValueChange).not.toHaveBeenCalled();
	const increment = container.querySelector<HTMLButtonElement>("[data-slot=number-input-increment]")!;
	expect(increment.disabled || increment.getAttribute("aria-disabled") === "true" || increment.hasAttribute("data-disabled")).toBe(true);
	expect(increment.getAttribute("aria-label")).toBe("Increase");
});

it("hides the step buttons when steppers is off", () => {
	render(<NumberInput aria-label="Max output tokens" defaultValue={8192} steppers={false} />);
	expect(container.querySelector("[data-slot=number-input-increment]")).toBeNull();
});

it("marks the field invalid for styling and assistive tech", () => {
	const input = render(<NumberInput aria-label="Budget" aria-invalid defaultValue={-1} />);
	expect(input.getAttribute("aria-invalid")).toBe("true");
});
