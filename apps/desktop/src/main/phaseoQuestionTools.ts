import { defineTool } from "@phaseo/agent-sdk";
import type { AgentCallbacks } from "./agentAdapter";
import type { AgentQuestion } from "../shared/workspace";

/** ask_user mirrors Claude Code's AskUserQuestion, so every Phaseo model asks the same way and gets the same answer panel. */
export function phaseoQuestionTools() {
 return [defineTool({ id: "ask_user", description: "Ask the user one to four multiple-choice questions when you need a decision or preference to continue. The run pauses until they answer. Give each question a short header (12 characters or fewer) and two to four distinct options, each with a description of what choosing it means; use multiSelect when several can apply. Users can always write their own answer instead. They may dismiss the questions, in which case continue without the answers. This does not approve an action.", execute: false,
  parameters: { type: "object", properties: { questions: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: {
   question: { type: "string", maxLength: 4000, description: "The full question, ending with a question mark." },
   header: { type: "string", maxLength: 12, description: "A very short label, such as \"Auth method\"." },
   multiSelect: { type: "boolean" },
   options: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", properties: { label: { type: "string", maxLength: 200 }, description: { type: "string", maxLength: 1000 }, preview: { type: "string", maxLength: 10000, description: "Optional Markdown shown when the option is selected, such as a code sample or mock-up." } }, required: ["label", "description"], additionalProperties: false } },
  }, required: ["question", "header", "options", "multiSelect"], additionalProperties: false } } }, required: ["questions"], additionalProperties: false },
 })];
}

export async function answerPhaseoQuestion(raw: unknown, callbacks: AgentCallbacks, signal: AbortSignal) {
 signal.throwIfAborted();
 if (!raw || typeof raw !== "object" || !("questions" in raw) || !Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 4 || Buffer.byteLength(JSON.stringify(raw)) > 48 * 1024) throw new Error("Provide one to four bounded questions.");
 const text = (value: unknown, maximum: number, what = "question text") => { if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error(`Invalid ${what}.`); return value; };
 const questions: AgentQuestion[] = raw.questions.map((entry: unknown, index: number) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid question.");
  const input = entry as Record<string, unknown>;
  if (typeof input.multiSelect !== "boolean") throw new Error("Say whether each question allows several answers (multiSelect).");
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 4) throw new Error("Give each question two to four options.");
  const options = (input.options as unknown[]).map(option => {
   if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("Invalid question option.");
   const item = option as Record<string, unknown>;
   return { label: text(item.label, 200, "option label"), description: text(item.description, 1000, "option description"), ...(item.preview !== undefined ? { preview: text(item.preview, 10000, "option preview") } : {}) };
  });
  if (new Set(options.map(option => option.label)).size !== options.length) throw new Error("Question options must have distinct labels.");
  return { id: "question-" + index, header: text(input.header, 12, "header (12 characters or fewer)"), question: text(input.question, 4000), isOther: true, multiSelect: input.multiSelect, options };
 });
 if (new Set(questions.map(question => question.question)).size !== questions.length) throw new Error("Each question must be different.");
 if (!callbacks.onQuestion) throw new Error("Question input is unavailable.");
 const answers = await callbacks.onQuestion(questions); signal.throwIfAborted();
 if (!Object.keys(answers).length) return { dismissed: true, message: "The user dismissed these questions. Continue without the answers, or ask again only if you cannot proceed." };
 // Keyed by question text like AskUserQuestion; several answers for multiSelect, one otherwise. "Other" text is included as given.
 const result = Object.fromEntries(questions.map(question => {
  const values = answers[question.id];
  if (!Array.isArray(values) || !values.length || values.length > (question.multiSelect ? (question.options?.length ?? 0) + 1 : 1)) throw new Error("Answer every question within its selection limit.");
  const checked = values.map(value => text(value, 10000, "answer"));
  return [question.question, question.multiSelect ? checked : checked[0]];
 }));
 if (Buffer.byteLength(JSON.stringify(result)) > 64 * 1024) throw new Error("Question answers exceed 64 KiB.");
 return { answers: result };
}
