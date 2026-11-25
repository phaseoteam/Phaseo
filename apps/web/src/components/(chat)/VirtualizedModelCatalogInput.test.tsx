/** @vitest-environment jsdom */
// The model pickers keep focus on a cmdk search input and reach the virtualised
// options through aria-activedescendant. cmdk writes its own aria-activedescendant
// and aria-controls over the input's props, so the hook sets them on the element.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Command } from "cmdk";

vi.mock("@/i18n/react", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en-GB",
}));

import {
	getNextVirtualizedModelCatalogItemKey,
	getVirtualizedModelCatalogItemId,
	useVirtualizedModelCatalogInput,
	VirtualizedModelCatalog,
} from "./VirtualizedModelCatalog";

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

function Picker({
	enabled,
	activeItemKey,
}: {
	enabled: boolean;
	activeItemKey: string | null;
}) {
	const setInput = useVirtualizedModelCatalogInput({
		enabled,
		activeItemKey,
		listboxId: "catalog-listbox",
	});
	return (
		<Command shouldFilter={false}>
			<Command.Input ref={setInput} />
		</Command>
	);
}

const input = () => container.querySelector("input")!;

describe("useVirtualizedModelCatalogInput", () => {
	it("needs the hook because cmdk overrides the input's own props", () => {
		act(() =>
			root.render(
				<Command shouldFilter={false}>
					<Command.Input aria-activedescendant="mine" aria-controls="mine-list" />
				</Command>,
			),
		);
		expect(input().getAttribute("aria-activedescendant")).toBeNull();
		expect(input().getAttribute("aria-controls")).not.toBe("mine-list");
	});

	it("points the input at the listbox and follows the active option", () => {
		act(() => root.render(<Picker enabled activeItemKey="openai/gpt-5" />));
		expect(input().getAttribute("aria-controls")).toBe("catalog-listbox");
		expect(input().getAttribute("aria-activedescendant")).toBe(
			getVirtualizedModelCatalogItemId("openai/gpt-5"),
		);

		act(() => root.render(<Picker enabled activeItemKey="anthropic/claude-opus-5" />));
		expect(input().getAttribute("aria-activedescendant")).toBe(
			getVirtualizedModelCatalogItemId("anthropic/claude-opus-5"),
		);

		act(() => root.render(<Picker enabled activeItemKey={null} />));
		expect(input().getAttribute("aria-activedescendant")).toBeNull();
	});

	it("hands the attributes back to cmdk when disabled", () => {
		act(() => root.render(<Picker enabled={false} activeItemKey={null} />));
		const cmdkControls = input().getAttribute("aria-controls");

		act(() => root.render(<Picker enabled activeItemKey="openai/gpt-5" />));
		act(() => root.render(<Picker enabled={false} activeItemKey="openai/gpt-5" />));
		expect(input().getAttribute("aria-controls")).toBe(cmdkControls);
		expect(input().getAttribute("aria-activedescendant")).toBeNull();
	});
});

function PickerWithCatalog({ models }: { models: string[] }) {
	const setInput = useVirtualizedModelCatalogInput({
		enabled: true,
		activeItemKey: models[0] ?? null,
		listboxId: "catalog-listbox",
	});
	return (
		<Command shouldFilter={false}>
			<Command.Input ref={setInput} />
			<VirtualizedModelCatalog
				sections={[{ key: "all", heading: "All", items: models }]}
				getItemKey={(model) => model}
				activeItemKey={models[0] ?? null}
				isItemDisabled={() => false}
				onActiveItemChange={() => undefined}
				onSelectItem={() => undefined}
				renderItem={(model) => model}
				listboxId="catalog-listbox"
			/>
		</Command>
	);
}

describe("VirtualizedModelCatalog with the input hook", () => {
	const controlled = () => document.getElementById(input().getAttribute("aria-controls") ?? "");

	it("points aria-controls at the rendered listbox", () => {
		act(() => root.render(<PickerWithCatalog models={["openai/gpt-5", "anthropic/claude-opus-5"]} />));
		expect(controlled()?.getAttribute("role")).toBe("listbox");
	});

	it("keeps aria-controls pointing at an element, announced as status, when nothing matches", () => {
		act(() => root.render(<PickerWithCatalog models={[]} />));
		expect(controlled()?.getAttribute("role")).toBe("status");
		expect(controlled()?.textContent).toBe("noModelsFound");
	});
});

describe("getNextVirtualizedModelCatalogItemKey", () => {
	const keys = ["a", "b", "c"];

	it("moves with the arrow keys and stops at the ends", () => {
		expect(getNextVirtualizedModelCatalogItemKey(keys, "a", "ArrowDown")).toBe("b");
		expect(getNextVirtualizedModelCatalogItemKey(keys, "c", "ArrowDown")).toBe("c");
		expect(getNextVirtualizedModelCatalogItemKey(keys, "b", "ArrowUp")).toBe("a");
		expect(getNextVirtualizedModelCatalogItemKey(keys, "a", "ArrowUp")).toBe("a");
	});

	it("leaves Home and End to the search field, and starts at the top with no active option", () => {
		expect(getNextVirtualizedModelCatalogItemKey(keys, "b", "Home")).toBeNull();
		expect(getNextVirtualizedModelCatalogItemKey(keys, "b", "End")).toBeNull();
		expect(getNextVirtualizedModelCatalogItemKey(keys, null, "ArrowDown")).toBe("a");
	});

	it("ignores other keys and empty lists", () => {
		expect(getNextVirtualizedModelCatalogItemKey(keys, "a", "Enter")).toBeNull();
		expect(getNextVirtualizedModelCatalogItemKey([], null, "ArrowDown")).toBeNull();
	});
});
