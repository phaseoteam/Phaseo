import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { EditorContent } from "@tiptap/react";
import { ArrowUp, Paperclip } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { Tip } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { chatDragType, mentionPlainText, parseMentions, type Mention } from "../lib/mentions";
import type { ComposerMenu } from "./ComposerMenu";
import { draftText, draggedChat, type ComposerEditor } from "./composerEditor";
import { dispatchComposerKey } from "../lib/keybindings";
import { isMac } from "../lib/shortcuts";
import { isSendKey, useSendKey } from "./sendKey";
import { BannerDock } from "./ComposerBanner";
import { ComposerAttachments, draftImages } from "./ComposerAttachments";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

/** Below this width the box rests as one line while it is not in use, and its controls fold into a … menu. */
const restingWidth = 480;
const restingEase = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * The message box. Above it, attached drawers: notices, queued messages, an open question, the stash and the `/` and `@`
 * menus. In it, image thumbnails, the text with its chips, then Attach files on the left and the model, its modes and
 * the send button on the right. Under it, a plain strip for what the chat is linked to.
 */
export function Composer({ editor, onSubmit, canSend, disabled, running, onStop, size = "default", menu, className, shortcuts = true, keys, attach, controls, meter, primary, banners, drawer, overlay, aside, chips, context, files, collapsible = true, placeholder }: {
	editor: ComposerEditor;
	/** `alternate` is a Ctrl/⌘-click on the send button: send into the running turn instead of queueing. */
	onSubmit: (alternate?: boolean) => void;
	canSend: boolean;
	disabled?: boolean;
	running?: boolean;
	onStop?: () => void;
	size?: "default" | "large";
	/** The `/` and `@` menu, which sees keys before the composer does. */
	menu?: ComposerMenu;
	className?: string;
	/** false for a second message box beside the chat (a side chat): the composer shortcuts belong to the chat's own box. */
	shortcuts?: boolean;
	/** Keys for an open drawer (the stash), before the menu's. */
	keys?: (event: KeyboardEvent) => boolean;
	attach?: { onClick: () => void; disabled?: boolean };
	/** The model and its modes, right-aligned before the send button. */
	controls?: ReactNode;
	/** Beside the send button: the context meter. */
	meter?: ReactNode;
	/** The send button and its kin; a plain send and stop when left out. */
	primary?: ReactNode;
	/** Notices about sending from this box, each an attached drawer. */
	banners?: ReactNode;
	/** The drawer that joins the box last: an open question, a plan ready, a queued message being edited. */
	drawer?: ReactNode;
	/** A drawer laid over the conversation like the menu (the stash). */
	overlay?: ReactNode;
	/** The tab beside the drawers (the stash's). */
	aside?: ReactNode;
	/** Above the text, not part of it: the models being compared. */
	chips?: ReactNode;
	/** The strip under the box. */
	context?: ReactNode;
	/** A new chat's pasted images, by the local id their chips carry, for thumbnails. */
	files?: Record<string, File>;
	/** false keeps the box open at any width, as while a drawer above it needs an answer. */
	collapsible?: boolean;
	/** What the resting box shows when there is no text. */
	placeholder?: string;
}) {
	const sendKey = useSendKey();
	editor.keys.current = event => {
		if (keys?.(event)) return true;
		if (menu?.onKeyDown(event)) return true;
		// The composer's own shortcuts (history, steer, stash) come before sending and the editor's keys; one that
		// declines (Mod+Enter steers only while a turn runs) leaves the key to them.
		if (shortcuts && !event.isComposing && dispatchComposerKey(event)) return true;
		if (isSendKey(event, sendKey, isMac())) { if (canSend) onSubmit(false); return true; }
		return false;
	};
	// The editor is the combobox for the menu; its list is announced through these attributes.
	const dom = editor.editor && !editor.editor.isDestroyed ? editor.editor.view.dom : undefined;
	useEffect(() => {
		if (!dom) return;
		const attributes: Record<string, string | undefined> = { "aria-haspopup": menu ? "listbox" : undefined, "aria-expanded": menu ? String(menu.expanded) : undefined, "aria-controls": menu?.expanded ? menu.listId : undefined, "aria-activedescendant": menu?.activeId, "aria-disabled": disabled ? "true" : undefined };
		for (const [name, value] of Object.entries(attributes)) if (value === undefined) dom.removeAttribute(name); else dom.setAttribute(name, value);
	});

	const text = dom && editor.editor ? draftText(editor.editor.state.doc) : "";
	const mentions = parseMentions(text).filter((segment): segment is Mention => typeof segment !== "string");
	const images = draftImages(mentions);

	// Resting: a narrow box that is not in use shows one line, and opens again on a click or focus.
	const shell = useRef<HTMLDivElement>(null), form = useRef<HTMLFormElement>(null), card = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	const [focused, setFocused] = useState(false);
	const [tall, setTall] = useState(false);
	useLayoutEffect(() => {
		const element = shell.current;
		if (!element || !collapsible) return;
		const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < restingWidth));
		observer.observe(element);
		return () => observer.disconnect();
	}, [collapsible]);
	const collapsed = collapsible && narrow && !focused && !tall && !menu?.expanded && !overlay;
	const blurCheck = useRef(0);
	const leave = () => {
		cancelAnimationFrame(blurCheck.current);
		blurCheck.current = requestAnimationFrame(() => {
			const element = form.current;
			// A menu opened from the box (the model picker) keeps it open while it shows.
			if (!element || element.contains(document.activeElement) || element.querySelector("[data-popup-open]")) return;
			const view = dom, line = view ? Number.parseFloat(getComputedStyle(view).lineHeight) || 20 : 20;
			setTall(text.includes("\n") || Boolean(view && view.scrollHeight > line * 1.6));
			setFocused(false);
		});
	};
	useEffect(() => () => cancelAnimationFrame(blurCheck.current), []);
	const expand = () => { setFocused(true); requestAnimationFrame(() => editor.focus("end")); };
	// The box grows and shrinks between resting and open rather than jumping.
	const height = useRef<number>(undefined);
	useLayoutEffect(() => {
		const element = card.current;
		if (!element) return;
		const next = element.getBoundingClientRect().height, previous = height.current;
		height.current = next;
		if (previous === undefined || previous === next || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		element.style.overflow = "hidden";
		element.animate([{ height: `${previous}px` }, { height: `${next}px` }], { duration: 220, easing: restingEase }).finished.catch(() => undefined).finally(() => element.style.removeProperty("overflow"));
	}, [collapsed]);

	// Files and chats dragged over the box light it up; a drop outside the text still lands.
	const [dragOver, setDragOver] = useState(false);
	const draggable = (event: DragEvent) => !disabled && (event.dataTransfer.types.includes("Files") || event.dataTransfer.types.includes(chatDragType));
	const onDrop = (event: DragEvent) => {
		setDragOver(false);
		if (disabled || event.defaultPrevented) return;
		const chat = draggedChat(event.dataTransfer);
		if (chat) { event.preventDefault(); editor.insert([chat]); return; }
		if (editor.addFiles(Array.from(event.dataTransfer.files))) event.preventDefault();
	};

	const defaultPrimary = <ComposerPrimaryActions running={Boolean(running)} hasContent={canSend} canSend={canSend} onSubmit={alternate => onSubmit(alternate)} onStop={onStop} />;
	const popup = menu?.menu ?? overlay;
	return <div ref={shell} data-composer-shell className={cn("@container/composer relative w-full", className)}>
		<form ref={form} data-focus-region data-chat-composer-form onSubmit={event => { event.preventDefault(); if (canSend) onSubmit(false); }}
			onFocusCapture={() => { cancelAnimationFrame(blurCheck.current); setFocused(true); }} onBlurCapture={leave}
			onDragEnter={event => { if (draggable(event)) setDragOver(true); }}
			onDragOver={event => { if (draggable(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOver(true); } }}
			onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }}
			onDrop={onDrop}>
			<BannerDock aside={aside}>{banners}{drawer}</BannerDock>
			<div className="relative">
				{popup && <div data-composer-drawer-layer className="absolute inset-x-[1.375rem] bottom-[calc(100%-1rem-1px)] z-[5] flex flex-col">{popup}</div>}
				<div ref={card} data-chat-composer-surface data-resting={collapsed || undefined}
					className={cn("relative z-10 rounded-md border border-input bg-card shadow-sm transition-colors focus-within:border-ring/60 dark:shadow-black/20", dragOver && "bg-accent/45 ring-1 ring-primary/70 ring-inset")}>
					{collapsed && <div className="flex items-center justify-between gap-2 px-3 py-2">
						<button type="button" aria-label="Open the message box" onPointerDown={event => event.preventDefault()} onClick={expand}
							className={cn("min-w-0 flex-1 truncate bg-transparent p-0 text-left text-sm outline-none", text.trim() ? "text-foreground" : "text-muted-foreground")}>
							{mentionPlainText(text).trim() || placeholder || "Message"}
						</button>
						{images.length > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{images.length === 1 ? "1 image" : `${images.length} images`}</span>}
						{running && onStop && !canSend ? <button type="button" aria-label="Stop" onPointerDown={event => event.preventDefault()} onClick={onStop} className="grid size-8 shrink-0 place-items-center rounded-md bg-destructive/90 text-white hover:bg-destructive"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden><rect x="2" y="2" width="8" height="8" rx="1.5" /></svg></button>
							: <button type="button" aria-label={running ? "Queue message" : "Send"} disabled={!canSend} onPointerDown={event => event.preventDefault()} onClick={() => onSubmit(false)} className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-background hover:opacity-85 disabled:bg-foreground/15 disabled:text-muted-foreground"><ArrowUp className="size-4" strokeWidth={2.5} /></button>}
					</div>}
					<div data-chat-composer-body className={cn("relative px-4 pt-3.5 pb-2", collapsed && "hidden")} onClick={event => { if (event.target === event.currentTarget) editor.focus(); }}>
						{chips && <div className="mb-2 flex flex-wrap gap-1.5">{chips}</div>}
						<ComposerAttachments images={images} files={files} onRemove={editor.remove} />
						<ScrollArea className="max-h-60" viewportClassName="max-h-60"><EditorContent editor={editor.editor} className={cn("composer-editor-host leading-relaxed [&_.composer-editor]:min-h-[inherit]", size === "large" ? "min-h-[72px] text-[15px]" : "min-h-6 text-[14px]", disabled && "opacity-60")} /></ScrollArea>
					</div>
					{!collapsed && <div data-chat-composer-footer className="flex min-w-0 flex-nowrap items-center px-2 pb-2">
						{attach && <div className="me-2"><Tip label="Attach files"><button type="button" aria-label="Attach files" disabled={attach.disabled} onPointerDown={event => event.preventDefault()} onClick={attach.onClick}
							className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"><Paperclip className="size-4 translate-y-px" /></button></Tip></div>}
						<div data-chat-composer-actions className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2">
							<div data-chat-composer-controls className="relative flex min-w-0 flex-1 items-center justify-end gap-0.5">{controls}</div>
							{meter}
							{primary ?? defaultPrimary}
						</div>
					</div>}
				</div>
			</div>
			{context && <div data-slot="composer-context-strip" className="flex w-full min-w-0 items-center gap-2 overflow-x-clip px-2 pt-2 text-muted-foreground empty:hidden">{context}</div>}
		</form>
	</div>;
}

/** A model chip above the text when several are compared. */
export function ComposerChip({ children, onRemove, title }: { children: ReactNode; onRemove?: () => void; title?: string }) {
	return <span title={title} className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md border border-border bg-muted/60 pr-1 pl-2 text-xs text-foreground/85">
		<span className="truncate">{children}</span>
		{onRemove && <button type="button" aria-label="Remove" onClick={onRemove} className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">×</button>}
	</span>;
}
