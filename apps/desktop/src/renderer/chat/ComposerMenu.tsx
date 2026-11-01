import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { Blocks, Check, ChevronLeft, ChevronRight, File, FileText, Folder, LoaderCircle, Sparkles, Terminal } from "lucide-react";
import type { Harness } from "../../shared/workspace";
import { nativeActionPrefix, nativeActionText, type NativeAction, type NativeActionEntry } from "../../shared/nativeActions";
import { findTrigger, resolveSlash } from "../lib/composerTriggers";
import type { PromptCommand } from "../../shared/promptCommands";
import type { McpPromptEntry } from "../../shared/mcpPrompts";
import type { ProjectFile } from "../../shared/workspace";
import type { PullRequest } from "../../shared/pullRequests";
import { pullRequestStatePresentation } from "../views/pullRequests/presentation";
import { pullRequestMatches } from "../views/pullRequests/composerPullRequests";
import { issueStatePresentation } from "../views/issues/presentation";
import type { GithubReferenceCandidate } from "../../shared/issueView";
import { errorText, useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { ScrollArea } from "../components/ui/scroll-area";
import { mentionToken, parseMentions } from "../lib/mentions";
import { ModelStack } from "./ModelPicker";
import { draftContent, draftText, mentionContent, type ComposerEditor } from "./composerEditor";
import type { ComposerAction } from "./composerActions";

const nativeHarnesses: Harness[] = ["opencode", "pi", "claude", "codex", "phaseo"];
const takesArguments = (template: string) => /\$(ARGUMENTS|\d+)/.test(template);
const matches = (query: string, ...values: (string | undefined)[]) => { const needle = query.toLowerCase(); return values.some(value => value?.toLowerCase().includes(needle)); };
/** Name prefixes first, then names containing the query; descriptions only count once the query is specific. */
function rank<T>(values: T[], query: string, name: (value: T) => string, description: (value: T) => string | undefined) {
	const needle = query.toLowerCase();
	const score = (value: T) => { const label = name(value).toLowerCase(); return label.startsWith(needle) ? 3 : label.includes(needle) ? 2 : needle.length >= 3 && description(value)?.toLowerCase().includes(needle) ? 1 : 0; };
	return values.map(value => ({ value, score: score(value) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).map(entry => entry.value);
}

type Item = { key: string; group: string; label: string; detail?: string; hint?: string; icon: ReactNode; checked?: boolean; more?: boolean; run: () => void | Promise<void> };

/** The `/` or `@` being typed at the caret, with its document range. Chips count as one character. */
function editorTrigger(editor: Editor | null) {
	if (!editor || editor.isDestroyed || !editor.state.selection.empty) return;
	const { $from } = editor.state.selection;
	const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\uFFFC");
	const trigger = findTrigger(before, before.length);
	// Commands only open at the very start of the message.
	if (!trigger || (trigger.kind === "slash" && $from.before() !== 0)) return;
	return { ...trigger, from: $from.start() + trigger.start, to: $from.start() + trigger.end };
}

export function useComposerMenu({ editor: composer, taskId, harness, accountId, projectId, actions = [] }: {
	editor: ComposerEditor;
	/** Built-in things `/` can do here, such as archiving, plan mode or the model's reasoning. */
	actions?: ComposerAction[];
	/** The chat being replied to; a new chat passes its harness, account and project instead. */
	taskId?: string;
	harness?: Harness;
	accountId?: string;
	projectId?: string;
}) {
	const { api, overview, setError } = useWorkspace();
	const editor = composer.editor;
	// The menu follows the editor: every keystroke or caret move re-reads the trigger.
	const [, setVersion] = useState(0);
	useEffect(() => {
		if (!editor) return;
		const bump = () => setVersion(value => value + 1);
		editor.on("transaction", bump); editor.on("focus", bump);
		return () => { editor.off("transaction", bump); editor.off("focus", bump); };
	}, [editor]);
	const [dismissed, setDismissed] = useState<string>();
	const [active, setActive] = useState(0);
	const [commands, setCommands] = useState<PromptCommand[]>([]);
	const [nativeActions, setNativeActions] = useState<NativeActionEntry[]>([]);
	const [prompts, setPrompts] = useState<McpPromptEntry[]>([]);
	const [files, setFiles] = useState<ProjectFile[]>([]);
	const [pulls, setPulls] = useState<{ projectId: string; requests: PullRequest[]; exact?: PullRequest & { state?: string } }>();
	const [pullsLoading, setPullsLoading] = useState(false);
	/** `#` also searches the project's issues (and closed pull requests) on GitHub as the query changes. */
	const [githubSearch, setGithubSearch] = useState<{ projectId: string; results: GithubReferenceCandidate[] }>();
	const [searching, setSearching] = useState(false);
	const [loading, setLoading] = useState(false);
	const [form, setForm] = useState<{ prompt: McpPromptEntry; values: Record<string, string> }>();
	// An action with choices (Reasoning, Permissions…) opens them in place of the list.
	const [submenu, setSubmenu] = useState<ComposerAction>();
	// Native commands and skills only run when picked from the menu; typing their name sends plain text.
	const picked = useRef(new Set<string>());
	const listId = useRef(`composer-menu-${Math.random().toString(36).slice(2)}`).current;

	const trigger = editorTrigger(editor);
	const triggerKey = trigger ? `${trigger.kind}:${trigger.from}` : undefined;
	const open = !!trigger && dismissed !== triggerKey;
	// Escape hides the menu until its trigger text is gone; a later `/` or `@` opens it again.
	useEffect(() => { if (!triggerKey) setDismissed(undefined); }, [triggerKey]);
	const slashOpen = open && trigger?.kind === "slash";
	const native = !!harness && nativeHarnesses.includes(harness);
	const source = `${taskId ?? ""}|${harness ?? ""}|${accountId ?? ""}|${projectId ?? ""}`;

	// Commands load when the slash menu opens, and again on each reopen so new skills and prompts appear.
	useEffect(() => {
		if (!slashOpen || !api) return;
		let current = true; setLoading(true);
		const nativeTarget = taskId ?? (harness ? { harness, accountId, projectId } : undefined);
		void Promise.allSettled([
			api.promptCommands(projectId, { type: "list" }).then(result => { if (current && "commands" in result) setCommands(result.commands); }),
			native && nativeTarget ? api.nativeActions(nativeTarget).then(result => { if (current) setNativeActions(result.actions); }) : Promise.resolve(setNativeActions([])),
			taskId ? api.mcpPrompts(taskId, { type: "list", requestId: crypto.randomUUID() }).then(result => { if (current && "prompts" in result) setPrompts(result.prompts); }) : Promise.resolve(setPrompts([])),
		]).finally(() => { if (current) setLoading(false); });
		return () => { current = false; };
	}, [slashOpen, source]);

	const mentionQuery = open && trigger?.kind === "mention" ? trigger.query : undefined;
	useEffect(() => {
		if (mentionQuery === undefined || !projectId || !api) { setFiles([]); return; }
		let current = true;
		const timer = setTimeout(() => void api.searchFiles(projectId, mentionQuery).then(result => { if (current) setFiles(result); }, () => { if (current) setFiles([]); }), 80);
		return () => { current = false; clearTimeout(timer); };
	}, [mentionQuery, projectId, api]);

	// T3's `#`: the project's open pull requests load when the menu opens, and a number not among them is read on its own.
	const pullOpen = open && trigger?.kind === "pull-request" && Boolean(projectId);
	const pullQuery = pullOpen ? trigger!.query : undefined;
	useEffect(() => {
		if (!pullOpen || !api || !projectId) return;
		let current = true; setPullsLoading(true);
		void api.pullRequests(projectId).then(value => { if (current) setPulls(previous => ({ projectId, requests: value.requests, exact: previous?.projectId === projectId ? previous.exact : undefined })); }, () => { if (current) setPulls({ projectId, requests: [] }); }).finally(() => { if (current) setPullsLoading(false); });
		return () => { current = false; };
	}, [pullOpen, projectId, api]);
	useEffect(() => {
		const number = pullQuery && /^\d+$/.test(pullQuery) ? Number(pullQuery) : undefined;
		if (!number || !api || !projectId || pulls?.requests.some(request => request.number === number) || pulls?.exact?.number === number) return;
		let current = true;
		const timer = setTimeout(() => void api.pullRequest(projectId, number).then(details => { if (current) setPulls(previous => previous && previous.projectId === projectId ? { ...previous, exact: { ...details, state: details.state } } : previous); }, () => undefined), 180);
		return () => { current = false; clearTimeout(timer); };
	}, [pullQuery, projectId, api, pulls]);
	useEffect(() => {
		if (pullQuery === undefined || !api || !projectId) return;
		let current = true; setSearching(true);
		const timer = setTimeout(() => void api.githubReferences(projectId, pullQuery).then(value => { if (current) setGithubSearch({ projectId, results: value.results }); }, () => { if (current) setGithubSearch({ projectId, results: [] }); }).finally(() => { if (current) setSearching(false); }), 200);
		return () => { current = false; clearTimeout(timer); };
	}, [pullQuery, projectId, api]);

	/** Replace the typed trigger with text or chips, keeping the rest of the message; `whole` replaces the message. */
	const replace = (content: string | JSONContent[], whole = false) => {
		if (!editor || !trigger) return;
		if (whole) { editor.chain().setContent(draftContent(content as string), { emitUpdate: true }).focus("end").run(); return; }
		editor.chain().focus().insertContentAt({ from: trigger.from, to: trigger.to }, content).run();
	};
	const insertPrompt = async (prompt: McpPromptEntry, values: Record<string, string>) => {
		if (!api || !taskId) return;
		const preview = await api.mcpPrompts(taskId, { type: "preview", connectionId: prompt.connectionId, name: prompt.name, arguments: values, requestId: crypto.randomUUID() });
		if (!("messages" in preview)) return;
		if (preview.insertionError) throw new Error(preview.insertionError);
		const draft = await api.mcpPromptAttachments(taskId, preview.messages);
		// The prompt's images come along as attachment chips after its text.
		replace([draft.text, ...draft.attachments.map(attachment => mentionToken({ kind: "attachment", ref: attachment.id, label: attachment.name }))].filter(Boolean).join(" "), true); setForm(undefined);
	};
	const guard = (run: () => Promise<void> | void) => async () => { try { await run(); } catch (reason) { setError(errorText(reason)); } };
	/** Actions clear the typed `/name` before they run, so it never lingers in the draft. */
	const runAction = (action: ComposerAction) => {
		if (action.options) { setSubmenu(action); setActive(0); return; }
		if (action.insert !== undefined) { setSubmenu(undefined); replace(action.insert); return; }
		if (editor && trigger) editor.chain().focus().deleteRange({ from: trigger.from, to: trigger.to }).run();
		setSubmenu(undefined);
		if (action.run) void guard(action.run)();
	};
	const actionItem = (action: ComposerAction, group: string): Item => ({ key: `action:${action.id}`, group, label: action.label, detail: action.description, hint: action.hint, icon: action.icon, checked: action.checked, more: !!action.options, run: () => runAction(action) });

	const items = useMemo((): Item[] => {
		if (!open || !trigger) return [];
		const query = trigger.query;
		if (trigger.kind === "slash" && submenu) return (submenu.options ?? []).map(option => actionItem(option, submenu.label));
		// Native commands that share a name with a built-in action (compact, model, rename…) are listed once, as the action.
		const builtIn = new Set(actions.flatMap(action => [action.id, action.label.toLowerCase().split(" ")[0]]));
		if (trigger.kind === "slash") return [
			...rank([...actions].sort((a, b) => a.label.localeCompare(b.label)), query, action => action.label, action => action.description).map(action => actionItem(action, "Actions")),
			...rank(commands, query, command => command.name, command => command.description).map(command => ({
				key: `prompt:${command.scope}:${command.name}`, group: "Saved prompts", label: `/${command.name}`, detail: command.description, hint: command.scope === "project" ? "Project" : undefined, icon: <FileText />,
				run: guard(async () => {
					const preview = await api!.promptCommands(projectId, { type: "preview", scope: command.scope, name: command.name, arguments: "" });
					if (!("template" in preview)) return;
					// Prompts that take arguments stay as `/name ` so the arguments can be typed; the rest expand now.
					if (takesArguments(preview.template)) replace(`/${command.name} `); else replace(preview.text, true);
				}),
			})),
			...rank(nativeActions.filter(action => !action.name.startsWith("__") && !builtIn.has(action.name.toLowerCase())), query, action => nativeActionPrefix(action).slice(1), action => action.description).map(action => ({
				key: `native:${action.kind}:${action.id}`, group: action.kind === "skill" ? "Skills" : "Commands", label: nativeActionPrefix(action), detail: action.description, hint: action.argumentHint, icon: action.kind === "skill" ? <Sparkles /> : <Terminal />,
				run: () => { picked.current.add(nativeActionPrefix(action)); replace(`${nativeActionPrefix(action)} `); },
			})),
			...rank(prompts, query, prompt => prompt.name, prompt => `${prompt.server} ${prompt.description}`).map(prompt => ({
				key: `mcp:${prompt.connectionId}:${prompt.name}`, group: "MCP prompts", label: prompt.name, detail: prompt.description, hint: prompt.server, icon: <Blocks />,
				run: guard(async () => { if (prompt.arguments.length) setForm({ prompt, values: {} }); else await insertPrompt(prompt, {}); }),
			})),
		].slice(0, 60);
		if (trigger.kind === "pull-request") {
			if (!projectId) return [];
			const attached = editor ? parseMentions(draftText(editor.state.doc)).flatMap(segment => typeof segment !== "string" && (segment.kind === "pull-request" || segment.kind === "issue") ? [segment.ref] : []) : [];
			const current = overview.tasks.find(task => task.id === taskId), linked = current?.pullRequests?.map(link => link.number) ?? [];
			const listed = pulls?.projectId === projectId ? pullRequestMatches([...pulls.exact ? [pulls.exact] : [], ...pulls.requests], query, linked).filter(request => !attached.includes(request.url)) : [];
			const pullItems: Item[] = listed.map(request => {
				const state = pullRequestStatePresentation((request as { state?: "OPEN" | "CLOSED" | "MERGED" }).state ?? "OPEN", request.draft);
				return { key: `pull:${request.number}`, group: "Pull requests", label: `#${request.number}`, detail: request.title, icon: <state.Icon className={state.toneClassName} />,
					run: () => replace(mentionContent({ kind: "pull-request", ref: request.url, label: `#${request.number} ${request.title}` })) };
			});
			// Search results add the project's issues, and pull requests the open list does not have (closed or merged ones).
			const searched = githubSearch?.projectId === projectId ? githubSearch.results.filter(result => !attached.includes(result.url) && !listed.some(request => request.number === result.number)) : [];
			const linkedIssues = current?.issues?.map(link => link.number) ?? [];
			const searchedItems = searched.map((result): Item => {
				const presentation = result.kind === "issue" ? issueStatePresentation(result.state === "closed" ? "closed" : "open") : pullRequestStatePresentation(result.state, Boolean(result.draft));
				return { key: `${result.kind}:${result.number}`, group: result.kind === "issue" ? "Issues" : "Pull requests", label: `#${result.number}`, detail: result.title, hint: result.kind === "issue" && linkedIssues.includes(result.number) ? "Linked" : undefined, icon: <presentation.Icon className={presentation.toneClassName} />,
					run: () => replace(mentionContent({ kind: result.kind, ref: result.url, label: `#${result.number} ${result.title}` })) };
			});
			const issueItems = searchedItems.filter(item => item.group === "Issues"), morePulls = searchedItems.filter(item => item.group === "Pull requests");
			// An exact number puts its group first.
			const exact = /^\d+$/.test(query) ? searched.find(result => String(result.number) === query) : undefined;
			return exact?.kind === "issue" ? [...issueItems, ...pullItems, ...morePulls] : [...pullItems, ...morePulls, ...issueItems];
		}
		const references = editor ? parseMentions(draftText(editor.state.doc)).flatMap(segment => typeof segment !== "string" && segment.kind === "chat" ? [segment.ref] : []) : [];
		const chats = overview.tasks.filter(task => !task.archived && task.id !== taskId && !references.includes(task.id) && matches(query, task.title))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, query ? 8 : 5);
		return [
			...chats.map(task => ({ key: `chat:${task.id}`, group: "Chats", label: task.title, icon: <ModelStack models={[task]} size="sm" ringClassName="ring-transparent" />,
				run: () => replace(mentionContent({ kind: "chat", ref: task.id, label: task.title })) })),
			...files.map(file => ({ key: `file:${file.path}`, group: "Files", label: file.name, detail: file.path === file.name ? undefined : file.path, icon: file.directory ? <Folder /> : <File />,
				run: () => replace(mentionContent({ kind: file.directory ? "folder" : "file", ref: file.path, label: file.name })) })),
		];
	}, [open, triggerKey, trigger?.query, commands, nativeActions, actions, submenu, prompts, files, pulls, githubSearch, projectId, overview.tasks, taskId, editor]);

	useEffect(() => { setActive(0); setSubmenu(undefined); }, [triggerKey, trigger?.query]);
	const selected = Math.min(active, Math.max(0, items.length - 1));
	useEffect(() => { document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, listId]);

	/** Runs before the composer's own keys: the menu takes arrows, Enter, Tab and Escape while open. */
	const onKeyDown = (event: KeyboardEvent): boolean => {
		if (!open || form || event.isComposing) return false;
		if (event.key === "Escape") { event.preventDefault(); if (submenu) { setSubmenu(undefined); setActive(0); } else setDismissed(triggerKey); return true; }
		if (!items.length) return false;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length); return true; }
		if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") { event.preventDefault(); void items[selected].run(); return true; }
		return false;
	};

	/** At send time, a typed `/name args` becomes the saved prompt's text or a native command. */
	const prepare = async (text: string): Promise<{ text: string; nativeAction?: NativeAction }> => {
		const resolved = resolveSlash(text, commands, native ? nativeActions.filter(action => picked.current.has(nativeActionPrefix(action))) : []);
		if (resolved?.action) return { text: nativeActionText(resolved.action), nativeAction: resolved.action };
		if (resolved?.command && api) {
			const preview = await api.promptCommands(projectId, { type: "preview", scope: resolved.command.scope, name: resolved.command.name, arguments: resolved.arguments });
			if ("text" in preview) return { text: preview.text };
		}
		return { text };
	};

	const empty = trigger?.kind === "slash" ? (loading ? "" : "No commands match.") : trigger?.kind === "pull-request" ? (!projectId ? "Issues and pull requests are only available in a project." : pullsLoading || searching ? "Searching issues and pull requests…" : "No issues or pull requests match.") : projectId ? "No chats or files match." : "No chats match.";
	let previous = "";
	const menu = open ? <div role="dialog" aria-label={trigger?.kind === "slash" ? "Commands" : trigger?.kind === "pull-request" ? "Mention an issue or pull request" : "Mention a chat or file"} className="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
		{form ? <form className="flex flex-col gap-2 p-3" onSubmit={event => { event.preventDefault(); void guard(() => insertPrompt(form.prompt, form.values))(); }}>
			<p className="text-[13px] font-semibold">{form.prompt.name} <span className="font-normal text-muted-foreground">· {form.prompt.server}</span></p>
			{form.prompt.arguments.map((argument, index) => <label key={argument.name} className="flex flex-col gap-1 text-xs text-muted-foreground">
				<span>{argument.name}{argument.required ? "" : " (optional)"}{argument.description ? ` · ${argument.description}` : ""}</span>
				<input autoFocus={index === 0} required={argument.required} value={form.values[argument.name] ?? ""} onChange={event => setForm({ ...form, values: { ...form.values, [argument.name]: event.target.value } })}
					onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setForm(undefined); composer.focus(); } }}
					className="h-8 rounded-md border border-input bg-input/40 px-2 text-[13px] text-foreground outline-none focus:border-ring" />
			</label>)}
			<div className="flex justify-end gap-1.5">
				<button type="button" onClick={() => { setForm(undefined); composer.focus(); }} className="h-7 rounded-md px-2.5 text-xs font-medium hover:bg-muted">Back</button>
				<button type="submit" className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/85">Insert</button>
			</div>
		</form> : <ScrollArea className="max-h-72" viewportClassName="max-h-72">
			<div id={listId} role="listbox" aria-label={trigger?.kind === "slash" ? "Commands" : trigger?.kind === "pull-request" ? "Issues and pull requests" : "Chats and files"} className="py-1.5 pr-3.5 pl-1.5">
				{items.map((item, index) => {
					const heading = item.group !== previous ? item.group : undefined; previous = item.group;
					return <div key={item.key}>
						{heading && (submenu
							? <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { setSubmenu(undefined); setActive(0); }} className="flex items-center gap-1 px-1 pt-1.5 pb-1 text-xs font-bold text-foreground/70 hover:text-foreground"><ChevronLeft className="size-3.5" />{heading}</button>
							: <p className="px-2 pt-1.5 pb-1 text-xs font-bold text-foreground/70">{heading}</p>)}
						<div id={`${listId}-${index}`} role="option" aria-selected={index === selected} onMouseMove={() => { if (index !== selected) setActive(index); }}
							onMouseDown={event => event.preventDefault()} onClick={() => void item.run()}
							className={cn("flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground", index === selected && "bg-muted")}>
							{item.icon}
							<span className="shrink-0 truncate font-medium">{item.label}</span>
							{item.detail && <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>}
							{item.hint && <span className="ml-auto max-w-40 shrink-0 truncate pl-2 text-[11px] text-muted-foreground">{item.hint}</span>}
							{item.checked && <Check className={cn("size-4 shrink-0 text-foreground/70", !item.hint && "ml-auto")} />}
							{item.more && <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground", !item.hint && !item.checked && "ml-auto")} />}
						</div>
					</div>;
				})}
				{!items.length && (loading ? <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading commands…</p> : <p className="px-2 py-2 text-xs text-muted-foreground">{empty}</p>)}
			</div>
		</ScrollArea>}
	</div> : null;

	return { menu, onKeyDown, prepare, expanded: open && !form && items.length > 0, activeId: open && !form && items.length ? `${listId}-${selected}` : undefined, listId };
}
export type ComposerMenu = ReturnType<typeof useComposerMenu>;

