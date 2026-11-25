/** @vitest-environment jsdom */
// The colour sliders take keyboard focus, so they must also respond to the keyboard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en-GB",
}));

import { ColorPicker } from "./color-picker";

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

function slider(label: string) {
	return container.querySelector<HTMLElement>(`[role=slider][aria-label=${label}]`)!;
}

function press(element: HTMLElement, key: string, shiftKey = false) {
	act(() => {
		element.dispatchEvent(
			new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
		);
	});
}

describe("ColorPicker keyboard support", () => {
	it("moves the hue with the arrow keys, Shift and Home", () => {
		const onChange = vi.fn();
		act(() => root.render(<ColorPicker value="#ff0000" onChange={onChange} />));
		const hue = slider("hue");
		expect(hue.getAttribute("aria-valuenow")).toBe("0");

		press(hue, "ArrowRight", true);
		expect(hue.getAttribute("aria-valuenow")).toBe("10");
		expect(onChange).toHaveBeenLastCalledWith("#ff2a00");

		press(hue, "Home");
		expect(hue.getAttribute("aria-valuenow")).toBe("0");
		expect(onChange).toHaveBeenLastCalledWith("#ff0000");
	});

	it("keeps small hue steps on a muted colour, and End reaches 360", () => {
		const onChange = vi.fn();
		act(() => root.render(<ColorPicker value="#806f6f" onChange={onChange} />));
		const hue = slider("hue");
		for (let i = 0; i < 5; i += 1) press(hue, "ArrowRight");
		expect(hue.getAttribute("aria-valuenow")).toBe("5");

		press(hue, "End");
		expect(hue.getAttribute("aria-valuenow")).toBe("360");
		press(hue, "Home");
		expect(hue.getAttribute("aria-valuenow")).toBe("0");
	});

	it("drops the saved hue when the colour changes from outside, even back to the same hex", () => {
		const onChange = vi.fn();
		act(() => root.render(<ColorPicker value="#808080" onChange={onChange} />));
		const hue = slider("hue");
		// On grey, the hue changes nothing in the hex, so only the saved position holds it.
		for (let i = 0; i < 5; i += 1) press(hue, "ArrowRight");
		expect(hue.getAttribute("aria-valuenow")).toBe("5");

		act(() => root.render(<ColorPicker value="#ff0000" onChange={onChange} />));
		act(() => root.render(<ColorPicker value="#808080" onChange={onChange} />));
		expect(slider("hue").getAttribute("aria-valuenow")).toBe("0");
	});

	it("changes saturation and brightness from the keyboard", () => {
		const onChange = vi.fn();
		act(() => root.render(<ColorPicker value="#ff0000" onChange={onChange} />));
		const area = slider("saturationBrightness");
		expect(area.getAttribute("aria-valuenow")).toBe("100");

		press(area, "ArrowLeft", true);
		expect(area.getAttribute("aria-valuenow")).toBe("90");

		press(area, "PageDown");
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange.mock.calls[1]![0]).not.toBe(onChange.mock.calls[0]![0]);
	});

	it("ignores keys it does not handle", () => {
		const onChange = vi.fn();
		act(() => root.render(<ColorPicker value="#ff0000" onChange={onChange} />));
		press(slider("hue"), "a");
		expect(onChange).not.toHaveBeenCalled();
	});
});
