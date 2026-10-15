import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { File, Folder, Globe, MessageSquare } from "lucide-react";
import { useOptionalWorkspace } from "../app/workspace";
import { knownModel } from "../chat/ModelPicker";
import { chipLabel, messageChips, type Chip, type FileChip } from "../lib/messageChips";
import { richLink } from "../lib/richLink";
import { GitHubMark } from "./GitHubMark";
import { InlineChip } from "./InlineChip";
import { ModelLogo } from "./ModelLogo";

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

/** Links open in the in-app browser panel; outside the desktop shell they open a new window. */
export function openContextLink(href: string) {
	if (window.phaseoDesktop?.workspace) window.dispatchEvent(new CustomEvent("phaseo:open-context-link", { detail: href }));
	else window.open(href, "_blank", "noopener,noreferrer");
}

/** The page's title, from the fetched page, the in-app browser or recent pages. */
function useLinkTitle(href: string) {
	const [pageTitle, setPageTitle] = useState<string>();
	useEffect(() => { let active = true; if (/^https:\/\//i.test(href)) void window.phaseoDesktop?.workspace.linkTitle(href).then(title => { if (active && title) setPageTitle(title); }).catch(() => {}); const unsubscribe = window.phaseoDesktop?.onBrowserState(state => { if (state.url === href && state.title && !state.loading) setPageTitle(state.title); }); try { const pages = JSON.parse(localStorage.getItem("phaseo.desktop.browser.recents") ?? "[]") as { url: string; title: string }[]; setPageTitle(pages.find(page => page.url === href)?.title); } catch { /* Ignore invalid cached page titles. */ } return () => { active = false; unsubscribe?.(); }; }, [href]);
	return pageTitle;
}

/** A link chip: GitHub PRs and issues read as `PR #12`, other pages by title or host. `children` replaces the label. */
export function LinkChip({ href, children }: { href: string; children?: ReactNode }) {
	const link = richLink(href);
	const pageTitle = useLinkTitle(href);
	return <InlineChip href={href} title={pageTitle ?? href} icon={link?.github ? <GitHubMark /> : <Globe />} onClick={() => openContextLink(href)}>{children ?? link?.label ?? pageTitle ?? link?.fallback ?? href}</InlineChip>;
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
	return <><InlineChip icon={file.kind === "folder" ? <Folder /> : <File />} title={`${file.path}${position}`} onClick={projectId ? () => void open() : undefined}>{children ?? chipLabel(file)}</InlineChip>
		{busy && <span className="message-link-feedback" role="status">Opening…</span>}{error && <span className="message-link-feedback" role="alert">{error}</span>}</>;
}

/** A chat chip shows the chat's current title and model, and opens the chat. */
export function ChatChip({ id, label }: { id: string; label: string }) {
	const workspace = useOptionalWorkspace();
	const task = workspace?.overview.tasks.find(task => task.id === id);
	const icon = task ? <ModelLogo model={knownModel(task.model) ?? { id: task.model, name: task.model }} harness={task.harness} /> : <MessageSquare />;
	return <InlineChip icon={icon} title={task?.title || label} onClick={workspace ? () => workspace.select(id) : undefined}>{task?.title || label || "Chat"}</InlineChip>;
}

export function MessageChip({ chip, projectId }: { chip: Chip; projectId?: string }) {
	if (chip.kind === "chat") return <ChatChip id={chip.id} label={chip.label} />;
	if (chip.kind === "link") return <LinkChip href={chip.href} />;
	return <FilePathChip file={chip} projectId={projectId} />;
}

/** Plain message text with chips for chats, files and links; the rest keeps its whitespace. */
export function MessageText({ text, projectId }: { text: string; projectId?: string }) {
	const segments = useMemo(() => messageChips(text), [text]);
	return segments.map((segment, index) => typeof segment === "string" ? segment : <MessageChip key={index} chip={segment} projectId={projectId} />);
}
