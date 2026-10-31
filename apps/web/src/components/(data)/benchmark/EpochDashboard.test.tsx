/** @vitest-environment jsdom */
import { it, expect, vi } from "vitest";
import { act, cloneElement, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import { EpochDashboard } from "./EpochDashboard";
import type { EpochDashboardData } from "@/lib/benchmarks/epochDashboard";

vi.mock("nuqs", async () => {
	const React = await vi.importActual<typeof import("react")>("react");
	const parser = { withDefault: () => parser };
	return { parseAsString: parser, parseAsArrayOf: () => parser, useQueryStates: () => {
		const defaults = { eciMetric: "overall", eciView: "range", eciOrg: "all", eciAccess: "all", eciSince: "2024", eciModels: null, eciSearch: "", eciLabels: "true" };
		const [state, set] = React.useState(defaults);
		return [state, (patch: Record<string, unknown>) => set((current: Record<string, unknown>) => ({ ...current, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? defaults[k as keyof typeof defaults]])) }))];
	} };
});
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("recharts", async () => ({ ...(await vi.importActual("recharts")), ResponsiveContainer: ({ children }: { children: ReactElement }) => cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 900, height: 500 }) }));

const data: EpochDashboardData = { source: "epoch", sourceDate: null, domainsAvailable: true, rows: [
	{ id: "a", name: "Alpha high", organisation: "Lab A", access: "open", date: "2025-01-01", modelId: "lab/a", scores: { overall: 150, coding: 155, maths: null }, interval: { low: 148, high: 152 }, counts: { coding: 3, maths: 0 } },
	{ id: "b", name: "Beta low", organisation: "Lab B", access: "closed", date: "2026-01-01", modelId: null, scores: { overall: 160, coding: 162, maths: 170 }, interval: null, counts: { coding: 2, maths: 2 } },
] };

async function mount(source = data) {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
	const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node);
	await act(async () => root.render(<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><EpochDashboard data={source} /></AppIntlProvider>));
	return { node, cleanup: () => { act(() => root.unmount()); node.remove(); } };
}

it("retains SVG focus while pinning and compares ECI point differences, then dismisses with Escape", async () => {
	const { node, cleanup } = await mount();
	try {
		await act(async () => [...node.querySelectorAll<HTMLButtonElement>("[data-eci-chart=overall] button")].find((button) => button.textContent === "Capability over time")!.click());
		const a = node.querySelector<SVGElement>('circle[role="button"][aria-label^="Alpha"]')!;
		expect(a).not.toBeNull();
		await act(async () => a.focus());
		expect(document.activeElement).toBe(a);
		expect(node.querySelector('[role="status"]')?.textContent).toContain("90% confidence interval");
		expect(node.querySelectorAll('[data-eci-chart]')).toHaveLength(3);
		expect(node.querySelector('aside[aria-label="Models"]')).not.toBeNull();
		await act(async () => a.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(a.getAttribute("aria-pressed")).toBe("true");
		expect(node.querySelector('circle[aria-label^="Alpha"]')).toBe(a);
		const b = node.querySelector<SVGElement>('circle[role="button"][aria-label^="Beta"]')!;
		await act(async () => b.focus());
		expect(node.querySelector('[role="status"]')?.textContent).toContain("Compared with Alpha high");
		expect(node.querySelector('[role="status"]')?.textContent).toContain("+10");
		await act(async () => b.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
		expect(a.getAttribute("aria-pressed")).toBe("false");
		expect(node.querySelector('[data-pinned="true"]')).toBeNull();
	} finally { cleanup(); }
});
it("switches domain axes, preserves missing scores and never displays the general CI as a domain CI", async () => {
	const { node, cleanup } = await mount();
	try {
		const coding = [...node.querySelectorAll('button')].find((b) => b.textContent === "Coding ECI")!;
		await act(async () => coding.click());
		expect(node.querySelector('[data-eci-workspace]')).not.toBeNull();
		expect(node.textContent).toContain("Coding ECI vs general ECI");
		const a = node.querySelector<SVGElement>('circle[aria-label^="Alpha"]')!;
		await act(async () => a.focus());
		expect(node.querySelector('[role="status"]')?.textContent).toContain("3 domain benchmarks");
		expect(node.querySelector('[role="status"]')?.textContent).not.toContain("confidence interval");
		expect(node.querySelector('[role="status"]')?.textContent).toContain("—");
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

it("defaults to a common-axis range comparison and retains missing intervals without inventing them", async () => {
	const mounted = await mount();
	try {
		const range = mounted.node.querySelector('[data-eci-ranges]')!;
		expect(range).not.toBeNull();
		expect(range.querySelectorAll('[data-eci-interval]')).toHaveLength(1);
		expect(range.textContent).toContain("148–152");
		expect(range.textContent).toContain("Interval unavailable");
		const a = range.querySelector<HTMLButtonElement>('[data-eci-range="a"]')!;
		await act(async () => a.click());
		const b = range.querySelector<HTMLButtonElement>('[data-eci-range="b"]')!;
		await act(async () => b.focus());
		const card = mounted.node.querySelector('[role="status"]')!;
		expect(card.textContent).toContain("148–152");
		expect(card.textContent).toContain("Interval unavailable");
		expect(card.textContent).toContain("not a test of statistical significance");
	} finally { mounted.cleanup(); }
});

it("plots zero and negative estimates on the range axis", async () => {
	const { node, cleanup } = await mount({ ...data, rows: data.rows.map((row, index) => ({ ...row, scores: { ...row.scores, overall: index ? -2 : 0 }, interval: index ? null : { low: -1, high: 1 } })) });
	try {
		const range = node.querySelector('[data-eci-ranges]')!;
		expect(range.querySelector('[data-eci-range="a"]')?.getAttribute("aria-label")).toContain("Alpha high: 0");
		expect(range.querySelector('[data-eci-range="b"]')?.getAttribute("aria-label")).toContain("Beta low: -2");
		expect(range.querySelectorAll('[data-eci-interval]')).toHaveLength(1);
		expect(range.textContent).not.toContain("NaN");
	} finally { cleanup(); }
});
