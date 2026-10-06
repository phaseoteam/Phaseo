import type { PlanStep } from "./planSteps.js";
export type AgentActivity = {
  timelineOrder?: number;
  nativeAgent?: {
    id: string;
    model?: string;
    status: "pending" | "running" | "completed" | "failed" | "interrupted";
  };
  id: string;
  type: "tool" | "reasoning" | "plan" | "usage" | "compaction";
  title: string;
  text: string;
  status?: "running" | "completed" | "failed";
  steps?: PlanStep[];
  explanation?: string;
  summary?: string;
  compaction?: { beforeTokens: number; afterTokens?: number; durationMs?: number };
};
export type AgentQuestion = {
  id: string;
  header: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  multiSelect?: boolean;
  options?: { label: string; description?: string; preview?: string }[] | null;
};
export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  organisationId?: string;
  organisationName?: string;
  releaseDate?: string;
  default?: boolean;
  reasoningEfforts?: { id: string; description: string }[];
  defaultReasoningEffort?: string;
  serviceTiers?: { id: string; name: string; description: string }[];
  defaultServiceTier?: string;
};
export type ProjectFile = { name: string; path: string; directory: boolean };
export type GitFile = {
  path: string;
  oldPath?: string;
  indexStatus: string;
  worktreeStatus: string;
};
export type GitReview = {
  status: string;
  files: GitFile[];
  diff: string;
  stagedDiff: string;
  diffHash: string;
  stagedDiffHash: string;
  branch: string;
};
