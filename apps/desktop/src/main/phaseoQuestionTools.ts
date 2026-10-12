import { defineTool } from "@phaseo/agent-sdk";
import type { AgentCallbacks } from "./agentAdapter";
import type { AgentQuestion } from "../shared/workspace";
export function phaseoQuestionTools() {
 return [defineTool({ id: "ask_user", description: "Ask up to three concise questions when user input is needed. The run pauses durably until answered. Supply optional choices; users can also enter their own answer. This does not approve an action.", execute: false,
  parameters: { type: "object", properties: { questions: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", properties: { header: { type: "string", maxLength: 100 }, question: { type: "string", maxLength: 4000 }, multiSelect: { type: "boolean" }, options: { type: "array", minItems: 2, maxItems: 8, items: { type: "object", properties: { label: { type: "string", maxLength: 200 }, description: { type: "string", maxLength: 1000 } }, required: ["label"], additionalProperties: false } } }, required: ["header", "question"], additionalProperties: false } } }, required: ["questions"], additionalProperties: false },
 })];
}
export async function answerPhaseoQuestion(raw: unknown, callbacks: AgentCallbacks, signal: AbortSignal) {
 signal.throwIfAborted();
 if (!raw || typeof raw !== "object" || !("questions" in raw) || !Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 3 || Buffer.byteLength(JSON.stringify(raw)) > 16 * 1024) throw new Error("Provide one to three bounded questions.");
 const text = (value: unknown, maximum: number) => { if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error("Invalid question text."); return value; };
 const questions: AgentQuestion[] = raw.questions.map((entry: unknown, index: number) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid question.");
  const input = entry as Record<string, unknown>;
  if (input.multiSelect !== undefined && typeof input.multiSelect !== "boolean") throw new Error("Invalid question selection mode.");
  if (input.options !== undefined && (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 8)) throw new Error("Provide two to eight options.");
  const options = input.options === undefined ? undefined : (input.options as unknown[]).map(option => {
   if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("Invalid question option.");
   const item = option as Record<string, unknown>; return { label: text(item.label, 200), ...(item.description !== undefined ? { description: text(item.description, 1000) } : {}) };
  });
  if (options && new Set(options.map(option => option.label)).size !== options.length) throw new Error("Question options must have distinct labels.");
  return { id: "question-" + index, header: text(input.header, 100), question: text(input.question, 4000), isOther: true, multiSelect: input.multiSelect === true, options };
 });
 if (!callbacks.onQuestion) throw new Error("Question input is unavailable.");
 const answers = await callbacks.onQuestion(questions); signal.throwIfAborted();
 const result = questions.map(question => {
  const values = answers[question.id]; if (!Array.isArray(values) || !values.length || values.length > (question.multiSelect ? 8 : 1)) throw new Error("Answer every question within its selection limit.");
  return { question: question.question, answers: values.map(value => text(value, 10000)) };
 });
 if (Buffer.byteLength(JSON.stringify(result)) > 64 * 1024) throw new Error("Question answers exceed 64 KiB.");
 return { answers: result };
}
