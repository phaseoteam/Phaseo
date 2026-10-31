/** @jest-environment jsdom */
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import common from "../../../../messages/en-GB/common.json";
import catalogue from "../../../../messages/en-GB/catalogue.json";
import { DashboardInspectionCard, useDashboardInspection } from "./ArtificialAnalysisDashboardInspection";
import type { DashboardRow } from "@/lib/benchmarks/artificialAnalysisDashboard";

jest.mock("@/components/Logo", () => ({ Logo: () => null }));
let root: Root, container: HTMLDivElement;
let inspection: ReturnType<typeof useDashboardInspection>;
function Harness() {
 const regionRef = useRef<HTMLElement>(null);
 const state = useDashboardInspection(regionRef);
 useEffect(() => { inspection = state; });
 return <section ref={regionRef}><button>Inside</button><output>{state.selection ? `${state.selection.kind}:${state.selection.id}` : "none"}</output></section>;
}
beforeEach(() => {
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
 jest.useFakeTimers();
 container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
it("restores a pinned configuration after temporary point or model inspection", () => {
 act(() => root.render(<Harness />));
 act(() => inspection.pin({ kind: "configuration", id: "high" }));
 act(() => inspection.inspect({ kind: "model", id: "other-model" }));
 expect(container.querySelector("output")?.textContent).toBe("model:other-model");
 act(() => inspection.leave());
 act(() => jest.advanceTimersByTime(200));
 expect(container.querySelector("output")?.textContent).toBe("configuration:high");
 act(() => inspection.pin({ kind: "configuration", id: "high" }));
 expect(container.querySelector("output")?.textContent).toBe("none");
});
it("keeps details open while crossing into the card and dismisses outside the chart", () => {
 act(() => root.render(<Harness />));
 act(() => inspection.inspect({ kind: "configuration", id: "low" }));
 act(() => inspection.leave());
 act(() => jest.advanceTimersByTime(100));
 act(() => inspection.keep());
 act(() => jest.advanceTimersByTime(200));
 expect(container.querySelector("output")?.textContent).toBe("configuration:low");
 act(() => container.querySelector("button")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
 expect(container.querySelector("output")?.textContent).toBe("configuration:low");
 act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
 expect(container.querySelector("output")?.textContent).toBe("none");
});
it("shows published zero values, omits absent metrics, and links the exact source configuration", () => {
 const row: DashboardRow = { id: "low", modelId: "lab/model", modelName: "Model", sourceName: "Model low", creatorId: "lab", colour: null, effort: "low", intelligence: 0, tokensPerTask: 0, costPerTask: null, totalCost: null, totalTokens: null, timePerTask: null, sourceSlug: "model-low", benchmarks: {}, capabilities: {} };
 const close = jest.fn();
 act(() => root.render(<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><DashboardInspectionCard row={row} title="Output tokens per task" metric={0} unit="tokens" pinned keep={() => {}} leave={() => {}} close={close} /></AppIntlProvider>));
 expect(container.querySelectorAll("dd")).toHaveLength(2);
 expect([...container.querySelectorAll("dd")].map((node) => node.textContent)).toEqual(["0", "0"]);
 expect(container.textContent).not.toContain("Cost per task");
 expect(container.querySelector("a")?.href).toBe("https://artificialanalysis.ai/models/model-low");
 act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click());
 expect(close).toHaveBeenCalledTimes(1);
});
it("compares a hovered configuration with a pin without inventing ratios for zero baselines", () => {
 const row: DashboardRow = { id: "high", modelId: "lab/model", modelName: "Model", sourceName: "Model high", creatorId: "lab", colour: null, effort: "high", intelligence: 40, tokensPerTask: 200, costPerTask: 0, totalCost: null, totalTokens: null, timePerTask: null, benchmarks: {}, capabilities: {} };
 const comparison = { ...row, id: "low", sourceName: "Model low", effort: "low", intelligence: 20, tokensPerTask: 100 };
 act(() => root.render(<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: common, Catalogue: catalogue }}><DashboardInspectionCard row={row} comparison={comparison} comparisonMetric={100} title="Output tokens per task" metric={200} unit="tokens" pinned={false} keep={() => {}} leave={() => {}} close={() => {}} /></AppIntlProvider>));
 const rows = [...container.querySelectorAll("tbody tr")];
 expect(rows).toHaveLength(3);
 expect(rows[0].textContent).toContain("20402×");
 expect(rows[1].textContent).toContain("1002002×");
 expect(rows[2].querySelector("td:last-child")?.textContent).toBe("—");
 expect(container.textContent).not.toMatch(/Infinity|NaN/);
});
it("does not reopen on the point exposed beneath a dismissed card", () => {
 act(() => root.render(<Harness />));
 act(() => inspection.hover({ kind: "configuration", id: "high" }));
 act(() => inspection.clear());
 act(() => inspection.hover({ kind: "configuration", id: "under-card" }));
 expect(container.querySelector("output")?.textContent).toBe("none");
 act(() => document.body.dispatchEvent(new Event("pointermove", { bubbles: true })));
 act(() => inspection.hover({ kind: "configuration", id: "next" }));
 expect(container.querySelector("output")?.textContent).toBe("configuration:next");
 act(() => inspection.clear());
 act(() => inspection.inspect({ kind: "configuration", id: "keyboard" }));
 expect(container.querySelector("output")?.textContent).toBe("configuration:keyboard");
});
