/** @jest-environment jsdom */
import { act, cloneElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import { ArtificialAnalysisDashboardChart } from "./ArtificialAnalysisDashboardChart";
import type { DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

jest.mock("@/components/Logo", () => ({ Logo: () => null }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("recharts", () => ({ ...jest.requireActual("recharts"), ResponsiveContainer: ({ children }: { children: ReactElement }) => cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 900, height: 500 }) }));

it.each([false, true])("retains SVG focus through inspection, pinning and dismissal (scatter: %s)", async (scatter) => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
 const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node);
 const row: DashboardRow = { id: "low", modelId: "lab/model", modelName: "Model", sourceName: "Model low", creatorId: "lab", colour: null, effort: "low", intelligence: 40, tokensPerTask: 200, totalTokens: null, costPerTask: 1, totalCost: null, timePerTask: null, benchmarks: {}, capabilities: {} };
 try {
 await act(async () => root.render(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><ArtificialAnalysisDashboardChart title="Output tokens per task" rows={[row]} value={(item) => scatter ? item.intelligence : item.tokensPerTask} xValue={scatter ? (item) => item.costPerTask : undefined} xLabel="Cost per task" xUnit="usd" unit={scatter ? "score" : "tokens"} highlight={null} /></NextIntlClientProvider>));
 const point = node.querySelector<SVGElement>('[role="button"][aria-label^="Model low:"]');
 expect(point).not.toBeNull();
 await act(async () => point!.focus());
 expect(node.querySelector('[role="button"][aria-label^="Model low:"]')).toBe(point);
 expect(document.activeElement).toBe(point);
 expect(node.querySelector('[role="status"]')?.textContent).toContain("200");
 await act(async () => point!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
 expect(node.querySelector('[role="status"]')?.getAttribute("data-pinned")).toBe("true");
 expect(node.querySelector('[role="button"][aria-label^="Model low:"]')).toBe(point);
 await act(async () => point!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
 expect(node.querySelector('[role="status"]')).toBeNull();
 expect(node.querySelector('[role="button"][aria-label^="Model low:"]')).toBe(point);
 } finally { act(() => root.unmount()); node.remove(); }
});
it("inspects and pins the nearest configuration when scatter hit areas overlap", async () => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
 const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node);
 const row: DashboardRow = { id: "low", modelId: "lab/model", modelName: "Model", sourceName: "Model low", creatorId: "lab", colour: null, effort: "low", intelligence: 40, tokensPerTask: 200, totalTokens: null, costPerTask: 1, totalCost: null, timePerTask: null, benchmarks: {}, capabilities: {} };
 const neighbour = { ...row, id: "neighbour", modelId: "lab/neighbour", modelName: "Neighbour", sourceName: "Neighbour high", intelligence: 40.01, costPerTask: 1.001 };
 try {
 await act(async () => root.render(<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><ArtificialAnalysisDashboardChart title="Cost vs intelligence" rows={[row, neighbour]} value={(item) => item.intelligence} xValue={(item) => item.costPerTask} xUnit="usd" highlight={null} /></NextIntlClientProvider>));
 const point = node.querySelector<SVGElement>('[role="button"][aria-label^="Model low:"]')!;
 const neighbourPoint = node.querySelector<SVGElement>('[role="button"][aria-label^="Neighbour high:"]')!;
 const svg = point.ownerSVGElement!;
 Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }), createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return this; } }) });
 const coordinates = { bubbles: true, clientX: Number(point.getAttribute("cx")), clientY: Number(point.getAttribute("cy")) };
 await act(async () => neighbourPoint.dispatchEvent(new MouseEvent("pointermove", coordinates)));
 expect(node.querySelector('[role="status"]')?.textContent).toContain("Model");
 expect(node.querySelector('[role="status"]')?.textContent).not.toContain("Neighbour");
 await act(async () => neighbourPoint.dispatchEvent(new MouseEvent("click", coordinates)));
 expect(node.querySelector('[role="status"]')?.getAttribute("data-pinned")).toBe("true");
 expect(point.getAttribute("aria-pressed")).toBe("true");
 expect(neighbourPoint.getAttribute("aria-pressed")).toBe("false");
 } finally { act(() => root.unmount()); node.remove(); }
});
