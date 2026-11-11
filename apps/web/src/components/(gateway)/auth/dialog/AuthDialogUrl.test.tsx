/** @vitest-environment jsdom */
// The ?auth= parameters are nuqs state: they open the dialog, Back/Forward removing
// them closes it, and closing clears them (shallow, replace).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import type { AuthDialogState } from "./authDialogStore";

vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname: "/" }) }));
// The real dialog body is not under test here: a stub exposes the state and the close callback.
let lastProps: { state: AuthDialogState; onOpenChange: (open: boolean) => void } | null = null;
vi.mock("./AuthDialogContent", () => ({
	default: (props: { state: AuthDialogState; onOpenChange: (open: boolean) => void }) => {
		lastProps = props;
		return <div data-open={String(props.state.open)} data-step={props.state.step} />;
	},
}));

import { AuthDialog } from "./AuthDialog";
import { closeAuthDialog, getAuthDialogState, openAuthDialog } from "./authDialogStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(searchParams: string, onUrlUpdate?: (event: UrlUpdateEvent) => void, key = searchParams) {
	if (!container) {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	}
	await act(async () => {
		root!.render(
			// The testing adapter reads searchParams once; a new key stands in for a URL change
			// (in the app, the TanStack Router adapter feeds Back/Forward into the same hook).
			<NuqsTestingAdapter key={key} searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
				<AuthDialog />
			</NuqsTestingAdapter>,
		);
	});
	// Let the lazy dialog body resolve.
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	root = null;
	container = null;
	lastProps = null;
	closeAuthDialog();
});

describe("AuthDialog URL state", () => {
	it("opens from ?auth= and clears the parameters shallowly when closed", async () => {
		const updates: UrlUpdateEvent[] = [];
		await render("?auth=mfa&returnUrl=%2Fsettings&tab=1", (event) => updates.push(event));
		expect(getAuthDialogState()).toMatchObject({ open: true, step: "mfa", returnUrl: "/settings", fromUrl: true });

		await act(async () => lastProps!.onOpenChange(false));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
		});
		expect(getAuthDialogState().open).toBe(false);
		const last = updates.at(-1)!;
		expect(last.searchParams.get("auth")).toBeNull();
		expect(last.searchParams.get("returnUrl")).toBeNull();
		// Unrelated parameters stay; the update is shallow, replaces history and keeps the scroll.
		expect(last.searchParams.get("tab")).toBe("1");
		expect(last.options).toMatchObject({ shallow: true, scroll: false, history: "replace" });
	});

	it("closes when Back/Forward removes ?auth=", async () => {
		await render("?auth=sign-in");
		expect(getAuthDialogState()).toMatchObject({ open: true, fromUrl: true });
		await render("");
		expect(getAuthDialogState().open).toBe(false);
	});

	it("leaves a dialog opened by a link alone when the URL has no ?auth=", async () => {
		await render("?tab=1", undefined, "same");
		await act(async () => openAuthDialog({ step: "sign-up", returnUrl: "/models" }));
		// A re-render with no ?auth= (the effect re-runs on the same page) must not close it.
		await render("?tab=2", undefined, "same");
		expect(getAuthDialogState()).toMatchObject({ open: true, step: "sign-up" });
	});
});
