import { useEffect, type ReactNode } from "react";
import { EditorContent } from "@tiptap/react";
import { ScrollArea } from "../components/ui/scroll-area";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "../lib/utils";
import { chatDragType } from "../lib/mentions";
import type { ComposerMenu } from "./ComposerMenu";
import { draggedChat, type ComposerEditor } from "./composerEditor";
import { dispatchComposerKey } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";
import { keyLabel } from "../../shared/keybindings";
import { isSendKey, useSendKey } from "./sendKey";

/** The message box: an editor whose files, chats and attachments sit inline as chips. */
export function Composer({ editor, onSubmit, onStop, disabled, canSend, running, size = "default", chips, tools, model, footer, menu, className }: {
	editor: ComposerEditor;
	onSubmit: () => void;
	onStop?: () => void;
	disabled?: boolean;
	canSend: boolean;
	running?: boolean;
	size?: "default" | "large";
	/** Controls above the text that are not part of the message, such as the models being compared. */
	chips?: ReactNode;
	tools?: ReactNode;
	model?: ReactNode;
	footer?: ReactNode;
	/** The `/` and `@` menu, which sees keys before the composer does. */
	menu?: ComposerMenu;
	className?: string;
}) {
	const sendKey = useSendKey();
	editor.keys.current = event => {
		if (menu?.onKeyDown(event)) return true;
		// The composer's own shortcuts (history, steer, stash) come before sending and the editor's keys; one that
		// declines (Mod+Enter steers only while a turn runs) leaves the key to them.
		if (!event.isComposing && dispatchComposerKey(event)) return true;
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
					{running && onStop
						? <button type="button" aria-label="Stop" title="Stop" onClick={onStop} className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85"><Square className="size-3 fill-current" /></button>
						: <button type="submit" aria-label="Send" title={`Send (${sendKey === "enter" ? "Enter" : keyLabel("mod+enter", isMac())})`} disabled={!canSend} className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-25"><ArrowUp className="size-4" strokeWidth={2.5} /></button>}
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
