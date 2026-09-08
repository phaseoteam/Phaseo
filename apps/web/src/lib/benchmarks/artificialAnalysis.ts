export const artificialAnalysisMetrics = [
  { id: "aa-intelligence-index-v4", key: "intelligence", label: "Intelligence", description: "Overall model capability" },
  { id: "aa-coding-index-v4", key: "coding", label: "Coding", description: "Software engineering capability" },
  { id: "aa-agentic-index-v4", key: "agentic", label: "Agentic", description: "Multi-step task performance" },
  { id: "aa-intelligence-index-cost-v4", key: "cost", label: "Evaluation cost", description: "Full Intelligence Index evaluation · USD" },
] as const;

const artificialAnalysisBenchmarkPattern = /^aa-(?:intelligence|coding|agentic)-index(?:-cost)?-v\d+$/;

export function isArtificialAnalysisBenchmark(id: string) {
  return artificialAnalysisBenchmarkPattern.test(id);
}

export function isArtificialAnalysisCostBenchmark(id: string) {
  return /^aa-intelligence-index-cost-v\d+$/.test(id);
}

export function artificialAnalysisMetricKey(id: string) {
  if (isArtificialAnalysisCostBenchmark(id)) return "cost";
  return id.match(/^aa-(intelligence|coding|agentic)-index-v\d+$/)?.[1] ?? null;
}
export function formatArtificialAnalysisScore(id: string, score: number) {
  return new Intl.NumberFormat("en-US", isArtificialAnalysisCostBenchmark(id)
    ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }).format(score);
}
export function artificialAnalysisVersion(info?: string | null) {
  return info?.match(/Intelligence Index v([\d.]+)/)?.[1] ?? null;
}
