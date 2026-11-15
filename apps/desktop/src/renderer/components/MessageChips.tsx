import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppWindow, CircleCheck, CircleDot, File, Folder, GitBranch, GitCommitHorizontal, Globe, MessageSquare } from "lucide-react";
import type { InlineChipAccent } from "@phaseo/app-kit/ui-recipes";
import { useOptionalWorkspace } from "../app/workspace";
import { PULL_REQUEST_STATE_PRESENTATION } from "../views/pullRequests/presentation";
import { knownModel } from "../chat/ModelPicker";
import { chipCopyText, chipHref, chipLabel, messageChips, type Chip, type FileChip } from "../lib/messageChips";
import { showToast } from "./ui/toast";
import { richLink } from "../lib/richLink";
import { openWebLink, type LinkClick } from "../lib/openLink";
import { GitHubMark } from "./GitHubMark";
import { InlineChip } from "./InlineChip";
import { ModelLogo } from "./ModelLogo";
import { parsePullRequestReference } from "../../shared/pullRequestView";
import { openPullRequestLink } from "../views/pullRequests/openPullRequestLink";
import { PullRequestLinkPreview, useLinkProject } from "../views/pullRequests/PullRequestLinkPreview";
import { useProjectRepository } from "../views/pullRequests/useProjectRepository";

/** Replies set their chips into the text (`embedded`); what people type keeps the composer's chip. */
export const ChipVariantContext = createContext<"token" | "embedded">("token");
const useChipVariant = () => useContext(ChipVariantContext);

/** A GitHub pull request or issue the workspace already knows, with its last-read state, so no chip asks GitHub itself. */
function useLinkedState(kind: "pull" | "issues", repository?: string, number?: number) {
	const workspace = useOptionalWorkspace();
	if (!workspace || !repository || !number) return undefined;
	const same = (link: { repository: string; number: number }) => link.number === number && link.repository.toLowerCase() === repository.toLowerCase();
	for (const task of workspace.overview.tasks) {
		if (kind === "pull") { const snapshot = task.pullRequests?.find(same)?.snapshot; if (snapshot) return { kind, ...snapshot }; }
		else { const snapshot = task.issues?.find(same)?.snapshot; if (snapshot) return { kind, ...snapshot }; }
	}
	return undefined;
}
const pullRequestAccent: Record<keyof typeof PULL_REQUEST_STATE_PRESENTATION, InlineChipAccent> = { open: "open", draft: "draft", closed: "closed", merged: "done" };

/** Opens a project file in the editor chosen in Projects, or the first one installed. */
export async function openProjectFile(projectId: string, file: { filename: string; line?: number; column?: number }) {
	const api = window.phaseoDesktop?.workspace;
	if (!api) return;
	const editors = await api.editors();
	let preferred: unknown;
	try { preferred = JSON.parse(localStorage.getItem("phaseo.desktop.editor") ?? "null"); } catch { /* Fall back to an available editor. */ }
	const editor = editors.find(editor => editor.available && editor.id === preferred) ?? editors.find(editor => editor.available);
	if (!editor) throw new Error("Install an editor and select it in Projects.");
	await api.openProject(projectId, { editor: editor.id, ...file });
}

/** Links open where Settings → Browser says: the in-app browser panel or the system browser; outside the desktop shell they open a new window. */
export function openContextLink(href: string, click?: LinkClick) {
	if (window.phaseoDesktop?.workspace) void openWebLink(href, click).catch(() => undefined);
	else window.open(href, "_blank", "noopener,noreferrer");
}

/** The page's title, from the fetched page, the in-app browser or recent pages. */
function useLinkTitle(href: string) {
	const [pageTitle, setPageTitle] = useState<string>();
	useEffect(() => { let active = true; if (/^https:\/\//i.test(href)) void window.phaseoDesktop?.workspace.linkTitle(href).then(title => { if (active && title) setPageTitle(title); }).catch(() => {}); const unsubscribe = window.phaseoDesktop?.onBrowserState(state => { if (state.url === href && state.title && !state.loading) setPageTitle(state.title); }); try { const pages = JSON.parse(localStorage.getItem("phaseo.desktop.browser.recents") ?? "[]") as { url: string; title: string }[]; setPageTitle(pages.find(page => page.url === href)?.title); } catch { /* Ignore invalid cached page titles. */ } return () => { active = false; unsubscribe?.(); }; }, [href]);
	return pageTitle;
}

/**
 * A GitHub pull request link: hovering shows the pull request, and a
 * click opens it in the pane when it is in the chat's repository and "Open pull requests in Phaseo" is on.
 */
function PullRequestLinkChip({ href, children }: { href: string; children?: ReactNode }) {
	const repository = useProjectRepository(useLinkProject());
	const reference = parsePullRequestReference(href);
	const known = useLinkedState("pull", reference?.repository, reference?.number);
	// A pull request the workspace has read shows its state's glyph and colour; others show the GitHub mark.
	const state = known?.kind === "pull" ? (known.draft && known.state === "open" ? "draft" : known.state) : undefined;
	const presentation = state ? PULL_REQUEST_STATE_PRESENTATION[state] : undefined;
	return <PullRequestLinkPreview url={href}><InlineChip className="message-rich-link" variant={useChipVariant()} accent={state ? pullRequestAccent[state] : undefined} href={href} title={presentation ? `${presentation.label} pull request` : undefined} icon={presentation ? <presentation.Icon /> : <GitHubMark />} onClick={event => openPullRequestLink(event, href, repository)}>{children ?? `PR #${reference?.number}`}{presentation && <Said>{`, ${presentation.label.toLowerCase()} pull request`}</Said>}</InlineChip></PullRequestLinkPreview>;
}

/** A link chip: GitHub PRs and issues read as `PR #12`, other pages by title or host. `children` replaces the label. */
export function LinkChip({ href, children }: { href: string; children?: ReactNode }) {
	if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(href) && typeof window !== "undefined" && window.phaseoDesktop?.workspace) return <PullRequestLinkChip href={href}>{children}</PullRequestLinkChip>;
	return <PageLinkChip href={href}>{children}</PageLinkChip>;
}
function PageLinkChip({ href, children }: { href: string; children?: ReactNode }) {
	const link = richLink(href);
	const pageTitle = useLinkTitle(href);
	// A GitHub issue the workspace has read shows open (green) or closed (violet).
	const issue = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/i.exec(href);
	const known = useLinkedState("issues", issue?.[1], issue ? Number(issue[2]) : undefined);
	const issueState = known?.kind === "issues" ? known.state : undefined;
	const icon = issueState === "open" ? <CircleDot /> : issueState === "closed" ? <CircleCheck /> : link?.github ? <GitHubMark /> : <Globe />;
	return <InlineChip className="message-rich-link" variant={useChipVariant()} accent={issueState === "open" ? "open" : issueState === "closed" ? "done" : undefined} href={href} title={issueState ? `${issueState === "open" ? "Open" : "Closed"} issue · ${pageTitle ?? href}` : pageTitle ?? href} icon={icon} onClick={event => openContextLink(href, event)}>{children ?? link?.label ?? pageTitle ?? link?.fallback ?? href}{issueState && <Said>{`, ${issueState} issue`}</Said>}</InlineChip>;
}

/** A file or folder chip that opens in the editor when the message belongs to a project. */
export function FilePathChip({ file, projectId, children }: { file: FileChip; projectId?: string; children?: ReactNode }) {
	const pending = useRef(false);
	const [busy, setBusy] = useState(false), [error, setError] = useState("");
	const position = file.line ? `:${file.line}${file.column ? `:${file.column}` : ""}` : "";
	async function open() {
		if (!projectId || pending.current) return;
		pending.current = true; setBusy(true); setError("");
		try { await openProjectFile(projectId, { filename: file.kind === "folder" ? file.path.replace(/[\\/]+$/, "") || file.path : file.path, ...(file.line ? { line: file.line } : {}), ...(file.line && file.column ? { column: file.column } : {}) }); }
		catch (reason) { setError(String(reason).replace(/^Error: (?:Error invoking remote method '[^']+': (?:Error: )?)?/, "")); }
		finally { pending.current = false; setBusy(false); }
	}
	return <><InlineChip className={projectId ? "message-file-link" : undefined} variant={useChipVariant()} accent={error ? "error" : undefined} disabled={busy} icon={file.kind === "folder" ? <Folder /> : <File />} title={`${file.path}${position}`} onClick={projectId ? () => void open() : undefined}>{children ?? chipLabel(file)}</InlineChip>
		{busy && <span className="message-link-feedback" role="status">Opening…</span>}{error && <span className="message-link-feedback" role="alert">{error}</span>}</>;
}

/** A chat chip shows the chat's current title and model, and opens the chat. */
export function ChatChip({ id, label }: { id: string; label: string }) {
	const workspace = useOptionalWorkspace();
	const task = workspace?.overview.tasks.find(task => task.id === id);
	const icon = task ? <ModelLogo model={knownModel(task.model) ?? { id: task.model, name: task.model }} harness={task.harness} /> : <MessageSquare />;
	return <InlineChip variant={useChipVariant()} icon={icon} title={task?.title || label} onClick={workspace ? () => workspace.select(id) : undefined}>{task?.title || label || "Chat"}</InlineChip>;
}

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => showToast("success", `${what} copied`), () => showToast("error", `Could not copy the ${what.toLowerCase()}`));
const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[0.88em]">{children}</span>;
const Said = ({ children }: { children: ReactNode }) => <span className="sr-only">{children}</span>;

/** The state of a branch's pull request, when a chat has linked one. */
function useBranchState(name: string) {
	const workspace = useOptionalWorkspace();
	for (const task of workspace?.overview.tasks ?? []) for (const link of task.pullRequests ?? []) if (link.snapshot?.head === name) return link.snapshot.state;
	return undefined;
}

/** A commit or branch: opens on GitHub when the chat's project is a GitHub repository, and is copied otherwise. */
function GitChip({ chip }: { chip: Extract<Chip, { kind: "commit" | "branch" }> }) {
	const variant = useChipVariant();
	const repository = useProjectRepository(useLinkProject());
	const href = chipHref(chip, { repository: repository ?? undefined });
	const merged = useBranchState(chip.kind === "branch" ? chip.name : "") === "merged" && chip.kind === "branch";
	const text = chipCopyText(chip), what = chip.kind === "commit" ? "Commit" : "Branch";
	return <InlineChip variant={variant} accent={merged ? "done" : undefined} icon={chip.kind === "commit" ? <GitCommitHorizontal /> : <GitBranch />}
		title={`${text}${merged ? " · merged" : ""} · ${href ? "open on GitHub" : "click to copy"}`} onClick={event => href ? openContextLink(href, event) : copy(text, what)}>
		{chip.kind === "commit" ? <Mono>{chipLabel(chip)}</Mono> : chip.name}<Said>{`, ${merged ? "merged " : ""}${chip.kind}`}</Said>
	</InlineChip>;
}

// A local server's state, asked of the main process (the page's security policy keeps it off localhost) once in a while per origin.
const serverStates = new Map<string, { at: number; up: Promise<boolean> }>();
function serverUp(origin: string) {
	const known = serverStates.get(origin);
	if (known && Date.now() - known.at < 10_000) return known.up;
	const up = window.phaseoDesktop?.browserProbe(`${origin}/`).catch(() => false) ?? Promise.resolve(false);
	serverStates.set(origin, { at: Date.now(), up });
	return up;
}

/** A local server: opens in the browser panel; green while it answers, grey when it doesn't. */
function LocalServerChip({ href }: { href: string }) {
	const variant = useChipVariant();
	const [up, setUp] = useState<boolean>();
	useEffect(() => {
		let active = true;
		let origin: string | undefined;
		try { origin = new URL(href).origin; } catch { /* Not a URL. */ }
		if (origin && window.phaseoDesktop) void serverUp(origin).then(value => { if (active) setUp(value); });
		return () => { active = false; };
	}, [href]);
	const state = up === undefined ? "" : up ? "Running" : "Not responding";
	return <InlineChip variant={variant} accent={up === undefined ? undefined : up ? "open" : "draft"} href={href} icon={<AppWindow />}
		title={[state, href].filter(Boolean).join(" · ")} onClick={event => openContextLink(href, event)}>
		{chipLabel({ kind: "local", href })}<Said>{`, local server${state ? `, ${state.toLowerCase()}` : ""}`}</Said>
	</InlineChip>;
}

export function MessageChip({ chip, projectId }: { chip: Chip; projectId?: string }) {
	switch (chip.kind) {
		case "chat": return <ChatChip id={chip.id} label={chip.label} />;
		case "link": return <LinkChip href={chip.href} />;
		case "commit": case "branch": return <GitChip chip={chip} />;
		case "local": return <LocalServerChip href={chip.href} />;
		default: return <FilePathChip file={chip} projectId={projectId} />;
	}
}

/** Plain message text with chips for chats, files, links, commits, branches and local servers; the rest keeps its whitespace. */
export function MessageText({ text, projectId }: { text: string; projectId?: string }) {
	const segments = useMemo(() => messageChips(text), [text]);
	return segments.map((segment, index) => typeof segment === "string" ? segment : <MessageChip key={index} chip={segment} projectId={projectId} />);
}
