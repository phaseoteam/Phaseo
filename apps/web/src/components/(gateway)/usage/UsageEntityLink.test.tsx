/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import UsageEntityLink from "./UsageEntityLink";

// The app's Link needs a router; a plain anchor is enough here.
vi.mock("@/components/link", () => ({
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
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("UsageEntityLink", () => {
	it("is a plain catalogue link that the site-wide entity card recognises, and does not open the row", () => {
		const onRowClick = vi.fn();
		act(() => root.render(
			<div onClick={onRowClick}>
				<UsageEntityLink href="/models/anthropic/claude-fable-5-2">Claude Fable 5.2</UsageEntityLink>
			</div>,
		));
		const link = container.querySelector("a")!;
		expect(link.getAttribute("href")).toBe("/models/anthropic/claude-fable-5-2");
		// No per-cell card: the global EntityCards listener handles this link.
		expect(container.querySelector("[data-slot=hover-card-trigger]")).toBeNull();
		act(() => link.click());
		expect(onRowClick).not.toHaveBeenCalled();
	});

	it("renders text without an href", () => {
		act(() => root.render(<UsageEntityLink>Unknown app</UsageEntityLink>));
		expect(container.querySelector("a")).toBeNull();
		expect(container.textContent).toBe("Unknown app");
	});
});
