/** @vitest-environment jsdom */
import { it, expect, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TokenInput } from "./token-input";

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

async function render(node: ReactNode) {
	await act(async () => {
		root.render(node);
	});
	// The editor mounts after the first render (immediatelyRender is off for SSR).
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	return container.querySelector<HTMLElement>("[contenteditable]")!;
}

const terra = { type: "model", value: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra" };

it("renders tokens as chips inside a named, multiline textbox", async () => {
	const editable = await render(
		<TokenInput aria-label="Message" defaultValue={["Compare ", terra, " on price"]} triggers={[{ char: "@", type: "model", items: [] }]} />
	);
	expect(editable.getAttribute("role")).toBe("textbox");
	expect(editable.getAttribute("aria-multiline")).toBe("true");
	expect(editable.getAttribute("aria-label")).toBe("Message");
	expect(editable.getAttribute("aria-autocomplete")).toBe("list");
	const chip = container.querySelector<HTMLElement>("[data-slot=token-input-token]")!;
	expect(chip.textContent).toContain("GPT-6.1 Terra");
	expect(chip.getAttribute("data-token-type")).toBe("model");
	expect(chip.querySelector(".sr-only")?.textContent).toContain("model");
	expect(editable.textContent).toContain("on price");
});

it("passes invalid and disabled states to the editable element", async () => {
	const editable = await render(<TokenInput aria-label="Message" invalid disabled />);
	expect(editable.getAttribute("aria-invalid")).toBe("true");
	expect(editable.getAttribute("aria-disabled")).toBe("true");
	expect(editable.getAttribute("contenteditable")).toBe("false");
});

it("follows a controlled value", async () => {
	await render(<TokenInput aria-label="Message" value={["Hello"]} />);
	expect(container.textContent).toContain("Hello");
	await act(async () => {
		root.render(<TokenInput aria-label="Message" value={["Ask ", terra]} />);
	});
	expect(container.querySelector("[data-slot=token-input-token]")?.textContent).toContain("GPT-6.1 Terra");
});
