import type { TraceDiagnostics } from "./diagnostics";
import type { WorkspaceOverview } from "./workspaceOverview";

/** Where the app's own source lives: Triage fetches the running build's commit from here. */
export const triageSourceRepository = "phaseoteam/Phaseo";

/** A triage checkout's project: the build it was fetched for, and where its issues and pull requests go. */
export type TriageProject = {
	version: string;
	commit: string;
	/** false when the build's commit could not be fetched and the checkout is main instead. */
	exact: boolean;
	repository: string;
};

/** What the running app knows about itself; commit and dirty come from the build stamp, so a build without Git has neither. */
export type TriageBuild = {
	version: string;
	commit?: string;
	/** The build was made from a working tree with uncommitted changes. */
	dirty?: boolean;
	builtAt?: string;
	platform: string;
	osRelease: string;
	arch: string;
	electron: string;
	chrome: string;
	node: string;
	packaged: boolean;
};

export type TriagePreparation = {
	workspace: WorkspaceOverview;
	projectId: string;
	build: TriageBuild;
	triage: TriageProject;
	/** The playbook's path in the checkout, written when the chat starts (writeTriagePlaybook). */
	playbook: string;
};

/** An issue the chat's agent drafted with draft_issue; only the person files it. */
export type IssueDraft = {
	repository: string;
	title: string;
	body: string;
	draftedAt: string;
	status: "draft" | "filed" | "discarded";
	number?: number;
	url?: string;
	filedAt?: string;
};

export const maximumIssueTitle = 256;
/** GitHub refuses issue bodies over 65,536 characters. */
export const maximumIssueBody = 65_000;

export function validateIssueDraft(value: unknown): { title: string; body: string } {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
	const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
	const body = typeof input.body === "string" ? input.body.trim() : "";
	if (!title || title.length > maximumIssueTitle) throw new Error(`An issue needs a title of up to ${maximumIssueTitle} characters.`);
	if (!body || body.length > maximumIssueBody) throw new Error(`An issue needs a body of up to ${maximumIssueBody.toLocaleString("en-US")} characters.`);
	return { title, body };
}

/** A playbook file name the main process accepts: always inside the checkout's `.phaseo-triage` folder. */
export const triagePlaybookPattern = /^\.phaseo-triage\/playbook-\d{8}-\d{6}\.md$/;
export function triagePlaybookName(now = new Date()) {
	const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
	return `.phaseo-triage/playbook-${stamp.slice(0, 8)}-${stamp.slice(8)}.md`;
}

/** The message box without the playbook link the triage screen puts first, so what the person typed survives a retry or Cancel. */
export const withoutPlaybookLink = (draft: string) => draft.replace(/^Read @\[[^\]]*\]\(file:\.phaseo-triage[^)]*\) and follow it\.\s*/, "").trimStart();

/** A triage chat's title: the first line of what the person wrote after the playbook link, or a plain name when they wrote nothing. */
export function triageTitle(message: string) {
	const description = message.replace(/^Read @\S+ and follow it\.\s*/, "").split("\n").map(line => line.trim()).find(Boolean) ?? "";
	if (!description) return "Triage a Phaseo bug";
	return `Triage: ${description.length > 70 ? `${description.slice(0, 69).trimEnd()}…` : description}`;
}

/** Log text that may end up in an issue: the home folder becomes ~, and email addresses and `token=…`-style values are hidden. The tracer already hides known token formats. */
export function redactLogText(text: string, home: string) {
	let value = text;
	if (home.length > 3) {
		// Either slash matches; Windows paths also differ in case (C:\Users, c:/users).
		const pattern = home.replace(/[.*+?^${}()|[\]\\/]/g, character => character === "\\" || character === "/" ? "[\\\\/]" : `\\${character}`);
		value = value.replace(new RegExp(pattern, /^[A-Za-z]:/.test(home) ? "gi" : "g"), "~");
	}
	return value
		.replace(/\b(token|access[_-]?token|api[_-]?key|secret|password|passwd)(["']?\s*[=:]\s*)["']?[^\s"',;&]+["']?/gi, "$1$2[hidden]")
		.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]");
}

const line = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 400);

/** The diagnostics section: the latest failures, warnings and slow operations from the app's trace log. */
export function diagnosticsSection(diagnostics: TraceDiagnostics | undefined, home: string) {
	const clean = (value: string) => line(redactLogText(value, home));
	if (!diagnostics || diagnostics.error) return `The trace log could not be read${diagnostics?.error ? `: ${clean(diagnostics.error)}` : ""}.`;
	const failures = diagnostics.latestFailures.slice(0, 10).map(item => `- ${item.endedAt} \`${item.name}\` failed after ${Math.round(item.durationMs)} ms: ${clean(item.cause)}`);
	const logs = diagnostics.latestWarningAndErrorLogs.slice(0, 10).map(item => `- ${item.seenAt} ${item.level} in \`${item.spanName}\`: ${clean(item.message)}`);
	const slow = diagnostics.slowestSpans.slice(0, 5).map(item => `- ${item.endedAt} \`${item.name}\` took ${Math.round(item.durationMs).toLocaleString("en-US")} ms`);
	if (!failures.length && !logs.length && !slow.length) return "The trace log has no failures, warnings or slow operations recorded.";
	return [
		`From \`${diagnostics.traceFilePath}\` (newest first; the person sees the same under Settings → Diagnostics). The home folder shows as ~ and tokens and email addresses are hidden. Each line of that file is one JSON span if you need more.`,
		...failures.length ? ["", "Latest failures:", ...failures] : [],
		...logs.length ? ["", "Latest warnings and errors:", ...logs] : [],
		...slow.length ? ["", "Slowest operations:", ...slow] : [],
	].join("\n");
}

const platformName = (platform: string) => ({ win32: "Windows", darwin: "macOS", linux: "Linux" })[platform] ?? platform;

export type PlaybookInput = {
	build: TriageBuild;
	triage: TriageProject;
	checkout: string;
	userData: string;
	diagnostics: string;
	offerPullRequest: boolean;
};

/** The playbook a triage chat's first message points its agent at. */
export function triagePlaybook({ build, triage, checkout, userData, diagnostics, offerPullRequest }: PlaybookInput) {
	const commit = triage.commit.slice(0, 12);
	const source = !triage.exact
		? `- **This checkout is not the exact build.** The build's commit (${build.commit ?? "unknown: the build carries no commit"}) could not be fetched from ${triageSourceRepository}, so this is main at ${commit}. Code may have changed since the person's build; say so if it matters.`
		: `- This checkout is exactly commit ${commit} of ${triageSourceRepository}, the commit the running app was built from.${build.dirty ? " The build was made from a working tree with uncommitted changes, so a few lines may differ." : ""}`;
	const pullRequest = offerPullRequest
		? `6. Once the fix is proven, ask the person whether they want a pull request, and wait for their answer. Only if they say yes: fetch main and rebase the fix onto it (this checkout is a shallow copy of ${commit}), commit it on a new branch named \`triage/<short-topic>\`, push it to a fork (\`gh repo fork --remote\` when you cannot push to ${triage.repository}), open a draft pull request against ${triage.repository}'s main with \`gh pr create --repo ${triage.repository}\`, and link it with link_pull_request. If they say no, leave the fix uncommitted.`
		: "6. Do not commit, push or open a pull request. Leave the fix as uncommitted changes in this checkout for the person to see.";
	return `# Triage a Phaseo Desktop bug

The person using Phaseo Desktop ran into a problem with the app itself and asked you to find out why. Their description is in the message that pointed you here. If it is missing or vague, ask what they were doing, what they expected and what happened instead before you dig in.

## This build

- Phaseo Desktop ${build.version}${build.commit ? `, built from commit ${build.commit}` : ""}${build.builtAt ? ` on ${build.builtAt}` : ""}${build.packaged ? "" : " (a development build, not a packaged release)"}
- ${platformName(build.platform)} ${build.osRelease} (${build.arch}), Electron ${build.electron}, Chromium ${build.chrome}, Node ${build.node}
- The app's data folder: \`${userData}\`. Read it, never write to it: the running app owns it.
${source}
- This project is that checkout: \`${checkout}\`. The desktop app is \`apps/desktop\`.

## Recent diagnostics

${diagnostics}

## Where things live in apps/desktop

- \`src/main\`: the Electron main process. The workspace runtime and its storage (\`workspaceRuntime.ts\`, \`workspaceStore.ts\`), the agent harnesses (\`phaseo*.ts\`, \`claudeAdapter.ts\`, \`codexAdapter.ts\`, \`cursorAdapter.ts\`, \`openCodeAdapter.ts\`, \`piAdapter.ts\`), Git and GitHub (\`git*.ts\`, \`projectPullRequest*.ts\`, \`projectIssues.ts\`), terminals, the built-in browser, sign-in (\`phaseoLogin.ts\`), and diagnostics (\`diagnostics/\`). \`index.ts\` registers every IPC channel.
- \`src/main/factory\` and \`src/renderer/factory\`: Code ▸ Factory.
- \`src/preload/index.ts\`: the bridge the interface calls as \`window.phaseoDesktop\`.
- \`src/renderer\`: the React interface. \`shell/\` (sidebar, command palette, side panes), \`chat/\` (conversation, composer, model picker), \`settings/\`, \`views/\`, \`panels/\`, and shared primitives in \`components/ui\`.
- \`src/shared\`: types and validation both sides use. \`workspace.ts\` holds Task, Project and WorkspaceCommand.
- \`scripts/\`: Electron smoke tests and \`ui-preview.mjs\`, each on a throwaway profile.
- \`README.md\` and \`docs/\` describe the features. The repository's \`AGENTS.md\` files hold the rules for changing code.

## Reproducing and checking

- Read the code the description points to before running anything.
- Dependencies: \`pnpm install --frozen-lockfile\` at the repository root (Node 22.13 or later; it takes several minutes the first time).
- Checks for the package: \`pnpm --filter @phaseo/desktop typecheck\`, \`pnpm --filter @phaseo/desktop lint\`, and the tests you touch with \`pnpm --filter @phaseo/desktop exec vitest run src/main/<file>.test.ts\`.
- To run the app from this checkout: \`pnpm --filter @phaseo/desktop build\`, then \`electron scripts/ui-preview.mjs --demo\` from \`apps/desktop\`. It uses its own temporary profile and a stand-in gateway, so it never touches the person's data or spends credits. Unset \`ELECTRON_RUN_AS_NODE\` first, and close every Electron window you start.
- Where you can, write a test that fails before the fix and passes after it.

## What to do

1. Find the root cause. Reproduce it if you can. If you cannot, point to the exact code and explain how it produces what the person saw.
2. Fix it in this checkout with the smallest change that makes the right behaviour obvious.
3. Prove the fix: the failing behaviour or test before and the passing one after, with the commands you ran and their output.
4. Decide whose problem it is: a bug in Phaseo, or the person's setup (an account, a missing or outdated tool, the network, permissions, or a third-party service being down). If it is their setup, tell them how to fix it, and stop there.
5. If it is Phaseo's bug, draft an issue for ${triage.repository} with the draft_issue tool: a title, what happened, steps to reproduce, the version (${build.version}, commit ${commit}), the root cause and a suggested fix. Leave out anything personal: names, email addresses, paths under the home folder, tokens and the content of the person's chats. The person reads the draft in the app and decides whether to file it. Never file it yourself: no \`gh issue create\` and no GitHub API calls that create issues. Without the draft_issue tool, put the draft at the end of your reply under "Issue draft" instead.
${pullRequest}

Finish with a short summary: the cause, the fix, the proof, whose problem it is, and whether you drafted an issue.
`;
}
