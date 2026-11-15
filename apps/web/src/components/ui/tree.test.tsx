/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tree, checkStateOf, toggleChecked, visibleRows, type TreeNode } from "./tree";

const items: TreeNode[] = [
	{
		id: "openai",
		label: "OpenAI",
		children: [
			{ id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
			{ id: "gpt-6-cyber", label: "GPT-6 Cyber" },
		],
	},
	{
		id: "anthropic",
		label: "Anthropic",
		children: [
			{ id: "claude-fable-5.2", label: "Claude Fable 5.2" },
			{ id: "claude-mythos-5.2", label: "Claude Mythos 5.2", disabled: true },
		],
	},
	{ id: "google", label: "Google", children: [{ id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen" }] },
];

describe("helpers", () => {
	it("lists only the rows under expanded branches", () => {
		const rows = visibleRows(items, new Set(["anthropic"]));
		expect(rows.map((row) => [row.node.id, row.level, row.posInSet, row.setSize])).toEqual([
			["openai", 1, 1, 3],
			["anthropic", 1, 2, 3],
			["claude-fable-5.2", 2, 1, 2],
			["claude-mythos-5.2", 2, 2, 2],
			["google", 1, 3, 3],
		]);
	});

	it("derives a branch's state from its leaves", () => {
		expect(checkStateOf(items[0], new Set())).toBe("unchecked");
		expect(checkStateOf(items[0], new Set(["gpt-6-cyber"]))).toBe("mixed");
		expect(checkStateOf(items[0], new Set(["gpt-6-cyber", "gpt-6.1-terra"]))).toBe("checked");
	});

	it("reads a branch over the leaves that toggling it changes, so a disabled leaf doesn't keep it mixed", () => {
		expect(checkStateOf(items[1], new Set(["claude-fable-5.2"]))).toBe("checked");
		expect(toggleChecked(items[1], ["claude-fable-5.2"])).toEqual([]);
		expect(toggleChecked(items[1], [])).toEqual(["claude-fable-5.2"]);
		// A disabled leaf still shows its own state.
		expect(checkStateOf(items[1].children![1], new Set(["claude-mythos-5.2"]))).toBe("checked");
	});

	it("marks rows under a disabled branch as disabled", () => {
		const tree: TreeNode[] = [{ id: "lab", label: "Lab", disabled: true, children: [{ id: "model", label: "Model" }] }];
		expect(visibleRows(tree, new Set(["lab"])).map((row) => [row.node.id, row.disabled])).toEqual([["lab", true], ["model", true]]);
	});

	it("toggles every enabled leaf of a branch and leaves disabled ones alone", () => {
		expect(toggleChecked(items[1], []).sort()).toEqual(["claude-fable-5.2"]);
		expect(toggleChecked(items[1], ["claude-fable-5.2"])).toEqual([]);
		expect(toggleChecked(items[0], ["gpt-6-cyber"]).sort()).toEqual(["gpt-6-cyber", "gpt-6.1-terra"]);
	});
});

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
	return container.querySelector<HTMLElement>("[role=tree]")!;
}

const item = (label: string) =>
	[...container.querySelectorAll<HTMLElement>("[role=treeitem]")].find(
		(element) => element.querySelector(":scope > [data-slot=tree-row] [data-slot=tree-label]")?.textContent === label
	)!;

function key(tree: HTMLElement, name: string) {
	act(() => {
		tree.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
	});
}

describe("Tree", () => {
	it("exposes tree semantics and a single tab stop", () => {
		const tree = render(<Tree aria-label="Models" items={items} defaultExpanded={["openai"]} />);
		expect(tree.getAttribute("aria-label")).toBe("Models");
		const openai = item("OpenAI");
		expect(openai.getAttribute("aria-expanded")).toBe("true");
		expect(openai.getAttribute("aria-level")).toBe("1");
		expect(item("GPT-6 Cyber").getAttribute("aria-level")).toBe("2");
		expect(item("GPT-6 Cyber").getAttribute("aria-posinset")).toBe("2");
		expect(item("Anthropic").getAttribute("aria-expanded")).toBe("false");
		const tabStops = [...container.querySelectorAll("[role=treeitem]")].filter((element) => element.getAttribute("tabindex") === "0");
		expect(tabStops).toHaveLength(1);
		expect(container.querySelector("[role=group]")).not.toBeNull();
	});

	it("moves focus with the arrow keys, Home and End", () => {
		const tree = render(<Tree aria-label="Models" items={items} defaultExpanded={["openai"]} />);
		act(() => item("OpenAI").focus());
		key(tree, "ArrowDown");
		expect(document.activeElement).toBe(item("GPT-6.1 Terra"));
		key(tree, "End");
		expect(document.activeElement).toBe(item("Google"));
		key(tree, "Home");
		expect(document.activeElement).toBe(item("OpenAI"));
		expect(item("OpenAI").getAttribute("tabindex")).toBe("0");
	});

	it("advances once per key even when keys arrive in the same tick", () => {
		const tree = render(<Tree aria-label="Models" items={items} defaultExpanded={["openai"]} />);
		act(() => item("OpenAI").focus());
		act(() => {
			for (const name of ["ArrowDown", "ArrowDown"]) {
				document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
			}
		});
		expect(document.activeElement).toBe(item("GPT-6 Cyber"));
		void tree;
	});

	it("opens and closes with Right and Left, and moves between parent and child", () => {
		const onExpandedChange = vi.fn();
		const tree = render(<Tree aria-label="Models" items={items} onExpandedChange={onExpandedChange} />);
		act(() => item("Anthropic").focus());
		key(tree, "ArrowRight");
		expect(item("Anthropic").getAttribute("aria-expanded")).toBe("true");
		expect(onExpandedChange).toHaveBeenLastCalledWith(["anthropic"]);
		key(tree, "ArrowRight");
		expect(document.activeElement).toBe(item("Claude Fable 5.2"));
		key(tree, "ArrowLeft");
		expect(document.activeElement).toBe(item("Anthropic"));
		key(tree, "ArrowLeft");
		expect(item("Anthropic").getAttribute("aria-expanded")).toBe("false");
	});

	it("opens every sibling branch with *", () => {
		const tree = render(<Tree aria-label="Models" items={items} />);
		act(() => item("OpenAI").focus());
		key(tree, "*");
		for (const label of ["OpenAI", "Anthropic", "Google"]) expect(item(label).getAttribute("aria-expanded")).toBe("true");
	});

	it("jumps to the next row that starts with a typed letter", () => {
		const tree = render(<Tree aria-label="Models" items={items} />);
		act(() => item("OpenAI").focus());
		key(tree, "g");
		expect(document.activeElement).toBe(item("Google"));
	});

	it("selects with Enter and reports the selection", () => {
		const onSelectedChange = vi.fn();
		const tree = render(<Tree aria-label="Models" items={items} onSelectedChange={onSelectedChange} />);
		act(() => item("Google").focus());
		key(tree, "Enter");
		expect(onSelectedChange).toHaveBeenCalledWith("google", items[2]);
		expect(item("Google").getAttribute("aria-selected")).toBe("true");
	});

	it("checks a whole branch with Space and shows a mixed parent", () => {
		const onCheckedChange = vi.fn();
		const tree = render(
			<Tree
				aria-label="Allowed models"
				items={items}
				checkable
				selectionMode="none"
				defaultExpanded={["openai"]}
				defaultChecked={["gpt-6-cyber"]}
				onCheckedChange={onCheckedChange}
			/>
		);
		expect(tree.getAttribute("aria-multiselectable")).toBe("true");
		expect(item("OpenAI").getAttribute("aria-checked")).toBe("mixed");
		expect(item("GPT-6 Cyber").getAttribute("aria-checked")).toBe("true");
		act(() => item("OpenAI").focus());
		key(tree, " ");
		expect(item("OpenAI").getAttribute("aria-checked")).toBe("true");
		expect([...onCheckedChange.mock.lastCall![0]].sort()).toEqual(["gpt-6-cyber", "gpt-6.1-terra"]);
		expect(item("OpenAI").hasAttribute("aria-selected")).toBe(false);
	});

	it("does not check or select a disabled row", () => {
		const onCheckedChange = vi.fn();
		const tree = render(
			<Tree aria-label="Allowed models" items={items} checkable selectionMode="none" defaultExpanded={["anthropic"]} onCheckedChange={onCheckedChange} />
		);
		act(() => item("Claude Mythos 5.2").focus());
		key(tree, " ");
		expect(onCheckedChange).not.toHaveBeenCalled();
		expect(item("Claude Mythos 5.2").getAttribute("aria-disabled")).toBe("true");
	});

	it("does not select or check a child of a disabled branch", () => {
		const onCheckedChange = vi.fn();
		const onSelectedChange = vi.fn();
		const tree: TreeNode[] = [{ id: "lab", label: "Lab", disabled: true, children: [{ id: "model", label: "Model" }] }];
		const element = render(<Tree aria-label="Models" items={tree} checkable defaultExpanded={["lab"]} onCheckedChange={onCheckedChange} onSelectedChange={onSelectedChange} />);
		expect(item("Model").getAttribute("aria-disabled")).toBe("true");
		act(() => item("Model").focus());
		key(element, " ");
		key(element, "Enter");
		act(() => item("Model").querySelector<HTMLElement>("[data-slot=tree-row]")!.click());
		act(() => item("Model").querySelector<HTMLElement>("[data-slot=tree-checkbox]")!.click());
		expect(onCheckedChange).not.toHaveBeenCalled();
		expect(onSelectedChange).not.toHaveBeenCalled();
	});

	it("moves focus to the parent when a controlled collapse removes the focused row", () => {
		const element = render(<Tree aria-label="Models" items={items} expanded={["openai"]} />);
		act(() => item("GPT-6 Cyber").focus());
		render(<Tree aria-label="Models" items={items} expanded={[]} />);
		expect(document.activeElement).toBe(item("OpenAI"));
		key(element, "ArrowDown");
		expect(document.activeElement).toBe(item("Anthropic"));
	});

	it("leaves focus alone when it was outside the tree", () => {
		const outside = document.createElement("button");
		document.body.appendChild(outside);
		render(<Tree aria-label="Models" items={items} expanded={["openai"]} />);
		act(() => item("GPT-6 Cyber").focus());
		act(() => outside.focus());
		render(<Tree aria-label="Models" items={items} expanded={[]} />);
		expect(document.activeElement).toBe(outside);
		outside.remove();
	});
});
