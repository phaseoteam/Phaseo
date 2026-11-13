import { ApiError } from "@/lib/api/http";
import { createStore } from "@/lib/store";
import { ChatRequestError } from "@/features/chat/transport";
import { StreamError } from "@/features/chat/stream";
import { requestCapabilities } from "@/features/chat/models";
import { settingsRequestFields, type ModelSettings } from "@/features/chat/settings";
import { runTriage, type TriageBuild, type TriageOutcome, type TriageStep } from "./agent";
import { SourceReader } from "./source";

/** One triage on the phone. It lives outside the screen, so leaving the screen doesn't stop it. */
export type TriageRun =
  | { status: "idle" }
  | { status: "running"; report: string; model: string; steps: TriageStep[]; live: string }
  | { status: "done"; report: string; model: string; steps: TriageStep[]; outcome: TriageOutcome }
  | { status: "stopped" | "failed"; report: string; model: string; steps: TriageStep[]; error: string | null };

export const triageRun = createStore<TriageRun>({ status: "idle" });
let controller: AbortController | null = null;

const problem = (error: unknown) =>
  error instanceof ChatRequestError || error instanceof StreamError || error instanceof ApiError || error instanceof Error ? error.message : "Triage stopped with an unknown problem.";

export async function startTriage(args: { report: string; build: TriageBuild; diagnostics: string; model: string; settings?: ModelSettings; workspaceId: string | null }) {
  controller?.abort();
  const own = new AbortController();
  controller = own;
  const base = { report: args.report, model: args.model };
  let steps: TriageStep[] = [];
  triageRun.set({ status: "running", ...base, steps, live: "" });
  const update = (patch: Partial<Extract<TriageRun, { status: "running" }>>) => {
    if (controller !== own) return;
    triageRun.set((run) => (run.status === "running" ? { ...run, ...patch } : run));
  };
  try {
    // A build from commits that were never pushed reads main, and the agent is told so.
    let build = args.build;
    let source = new SourceReader(build.commit ?? "main", undefined, own.signal);
    if (build.commit && !(await source.exists())) {
      build = { ...build, unpublished: true };
      source = new SourceReader("main", undefined, own.signal);
    }
    // The model's settings from the sheet apply as they do in Chat; its system prompt doesn't (triage brings its own).
    const requestFields = settingsRequestFields(args.settings, await requestCapabilities(args.model, args.settings));
    const outcome = await runTriage({
      ...args,
      requestFields,
      build,
      source,
      signal: own.signal,
      onStep: (step) => { steps = [...steps, step]; update({ steps }); },
      onText: (live) => update({ live }),
    });
    if (controller === own) triageRun.set({ status: "done", ...base, steps, outcome });
  } catch (error) {
    if (controller === own) triageRun.set({ status: own.signal.aborted ? "stopped" : "failed", ...base, steps, error: own.signal.aborted ? null : problem(error) });
  } finally {
    if (controller === own) controller = null;
  }
}

export function stopTriage() {
  controller?.abort();
}

/** Back to the form, after a run has ended. */
export function clearTriage() {
  if (triageRun.get().status !== "running") triageRun.set({ status: "idle" });
}
