import { defineTool } from "@phaseo/agent-sdk";
import type { AgentCallbacks } from "./agentAdapter";
import type { PlanStep } from "../shared/planSteps";

type PhaseoPlan = { steps: PlanStep[]; explanation: string };
function plan(value: unknown): PhaseoPlan {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a plan.");
 const input = value as Record<string, unknown>;
 if (!Array.isArray(input.steps) || input.steps.length > 200) throw new Error("A plan can contain at most 200 steps.");
 if (input.explanation !== undefined && (typeof input.explanation !== "string" || input.explanation.length > 4000)) throw new Error("Plan explanation is too long or invalid.");
 const steps = input.steps.map((entry: unknown): PlanStep => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid plan step.");
  const item = entry as Record<string, unknown>;
  if (typeof item.text !== "string" || !item.text.trim() || item.text.length > 10000 || !["pending", "in_progress", "completed", "cancelled"].includes(item.status as string)) throw new Error("Invalid plan step.");
  return { text: item.text, status: item.status as PlanStep["status"] };
 });
 if (steps.filter(step => step.status === "in_progress").length > 1) throw new Error("Only one plan step can be in progress.");
 const result = { steps, explanation: typeof input.explanation === "string" ? input.explanation : "" };
 if (Buffer.byteLength(JSON.stringify(result), "utf8") > 64 * 1024) throw new Error("Plan exceeds 64 KiB.");
 return result;
}
export function publishPhaseoPlan(context: unknown, callbacks: AgentCallbacks) {
 if (!context || typeof context !== "object" || !("phaseoPlan" in context)) return;
 const current = plan(context.phaseoPlan);
 callbacks.onActivity?.({ id: "phaseo-plan", type: "plan", title: "Plan", text: JSON.stringify(current), steps: current.steps, explanation: current.explanation });
}
export function phaseoPlanTools() {
 return [defineTool({
  id: "update_plan", onError: "return-to-model", description: "Replace the current work checklist. Track complex work with pending, in_progress, completed or cancelled steps. At most one step may be in progress. Use an empty list to clear the plan. This records progress; it does not grant permission to execute actions.",
  parameters: { type: "object", properties: { steps: { type: "array", maxItems: 200, items: { type: "object", properties: { text: { type: "string", minLength: 1, maxLength: 10000 }, status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] } }, required: ["text", "status"], additionalProperties: false } }, explanation: { type: "string", maxLength: 4000 } }, required: ["steps"], additionalProperties: false },
  execute(raw: unknown, context) {
   const current = plan(raw);
   context.setContext({ ...(context.context && typeof context.context === "object" ? context.context : {}), phaseoPlan: current });
   return current;
  },
 }), defineTool({
  id: "read_plan", description: "Read the current work checklist and its progress.", parameters: { type: "object", properties: {}, additionalProperties: false },
  execute(_raw: unknown, context) { return context.context && typeof context.context === "object" && "phaseoPlan" in context.context ? plan(context.context.phaseoPlan) : { steps: [], explanation: "" }; },
 })];
}
