import { dashboardVisibleValueLabels, formatDashboardCost } from "./artificialAnalysisDashboard";

describe("AA cost display", () => {
 it("keeps sub-cent costs nonzero and abbreviates large plotted costs", () => {
  expect(formatDashboardCost(0, "en-GB")).toBe("$0");
  expect(formatDashboardCost(0.0000123, "en-GB")).toBe("$0.0000123");
  expect(formatDashboardCost(-0.00123, "en-GB")).toBe("-$0.00123");
  expect(formatDashboardCost(12345, "en-GB", true, 3)).toBe("$12.3k");
  expect(formatDashboardCost(0.130751908699, "en-GB")).toBe("$0.1308");
  expect(formatDashboardCost(0.00123, "de-DE")).toContain("0,00123");
 });
 it("keeps group maxima legible when neighbouring low-cost configurations cluster", () => {
  const labels = [
   { id: "low", x: 90, y: 300, label: "$0.052", priority: false },
   { id: "medium", x: 106, y: 299, label: "$0.067", priority: false },
   { id: "max", x: 122, y: 298, label: "$0.078", priority: true },
   { id: "next-max", x: 210, y: 297, label: "$0.213", priority: true },
   { id: "separate-high", x: 106, y: 200, label: "$3.26", priority: false },
  ];
  expect([...dashboardVisibleValueLabels(labels, 58, 300)].sort()).toEqual(["max", "next-max", "separate-high"]);
  expect(dashboardVisibleValueLabels([{ id: "clipped", x: 60, y: 200, label: "$0.0000123", priority: true }], 58, 300).size).toBe(0);
 });
});
