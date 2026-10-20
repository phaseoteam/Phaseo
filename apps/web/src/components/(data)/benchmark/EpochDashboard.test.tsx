/** @jest-environment jsdom */
import { act, cloneElement, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import { EpochDashboard } from "./EpochDashboard";
import type { EpochDashboardData } from "@/lib/benchmarks/epochDashboard";

jest.mock("nuqs", () => {
	const parser = { withDefault: () => parser };
	return { parseAsString: parser, parseAsArrayOf: () => parser, useQueryStates: () => {
		const React = jest.requireActual("react");
		const defaults = { eciMetric: "overall", eciView: "timeline", eciOrg: "all", eciAccess: "all", eciSince: "2024", eciModels: null, eciSearch: "" };
		const [state, set] = React.useState(defaults);
		return [state, (patch: Record<string, unknown>) => set((current: Record<string, unknown>) => ({ ...current, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? defaults[k as keyof typeof defaults]])) }))];
	} };
});
jest.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
jest.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("recharts", () => ({ ...jest.requireActual("recharts"), ResponsiveContainer: ({ children }: { children: ReactElement }) => cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 900, height: 500 }) }));

const data: EpochDashboardData = { source: "epoch", sourceDate: null, domainsAvailable: true, rows: [
	{ id: "a", name: "Alpha high", organisation: "Lab A", access: "open", date: "2025-01-01", modelId: "lab/a", scores: { overall: 150, coding: 155, maths: null }, interval: { low: 148, high: 152 }, counts: { coding: 3, maths: 0 } },
	{ id: "b", name: "Beta low", organisation: "Lab B", access: "closed", date: "2026-01-01", modelId: null, scores: { overall: 160, coding: 162, maths: 170 }, interval: null, counts: { coding: 2, maths: 2 } },
] };

async function mount(source = data) {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node);
	await act(async () => root.render(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><EpochDashboard data={source} /></NextIntlClientProvider>));
	return { node, cleanup: () => { act(() => root.unmount()); node.remove(); } };
}

it("retains SVG focus while pinning and compares ECI point differences, then dismisses with Escape", async () => {
	const { node, cleanup } = await mount();
	try {
		const a = node.querySelector<SVGElement>('circle[role="button"][aria-label^="Alpha"]')!;
		expect(a).not.toBeNull();
		await act(async () => a.focus());
		expect(document.activeElement).toBe(a);
		await act(async () => a.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(a.getAttribute("aria-pressed")).toBe("true");
		expect(node.querySelector('circle[aria-label^="Alpha"]')).toBe(a);
		const b = node.querySelector<SVGElement>('circle[role="button"][aria-label^="Beta"]')!;
		await act(async () => b.focus());
		expect(node.querySelector('[aria-live="polite"]')?.textContent).toContain("Compared with Alpha high");
		expect(node.querySelector('[aria-live="polite"]')?.textContent).toContain("+10");
		await act(async () => b.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
		expect(a.getAttribute("aria-pressed")).toBe("false");
		expect(node.querySelector('[aria-live="polite"]')?.textContent).toContain("Hover or focus");
	} finally { cleanup(); }
});
it("switches domain axes, preserves missing scores and never displays the general CI as a domain CI", async () => {
	const { node, cleanup } = await mount();
	try {
		const coding = [...node.querySelectorAll('button')].find((b) => b.textContent === "Coding ECI")!;
		await act(async () => coding.click());
		expect(node.querySelector('h2')?.textContent).toBe("Models");
		expect(node.textContent).toContain("Coding ECI vs general ECI");
		const a = node.querySelector<SVGElement>('circle[aria-label^="Alpha"]')!;
		await act(async () => a.focus());
		expect(node.querySelector('[aria-live="polite"]')?.textContent).toContain("3 domain benchmarks");
		expect(node.querySelector('[aria-live="polite"]')?.textContent).not.toContain("confidence interval");
		expect(node.querySelector('[aria-live="polite"]')?.textContent).toContain("—");
	} finally { cleanup(); }
});
it("clears the model selection without reverting to all models", async () => {
	const { node, cleanup } = await mount();
	try {
		const clear = [...node.querySelectorAll('button')].find((b) => b.textContent === "Clear")!;
		await act(async () => clear.click());
		expect(node.querySelectorAll('circle[role="button"]')).toHaveLength(0);
		expect(node.textContent).toContain("No models match these filters.");
	} finally { cleanup(); }
});
