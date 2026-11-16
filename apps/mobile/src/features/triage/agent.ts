import { streamRequestBody } from "@/features/chat/transport";
import type { StreamToolCall } from "@/features/chat/stream";
import { DEFAULT_SEARCH_PATHS, SOURCE_REPOSITORY, SourceError, type SourceReader } from "./source";

/** The build being triaged, as the prompt describes it. */
export type TriageBuild = { app: string; version: string; buildNumber: number | null; commit: string | null; dirty: boolean; device: string; os: string; /** The build's commit isn't on GitHub, so the source read is main. */ unpublished?: boolean };
export type IssueDraft = { title: string; body: string };
/** One thing the agent did, for the progress list: "Searched for useChat in apps/mobile/src". */
export type TriageStep = { id: string; label: string; detail?: string; failed?: boolean };
export type TriageOutcome = { summary: string; draft: IssueDraft | null; costUsd: number | null; turns: number };

const MAX_TURNS = 40;
const TOOL_OUTPUT_CHARS = 12_000;

type ToolMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "function" as const, function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });

export const TRIAGE_TOOLS = [
  fn("search_code", `Find lines matching a regular expression (case-insensitive) in the source. Searches ${DEFAULT_SEARCH_PATHS.join(" and ")} unless you name folders.`, {
    pattern: { type: "string", description: "A regular expression, such as `useChatModels|chatModelStore`." },
    paths: { type: "array", items: { type: "string" }, description: "Folders to search, such as [\"apps/mobile/src/features/chat\"]. At most 600 files in all." },
  }, ["pattern"]),
  fn("read_file", "Read a file's lines with their numbers, at most 400 at a time.", {
    path: { type: "string", description: "From the repository root, such as apps/mobile/src/features/chat/runner.ts." },
    start_line: { type: "integer" },
    end_line: { type: "integer" },
  }, ["path"]),
  fn("list_folder", "List a folder's files and folders. Uses one of the 60 GitHub listings allowed an hour, so prefer search_code.", {
    path: { type: "string", description: "From the repository root; empty for the root." },
  }, ["path"]),
  fn("recent_commits", "The latest commits up to this build, touching a path when given. Uses one GitHub listing.", {
    path: { type: "string" },
  }),
  fn("draft_issue", "Draft the GitHub issue for the person to review and file themselves. Call it once, at the end, only for a bug in Phaseo.", {
    title: { type: "string" },
    body: { type: "string", description: "Markdown: what happened, steps to reproduce, version and phone, root cause with file and line references, suggested fix." },
  }, ["title", "body"]),
];

export function triagePrompt(build: TriageBuild, diagnostics: string) {
  const commit = build.commit ? build.commit.slice(0, 12) : "main";
  const source = build.commit && build.unpublished
    ? `This build's commit (${build.commit}) isn't on GitHub, as it was never pushed, so you read the latest main instead. Code may differ from the build; say so if it matters.`
    : build.commit
    ? `You read the source at exactly commit ${build.commit}, the one this build came from.${build.dirty ? " The build was made with uncommitted changes, so a few lines may differ." : ""}`
    : "This build doesn't carry its commit, so you read the latest main. Code may have changed since the build; say so if it matters.";
  return `You triage bugs in the Phaseo phone app. The person ran into a problem in the app and described it in the next message. You run inside the app on their phone and are reading the answer there, so keep replies short and readable on a small screen.

## This build

- ${build.app} ${build.version}${build.buildNumber != null ? ` (build ${build.buildNumber})` : ""}, commit ${commit}
- ${build.device}, ${build.os}
- ${source}
- Source: https://github.com/${SOURCE_REPOSITORY}. The phone app is apps/mobile (Expo and React Native).

## Recent diagnostics

${diagnostics.trim() ? `The phone's recent slow operations, newest first (names and timings only):\n\n${diagnostics.trim()}` : "None sent."}

## Where things live

- apps/mobile/app: Expo Router routes. (app)/chat is Chat, (app)/code a paired computer's threads, (app)/models, (app)/providers and (app)/account the sections.
- apps/mobile/src/features/<feature>: screens and logic. chat/ (chats on the phone, streaming in runner.ts and stream.ts, summaries, the model sheet), composer/, desktops/ (paired computers), models/, providers/, compare/, account/, notifications/.
- apps/mobile/src/components/ui: primitives; src/components/shell: the sidebar and navigation; src/lib/api: clients for phaseo.app.
- packages/shared/phone-protocol: frames between a phone and a computer.

## How to work

You can only read the code: search_code, read_file, list_folder and recent_commits. You can't run anything, change files or see the phone's screen, logs or data.

1. If the description is too vague to search for, say what you need to know and stop.
2. Search for the words on the screen the person describes, then read the code around them. Follow the code until you can point to the line that causes what they saw.
3. Decide whose problem it is: a bug in Phaseo, or their setup (account, network, the phone's permissions, a provider being down). If it's their setup, tell them how to fix it.
4. For a bug in Phaseo, call draft_issue once: a title; what happened; steps to reproduce; version ${build.version}${build.buildNumber != null ? `, build ${build.buildNumber}` : ""}, commit ${commit}, ${build.device}, ${build.os}; the root cause with file paths and line numbers; and a suggested fix as a short diff or exact description. Leave out anything personal. The person reads the draft and decides whether to file it.
5. Finish with a short summary: the cause, the fix you suggest, how sure you are, and whose problem it is.

Be economical: search before you list folders, and read only the lines you need.`;
}

const clip = (text: string) => (text.length > TOOL_OUTPUT_CHARS ? `${text.slice(0, TOOL_OUTPUT_CHARS)}\n… (cut at ${TOOL_OUTPUT_CHARS} characters; read a narrower range)` : text);

function parseArgs(call: StreamToolCall): Record<string, unknown> {
  try {
    const value = JSON.parse(call.arguments || "{}") as unknown;
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/** What a step says in the progress list. */
export function stepLabel(name: string, args: Record<string, unknown>) {
  const paths = Array.isArray(args.paths) ? args.paths.filter((path): path is string => typeof path === "string") : [];
  switch (name) {
    case "search_code": return { label: `Searched for ${str(args.pattern)}`, detail: (paths.length ? paths : DEFAULT_SEARCH_PATHS).join(", ") };
    case "read_file": return { label: `Read ${str(args.path).split("/").at(-1) ?? ""}`, detail: `${str(args.path)}${num(args.start_line) ? `, from line ${num(args.start_line)}` : ""}` };
    case "list_folder": return { label: `Listed ${str(args.path) || "the repository root"}` };
    case "recent_commits": return { label: "Looked at recent commits", detail: str(args.path) || undefined };
    case "draft_issue": return { label: "Drafted an issue", detail: str(args.title) };
    default: return { label: `Tried ${name}`, detail: "Not a tool it has" };
  }
}

/** Runs one tool call against the source. Problems come back as text for the model to work around. */
export async function runTool(source: SourceReader, name: string, args: Record<string, unknown>) {
  try {
    switch (name) {
      case "search_code": {
        const paths = Array.isArray(args.paths) ? args.paths.filter((path): path is string => typeof path === "string" && Boolean(path.trim())) : [];
        return { output: await source.search(str(args.pattern), paths.length ? paths : undefined), failed: false };
      }
      case "read_file": return { output: await source.read(str(args.path), num(args.start_line), num(args.end_line)), failed: false };
      case "list_folder": return { output: await source.list(str(args.path)), failed: false };
      case "recent_commits": return { output: await source.history(str(args.path) || undefined), failed: false };
      default: return { output: `There is no ${name} tool.`, failed: true };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return { output: error instanceof SourceError ? error.message : `That failed: ${error instanceof Error ? error.message : String(error)}`, failed: true };
  }
}

/** A turn's price, or null when the answer didn't say (then the run's total is unknown, not free). */
export const costOf = (usage: Record<string, unknown> | undefined): number | null => {
  if (!usage) return null;
  if (typeof usage.cost === "number" && Number.isFinite(usage.cost)) return usage.cost;
  // Only a written-out number counts: Number(null) and Number("") would read as a known zero.
  const text = usage.pricing && typeof usage.pricing === "object" ? (usage.pricing as Record<string, unknown>).total_usd_str : undefined;
  return typeof text === "string" && /^\s*\d+(\.\d+)?\s*$/.test(text) ? Number(text) : null;
};

/**
 * The agent loop: the model reads the source with tools until it answers without one. A draft_issue call is kept as
 * the draft (never filed). Each turn is one request through phaseo.app's chat proxy, billed to the workspace.
 */
export async function runTriage(args: {
  report: string;
  build: TriageBuild;
  diagnostics: string;
  model: string;
  /** The model's settings as request fields (reasoning, provider, service tier, output limit), as Chat sends them. */
  requestFields?: Record<string, unknown>;
  workspaceId: string | null;
  source: SourceReader;
  signal: AbortSignal;
  onStep(step: TriageStep): void;
  onText(text: string): void;
  /** The draft as soon as draft_issue makes it, so a later failure or Stop doesn't lose it. */
  onDraft?(draft: IssueDraft): void;
  send?: typeof streamRequestBody;
}): Promise<TriageOutcome> {
  const send = args.send ?? streamRequestBody;
  const messages: ToolMessage[] = [{ role: "system", content: triagePrompt(args.build, args.diagnostics) }, { role: "user", content: args.report }];
  let draft: IssueDraft | null = null;
  let cost = 0;
  let priced = true;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const lastTurn = turn === MAX_TURNS;
    let text = "";
    const result = await send({
      requestBody: { ...args.requestFields, model: args.model, messages, stream: true, stream_options: { include_usage: true }, ...lastTurn ? {} : { tools: TRIAGE_TOOLS, tool_choice: "auto" } },
      workspaceId: args.workspaceId,
      signal: args.signal,
      onText: (delta) => { text += delta; args.onText(text); },
    });
    const turnCost = costOf(result.usage);
    if (turnCost == null) priced = false;
    else cost += turnCost;
    if (!result.toolCalls.length) return { summary: result.text.trim(), draft, costUsd: priced ? cost : null, turns: turn };
    args.onText("");
    messages.push({ role: "assistant", content: result.text || null, tool_calls: result.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments || "{}" } })) });
    for (const call of result.toolCalls) {
      const input = parseArgs(call);
      const label = stepLabel(call.name, input);
      if (call.name === "draft_issue") {
        const title = str(input.title).trim();
        const body = str(input.body).trim();
        if (title && body) {
          draft = { title, body };
          args.onDraft?.(draft);
        }
        args.onStep({ id: call.id, ...label, failed: !(title && body) });
        messages.push({ role: "tool", tool_call_id: call.id, content: title && body ? "Drafted. The person will review it and decide whether to file it. Now finish with your short summary." : "The draft needs a title and a body." });
        continue;
      }
      const { output, failed } = await runTool(args.source, call.name, input);
      args.onStep({ id: call.id, ...label, failed });
      messages.push({ role: "tool", tool_call_id: call.id, content: clip(output) });
    }
    if (turn === MAX_TURNS - 1) messages.push({ role: "user", content: "That's as much reading as there's room for. Finish now with what you found, and call no more tools." });
  }
  return { summary: "", draft, costUsd: priced ? cost : null, turns: MAX_TURNS };
}

/** A new-issue link on GitHub with the draft filled in; the body is shortened to keep the link within what browsers open. */
export function newIssueUrl(draft: IssueDraft, maxBody = 6_000) {
  const body = draft.body.length > maxBody ? `${draft.body.slice(0, maxBody)}\n\n…(shortened; the full draft was copied from the app)` : draft.body;
  return `https://github.com/${SOURCE_REPOSITORY}/issues/new?${new URLSearchParams({ title: draft.title, body }).toString()}`;
}
