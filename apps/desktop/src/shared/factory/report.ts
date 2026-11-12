import { parseNoteChecks, parseRemember } from "./notes";
import { ASKS_REPORTER, stageDefinition, stageLabel } from "./stages";
import type { ProofFile, ProofKind, RiskLevel, Run, RunOutcome, RunReport, StageId, StageStatus, WorkItem } from "./types";

/** Reads the report every prompt asks the agent to end with: Summary, Verdict, Proof and an optional Question. */

const KINDS: Record<string, ProofKind> = {
	png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
	webm: "video", mp4: "video", mov: "video",
	txt: "text", log: "text", md: "text", json: "text", diff: "text",
};

export function proofKind(name: string): ProofKind {
	return KINDS[name.split(".").at(-1)?.toLowerCase() ?? ""] ?? "file";
}

const clean = (line: string) => line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").replace(/\*\*/g, "").trim();

/** Report lines that start a field of their own, so a list above them ends there. */
const FIELD = /^\s*\**(summary|verdict|question|proof|ask the reporter|remember|notes check|risk|duplicate of|already fixed by)\**:/i;

/** The bullet lines under a heading such as "Remember:", up to the next field. */
function listAfter(lines: string[], heading: string): string[] {
	const at = lines.findLastIndex((line) => new RegExp(`^\\s*\\**${heading}\\**:`, "i").test(line));
	if (at < 0) return [];
	const entries: string[] = [];
	for (const line of lines.slice(at + 1)) {
		if (FIELD.test(line)) break;
		if (line.trim()) entries.push(clean(line));
	}
	return entries.filter((entry) => !/^none\b/i.test(entry));
}

function riskFrom(text: string | undefined): RunReport["risk"] {
	const level = text?.match(/^(low|medium|high)\b/i)?.[1]?.toLowerCase() as RiskLevel | undefined;
	if (!level || !text) return undefined;
	const why = text.slice(level.length).replace(/^\s*[-—–:,.]\s*/, "").trim();
	return { level, why: why || undefined };
}

/** Pulls the report out of the agent's last message. Files are matched to the proof lines that name them. */
export function parseReport(text: string | undefined, files: Omit<ProofFile, "caption">[] = []): RunReport {
	const lines = (text ?? "").split(/\r?\n/);
	const field = (name: string) => {
		const line = lines.findLast((candidate) => new RegExp(`^\\s*\\**${name}\\**:`, "i").test(candidate));
		return line?.replace(new RegExp(`^\\s*\\**${name}\\**:\\**\\s*`, "i"), "").trim() || undefined;
	};
	const start = lines.findLastIndex((line) => /^\s*\**proof\**:/i.test(line));
	const proof: string[] = [];
	if (start >= 0) {
		const inline = clean(lines[start].replace(/^\s*\**proof\**:\**/i, ""));
		if (inline) proof.push(inline);
		for (const line of lines.slice(start + 1)) {
			if (FIELD.test(line)) break;
			if (line.trim()) proof.push(clean(line));
		}
	}
	const ask = listAfter(lines, "ask the reporter");
	const remember = parseRemember(listAfter(lines, "remember"));
	const noteChecks = parseNoteChecks(listAfter(lines, "notes check"));
	const duplicate = Number(field("duplicate of")?.match(/#?(\d+)/)?.[1]);
	const fixedBy = Number(field("already fixed by")?.match(/#?(\d+)/)?.[1]);
	const captioned: ProofFile[] = files.map((file) => {
		const line = proof.find((entry) => entry.replace(/`/g, "").startsWith(file.name));
		return line ? { ...file, caption: line.replace(/`/g, "").slice(file.name.length).replace(/^\s*[:—–-]\s*/, "").trim() || undefined } : file;
	});
	const named = new Set(files.map((file) => file.name));
	const notes = proof.filter((entry) => !named.has(entry.replace(/`/g, "").split(/\s|:/)[0]) && !/^none\b/i.test(entry));
	return {
		summary: field("summary"),
		verdict: field("verdict")?.replace(/\.$/, ""),
		notes,
		files: captioned,
		question: field("question"),
		ask: ask.length ? ask : undefined,
		risk: riskFrom(field("risk")),
		duplicateOf: duplicate > 0 ? duplicate : undefined,
		fixedBy: fixedBy > 0 ? fixedBy : undefined,
		remember,
		noteChecks,
		text: text?.trim().slice(-8_000) || undefined,
	};
}

/** How many times Factory asks the reporter before leaving it to you. */
export const ASK_ROUNDS = 2;

/** Triage found the report too thin, or Reproduce couldn't make it happen, and the agent listed what it needs from the reporter. */
export function asksReporter(stage: StageId, report: RunReport | undefined): report is RunReport & { ask: string[] } {
	if (!report?.ask?.length || !ASKS_REPORTER.includes(stage)) return false;
	if (stage === "triage") return /^needs more information/i.test(report.verdict ?? "");
	return !verdictPassed(stage, report.verdict);
}

/** The comment that asks the reporter for what's missing: what was tried, then each thing needed. */
export function reporterComment(stage: StageId, report: RunReport & { ask: string[] }, round: number): string {
	const opening = stage === "reproduce"
		? "Thanks for the report. We tried to make this happen and couldn't yet, so we need a little more from you."
		: "Thanks for the report. Before we can work on this we need a little more from you.";
	return [
		opening,
		"",
		...report.ask.map((entry) => `- ${entry}`),
		...(report.summary ? ["", `**What we found so far:** ${report.summary}`] : []),
		"",
		`<sub>Asked by Phaseo Factory${round > 1 ? ` (follow-up ${round - 1})` : ""}. Reply here and we'll take another look.</sub>`,
	].join("\n");
}

export function hasProof(report: RunReport | undefined): boolean {
	return Boolean(report && (report.files.length > 0 || report.notes.length > 0));
}

/** Whether the verdict is the stage's pass word. Missing verdicts count as a pass so older agents still work. */
export function verdictPassed(stage: StageId, verdict: string | undefined): boolean {
	if (!verdict) return true;
	const [pass] = stageDefinition(stage).verdicts;
	return verdict.toLowerCase().startsWith(pass.toLowerCase());
}

/**
 * What a finished run means for its stage. Questions, a missing proof and anything but a pass all
 * stop for a person, so nothing moves on without something to show for it.
 */
export function stageOutcome(stage: StageId, report: RunReport, requireProof: boolean): { status: StageStatus; summary?: string } {
	const summary = report.summary;
	if (report.question) return { status: "needs-you", summary: `Asks: ${report.question}` };
	if (stage === "triage" && report.duplicateOf) return { status: "needs-you", summary: `Looks like a duplicate of #${report.duplicateOf}. ${summary ?? ""}`.trim() };
	if (stage === "fix" && report.fixedBy) return { status: "needs-you", summary: new RegExp(`#${report.fixedBy}\\b`).test(summary ?? "") ? summary : `Pull request #${report.fixedBy} already fixes this. ${summary ?? ""}`.trim() };
	const passed = verdictPassed(stage, report.verdict);
	// Triage is a reading, and a clean review has nothing to show failing.
	const needsProof = stage !== "triage" && !(stage === "review" && passed);
	if (requireProof && needsProof && !hasProof(report)) return { status: "needs-you", summary: `No proof attached. ${summary ?? ""}`.trim() };
	if (!passed) return { status: stage === "verify" ? "failed" : "needs-you", summary: summary ?? report.verdict };
	return { status: "done", summary };
}

/** Why a finished run ended where it did, for counting failures by cause. */
export function runOutcome(run: Pick<Run, "status" | "summary" | "stage">, report: RunReport | undefined, stage: { status: StageStatus; summary?: string }): RunOutcome {
	if (run.status === "cancelled") return { kind: "stopped" };
	if (run.status === "failed") return { kind: "failed", why: run.summary };
	if (stage.status === "done") return { kind: "success" };
	// Spotting that an issue repeats another is Triage doing its job.
	if (run.stage === "triage" && report?.duplicateOf && !report.question) return { kind: "success", why: `Found it repeats #${report.duplicateOf}` };
	// So is Fix spotting that a pull request already fixes the issue, rather than writing a second fix.
	if (run.stage === "fix" && report?.fixedBy && !report.question) return { kind: "success", why: `Found #${report.fixedBy} already fixes it` };
	if (stage.status === "waiting" || report?.question || report?.ask?.length) return { kind: "blocked", why: stage.summary };
	if (report && !hasProof(report) && stage.status === "needs-you" && /^No proof/.test(stage.summary ?? "")) return { kind: "blocked", why: "No proof attached" };
	// Review and Verify did their job when they show what's wrong: it's the fix they checked that counts as flawed.
	if ((run.stage === "review" || run.stage === "verify") && report?.verdict) return { kind: "success", why: `Found problems: ${report.summary ?? report.verdict}` };
	return { kind: "failed", why: stage.summary ?? report?.verdict };
}

export const RISK_LABEL: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

const FILE_WORD: Record<ProofKind, [string, string]> = { image: ["screenshot", "screenshots"], video: ["recording", "recordings"], text: ["log", "logs"], file: ["file", "files"] };

/**
 * Where a run's proof file is on this computer, for files going up with gh --attach. gh swaps the
 * reference for the uploaded link, so screenshots show inline and recordings play.
 */
export type ProofRef = (runId: string, name: string) => string | undefined;

/** Proof as Markdown: attached screenshots inline, attached recordings in a paragraph of their own so they play. */
function proofLines(run: Run, ref?: ProofRef): string[] {
	const report = run.report ?? { notes: [], files: [] };
	const lines = report.notes.map((note) => `- ${note}`);
	for (const file of report.files) {
		const local = ref?.(run.id, file.name);
		lines.push(`- ${file.name}${file.caption ? `: ${file.caption}` : ""}`);
		if (local && file.kind === "image") lines.push("", `  ![${(file.caption ?? file.name).replace(/[[\]]/g, "")}](${local})`, "");
		else if (local && file.kind === "video") lines.push("", local, "");
	}
	return lines;
}

/** Files that stay in Factory: logs, and anything not attached. */
function localOnly(run: Run, ref?: ProofRef): ProofFile[] {
	return (run.report?.files ?? []).filter((file) => !ref?.(run.id, file.name));
}

/** How many files of each kind, for example "2 screenshots and 1 log". */
export function countFiles(files: ProofFile[]): string {
	const parts = (Object.keys(FILE_WORD) as ProofKind[])
		.map((kind) => [kind, files.filter((file) => file.kind === kind).length] as const)
		.filter(([, count]) => count > 0)
		.map(([kind, count]) => `${count} ${FILE_WORD[kind][count === 1 ? 0 : 1]}`);
	return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

/** A run's report as a GitHub comment. Attached files show inline; the rest are named as saved in Factory. */
export function reportMarkdown(run: Run, agentLabel: string, ref?: ProofRef): string {
	const report = run.report ?? { notes: [], files: [] };
	const proof = proofLines(run, ref);
	const local = localOnly(run, ref);
	return [
		`### ${stageLabel(run.stage)}: ${report.verdict ?? (run.status === "succeeded" ? "Done" : "Didn't pass")}`,
		"",
		report.summary ?? run.summary ?? "",
		...(report.risk ? ["", `**${RISK_LABEL[report.risk.level]}**${report.risk.why ? `: ${report.risk.why}` : ""}`] : []),
		...(proof.length ? ["", "**Proof**", ...proof] : []),
		...(local.length ? ["", `_${countFiles(local)} saved in Phaseo Factory._`] : []),
		...(report.text ? ["", "<details><summary>Full report</summary>", "", report.text, "", "</details>"] : []),
		"",
		`<sub>${agentLabel} in Phaseo Factory</sub>`,
	].join("\n");
}

/** The description of a pull request Factory opens from an issue's fix: what changed, then the proof from each stage. */
export function pullRequestBody(issue: WorkItem, runs: Run[], agentLabel: (agentId: string) => string, ref?: ProofRef): string {
	// Only the latest run of each stage: an earlier attempt that didn't work isn't what the pull request does.
	const latest = runs.filter((run, index) => !runs.slice(index + 1).some((later) => later.stage === run.stage));
	const fix = latest.find((run) => run.stage === "fix");
	const sections = latest.filter((run) => run.report).map((run) => {
		const proof = proofLines(run, ref);
		return [`**${stageLabel(run.stage)}** (${agentLabel(run.agentId)}): ${run.report?.summary ?? run.summary ?? ""}`, ...proof].join("\n");
	});
	const files = latest.flatMap((run) => localOnly(run, ref));
	return [
		`Fixes #${issue.number}`,
		"",
		"## What changed",
		"",
		fix?.report?.summary ?? fix?.summary ?? issue.title,
		"",
		"## Proof",
		"",
		sections.join("\n\n") || "_No proof was attached._",
		...(files.length ? ["", `_${countFiles(files)} saved in Phaseo Factory._`] : []),
		"",
		"<sub>Opened by Phaseo Factory.</sub>",
	].join("\n");
}
