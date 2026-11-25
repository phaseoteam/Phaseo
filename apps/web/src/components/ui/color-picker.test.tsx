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
