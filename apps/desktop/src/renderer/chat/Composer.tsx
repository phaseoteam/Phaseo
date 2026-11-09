import { useEffect, type ReactNode } from "react";
import { EditorContent } from "@tiptap/react";
import { ScrollArea } from "../components/ui/scroll-area";
import { ChevronDown, Square } from "lucide-react";
import { IconSwap } from "../components/IconSwap";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { ComposerActionIcon, type ComposerAction } from "./ComposerActionIcon";
import { cn } from "../lib/utils";
import { chatDragType } from "../lib/mentions";
import type { ComposerMenu } from "./ComposerMenu";
import { draggedChat, type ComposerEditor } from "./composerEditor";
import { dispatchComposerKey, useCommand } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";
import { keyLabel } from "../../shared/keybindings";
import { isSendKey, useSendKey } from "./sendKey";
import { insertCodeBlock } from "./composerCodeBlock";

/** The message box: an editor whose files, chats and attachments sit inline as chips. */
export function Composer({ editor, onSubmit, onStop, disabled, canSend, running, submitAction = "send", onAlternateSubmit, size = "default", chips, tools, model, footer, menu, className, ultrathink, shortcuts = true }: {
	editor: ComposerEditor;
	onSubmit: () => void;
	onStop?: () => void;
	disabled?: boolean;
	canSend: boolean;
	running?: boolean;
	submitAction?: ComposerAction;
	/** The other delivery action while a turn runs; the primary action follows Settings → Chat. */
	onAlternateSubmit?: () => void;
	size?: "default" | "large";
	/** Controls above the text that are not part of the message, such as the models being compared. */
	chips?: ReactNode;
	tools?: ReactNode;
	model?: ReactNode;
	footer?: ReactNode;
	/** The `/` and `@` menu, which sees keys before the composer does. */
	menu?: ComposerMenu;
	className?: string;
	/** The draft types "ultrathink" for a model that takes it: the send button shimmers like the word. */
	ultrathink?: boolean;
	/** false for a second message box beside the chat (a side chat): the composer shortcuts belong to the chat's own box. */
	shortcuts?: boolean;
}) {
	const sendKey = useSendKey();
	const actionLabel = { send: ultrathink ? "Send with Ultrathink" : "Send", queue: "Queue message", steer: "Steer message", save: "Update queued message" }[submitAction];
	const alternateAction = onAlternateSubmit && (submitAction === "queue" ? "steer" : submitAction === "steer" ? "queue" : undefined);
	const sendShortcut = sendKey === "enter" ? "Enter" : keyLabel("mod+enter", isMac());
	// Formatting is by keyboard only: Ctrl+Alt+C for a code block, Ctrl+/ for the Markdown source (App).
	useCommand("composer.codeBlock", () => { if (disabled) return false; return insertCodeBlock(editor); }, shortcuts);
	editor.keys.current = event => {
		if (menu?.onKeyDown(event)) return true;
		// The composer's own shortcuts (history, steer, stash) come before sending and the editor's keys; one that
		// declines (Mod+Enter steers only while a turn runs) leaves the key to them.
		if (shortcuts && !event.isComposing && dispatchComposerKey(event)) return true;
		if (isSendKey(event, sendKey, isMac())) { if (canSend) onSubmit(); return true; }
		return false;
	};
	// The editor is the combobox for the menu; its list is announced through these attributes.
	const dom = editor.editor && !editor.editor.isDestroyed ? editor.editor.view.dom : undefined;
	useEffect(() => {
		if (!dom) return;
		const attributes: Record<string, string | undefined> = { "aria-haspopup": menu ? "listbox" : undefined, "aria-expanded": menu ? String(menu.expanded) : undefined, "aria-controls": menu?.expanded ? menu.listId : undefined, "aria-activedescendant": menu?.activeId, "aria-disabled": disabled ? "true" : undefined };
		for (const [name, value] of Object.entries(attributes)) if (value === undefined) dom.removeAttribute(name); else dom.setAttribute(name, value);
	});
	return <div className={cn("relative w-full", className)}>
		{menu?.menu}
		<form data-focus-region onSubmit={event => { event.preventDefault(); if (canSend) onSubmit(); }}
			onClick={event => { if (event.target === event.currentTarget) editor.focus(); }}
			// Chats dragged from the sidebar can be dropped anywhere on the composer; drops on the text are handled by the editor.
			onDragOver={event => { if (event.dataTransfer.types.includes(chatDragType) && !disabled) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
			onDrop={event => { const chat = draggedChat(event.dataTransfer); if (chat && !disabled) { event.preventDefault(); editor.insert([chat]); } }}
			className="rounded-2xl border border-input bg-card shadow-sm transition-colors focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/15 dark:shadow-black/20">
			{chips && <div className="flex flex-wrap gap-1.5 px-3 pt-3">{chips}</div>}
			<ScrollArea className="max-h-60" viewportClassName="max-h-60"><EditorContent editor={editor.editor} className={cn("composer-editor-host px-4 pt-3.5 pb-1 leading-relaxed", size === "large" ? "min-h-[72px] text-[15px]" : "min-h-11 text-[14px]", disabled && "opacity-60")} /></ScrollArea>
			<div className="flex items-center gap-1 px-2 pt-1 pb-2">
				{tools}
				<div className="ml-auto flex min-w-0 items-center gap-1">
					{model}
					{running && onStop && <button type="button" onClick={onStop} aria-label="Stop" title="Stop the current turn"
						className="ml-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Square aria-hidden className="size-3 fill-current" /></button>}
					<div className="ml-1 flex shrink-0 items-center gap-px">
						<button type="submit" disabled={disabled || !canSend} aria-label={actionLabel}
							title={`${actionLabel}${submitAction === "queue" ? " after the current turn" : submitAction === "steer" ? " into the current turn" : ""} (${sendShortcut})`}
							className={cn("composer-action relative grid size-8 place-items-center overflow-hidden rounded-md bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-25", ultrathink && submitAction !== "save" && "ultrathink-send")}>
							<IconSwap show={submitAction} className="relative">{{ send: <ComposerActionIcon action="send" />, queue: <ComposerActionIcon action="queue" />, steer: <ComposerActionIcon action="steer" />, save: <ComposerActionIcon action="save" /> }}</IconSwap>
						</button>
						{alternateAction && <DropdownMenu>
							<DropdownMenuTrigger render={<button type="button" disabled={disabled || !canSend} aria-label="Message actions" title="Choose how to send" className="grid h-8 w-5 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-25" />}><ChevronDown aria-hidden className="size-3" /></DropdownMenuTrigger>
							<DropdownMenuContent align="end" side="top" className="w-48">
								{(["queue", "steer"] as const).map(action => <DropdownMenuItem key={action} className="composer-action" onClick={action === submitAction ? onSubmit : onAlternateSubmit}><ComposerActionIcon action={action} />{action === "queue" ? "Queue message" : "Steer message"}</DropdownMenuItem>)}
							</DropdownMenuContent>
						</DropdownMenu>}
					</div>
				</div>
			</div>
		</form>
		{footer}
	</div>;
}

export function ComposerChip({ children, onRemove, title }: { children: ReactNode; onRemove?: () => void; title?: string }) {
	return <span title={title} className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md border border-border bg-muted/60 pr-1 pl-2 text-xs text-foreground/85">
		<span className="truncate">{children}</span>
		{onRemove && <button type="button" aria-label="Remove" onClick={onRemove} className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">×</button>}
	</span>;
}

export function ToolButton({ label, onClick, disabled, active, children }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} aria-pressed={active} onClick={onClick}
		className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-4", active && "bg-muted text-foreground")}>{children}</button>;
}
