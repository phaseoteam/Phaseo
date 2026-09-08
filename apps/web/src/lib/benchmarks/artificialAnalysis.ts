export const artificialAnalysisMetrics = [
  { id: "aa-intelligence-index-v4", label: "Intelligence", description: "Overall model capability" },
  { id: "aa-coding-index-v4", label: "Coding", description: "Software engineering capability" },
  { id: "aa-agentic-index-v4", label: "Agentic", description: "Multi-step task performance" },
  { id: "aa-intelligence-index-cost-v4", label: "Evaluation cost", description: "Full Intelligence Index evaluation · USD" },
] as const;
export function isArtificialAnalysisBenchmark(id: string) {
  return artificialAnalysisMetrics.some((metric) => metric.id === id);
}
export function formatArtificialAnalysisScore(id: string, score: number) {
  return new Intl.NumberFormat("en-US", id === "aa-intelligence-index-cost-v4"
    ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }).format(score);
}
export function artificialAnalysisVersion(info?: string | null) {
  return info?.match(/Intelligence Index v([\d.]+)/)?.[1] ?? null;
}
