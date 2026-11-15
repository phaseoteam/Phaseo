/** @vitest-environment jsdom */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/core";
import { AppIntlProvider } from "@/i18n/react";
import { englishCommonMessages } from "@/i18n/default-messages";
import { TokenInput, type TokenInputProps, type TokenInputValue } from "./token-input";

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

const withIntl = (node: ReactNode) => (
	<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: englishCommonMessages }}>
		{node}
	</AppIntlProvider>
);

const editable = () => container.querySelector<HTMLElement>("[contenteditable]");

async function render(node: ReactNode) {
	await act(async () => {
		root.render(withIntl(node));
	});
	// The editor mounts after the first render (immediatelyRender is off for SSR): wait until it is in the page.
	await act(async () => {
		await vi.waitFor(() => {
			if (!editable()) throw new Error("The editor has not mounted yet.");
		});
	});
	return editable()!;
}

async function rerender(node: ReactNode) {
	await act(async () => {
		root.render(withIntl(node));
	});
}

// Tiptap keeps its editor on the editable element.
const editorOf = (element: HTMLElement) => {
	const editor = (element as HTMLElement & { editor?: Editor }).editor;
	if (!editor) throw new Error("No editor on the editable element.");
	return editor;
};

/** Types text at the caret, as the browser's input would. */
async function type(element: HTMLElement, text: string) {
	await act(async () => {
		editorOf(element).commands.insertContent(text);
	});
}

async function focusEnd(element: HTMLElement) {
	// jsdom only focuses elements with a tab index, so give the editable one for the test.
	element.tabIndex = 0;
	const editor = editorOf(element);
	await act(async () => {
		editor.commands.focus("end", { scrollIntoView: false });
		// Tiptap focuses on the next animation frame.
		await vi.waitFor(() => {
			if (!editor.isFocused) throw new Error("The editor is not focused yet.");
		});
	});
}

const terra = { type: "model", value: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra" };
const triggers: TokenInputProps["triggers"] = [{ char: "@", type: "model", label: "Models", items: [{ value: "google/gemini-4", label: "Gemini 4" }] }];
const listbox = () => container.querySelector("[role=listbox]");

it("renders tokens as chips inside a named, multiline textbox", async () => {
	const element = await render(
		<TokenInput aria-label="Message" defaultValue={["Compare ", terra, " on price"]} triggers={[{ char: "@", type: "model", items: [] }]} />
	);
	expect(element.getAttribute("role")).toBe("textbox");
	expect(element.getAttribute("aria-multiline")).toBe("true");
	expect(element.getAttribute("aria-label")).toBe("Message");
	expect(element.getAttribute("aria-autocomplete")).toBe("list");
	const chip = container.querySelector<HTMLElement>("[data-slot=token-input-token]")!;
	expect(chip.textContent).toContain("GPT-6.1 Terra");
	expect(chip.getAttribute("data-token-type")).toBe("model");
	expect(chip.querySelector(".sr-only")?.textContent).toContain("model");
	expect(element.textContent).toContain("on price");
});

it("passes invalid and disabled states to the editable element", async () => {
	const element = await render(<TokenInput aria-label="Message" invalid disabled />);
	expect(element.getAttribute("aria-invalid")).toBe("true");
	expect(element.getAttribute("aria-disabled")).toBe("true");
	expect(element.getAttribute("contenteditable")).toBe("false");
});

it("follows a controlled value", async () => {
	await render(<TokenInput aria-label="Message" value={["Hello"]} />);
	expect(container.textContent).toContain("Hello");
	await rerender(<TokenInput aria-label="Message" value={["Ask ", terra]} />);
	expect(container.querySelector("[data-slot=token-input-token]")?.textContent).toContain("GPT-6.1 Terra");
});

it("opens suggestions for a trigger at the start of a new line", async () => {
	const element = await render(<TokenInput aria-label="Message" defaultValue={["first\n@ge"]} triggers={triggers} />);
	await focusEnd(element);
	expect(listbox()?.getAttribute("aria-label")).toBe("Models");
	// The announcement comes from the catalogue.
	expect(container.querySelector("[aria-live]")?.textContent).toBe("1 suggestion. Up and Down to choose, Enter to insert.");
});

it("closes the suggestions when a controlled value replaces the text", async () => {
	const element = await render(<TokenInput aria-label="Message" value={["@ge"]} triggers={triggers} />);
	await focusEnd(element);
	expect(listbox()).not.toBeNull();
	await rerender(<TokenInput aria-label="Message" value={["abc"]} triggers={triggers} />);
	expect(editable()!.textContent).toBe("abc");
	expect(listbox()).toBeNull();
});

it("puts a controlled value back when the parent rejects an edit", async () => {
	const onValueChange = vi.fn();
	const element = await render(<TokenInput aria-label="Message" value={["Hello"]} onValueChange={onValueChange} />);
	await focusEnd(element);
	await type(element, "X");
	expect(onValueChange).toHaveBeenLastCalledWith(["HelloX"]);
	expect(editable()!.textContent).toBe("Hello");
});

it("keeps an edit the parent accepts", async () => {
	function Controlled() {
		const [value, setValue] = useState<TokenInputValue>(["Hello"]);
		return <TokenInput aria-label="Message" value={value} onValueChange={setValue} />;
	}
	const element = await render(<Controlled />);
	await focusEnd(element);
	await type(element, "X");
	expect(editable()!.textContent).toBe("HelloX");
});

it("does not report a value change when only the disabled state changes", async () => {
	const onValueChange = vi.fn();
	await render(<TokenInput aria-label="Message" defaultValue={["Hello"]} onValueChange={onValueChange} />);
	await rerender(<TokenInput aria-label="Message" defaultValue={["Hello"]} onValueChange={onValueChange} disabled />);
	await rerender(<TokenInput aria-label="Message" defaultValue={["Hello"]} onValueChange={onValueChange} />);
	expect(onValueChange).not.toHaveBeenCalled();
});
