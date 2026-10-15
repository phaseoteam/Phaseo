import { useEffect, useRef } from "react";
import { Node, mergeAttributes, type Editor, type JSONContent } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { File as FileIcon, Folder, ImageIcon, MessageSquare, Paperclip } from "lucide-react";
import { chatDragType, mentionToken, parseMentions, type Mention } from "../lib/mentions";

/** The chat a sidebar row carries when dragged, if this drag is one. */
export function draggedChat(data: DataTransfer | null): Mention | undefined {
	if (!data?.types.includes(chatDragType)) return;
	try { const { id, title } = JSON.parse(data.getData(chatDragType)) as { id?: unknown; title?: unknown }; return typeof id === "string" ? { kind: "chat", ref: id, label: typeof title === "string" ? title : "Chat" } : undefined; } catch { return; }
}
import { useWorkspace } from "../app/workspace";
import { InlineChip } from "../components/InlineChip";
import { ModelStack } from "./ModelPicker";

function MentionChip({ node, selected }: NodeViewProps) {
	const { overview } = useWorkspace();
	const { kind, ref, label } = node.attrs as Mention;
	const task = kind === "chat" ? overview.tasks.find(value => value.id === ref) : undefined;
	const icon = kind === "chat" ? (task ? <ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /> : <MessageSquare />) : kind === "folder" ? <Folder /> : kind === "file" ? <FileIcon /> : kind === "image" ? <ImageIcon /> : <Paperclip />;
	const title = kind === "chat" ? "The agent can read this chat" : kind === "file" || kind === "folder" ? ref : label;
	return <NodeViewWrapper as="span" className="composer-chip" data-mention-kind={kind}><InlineChip icon={icon} title={title} selected={selected}>{task?.title ?? label}</InlineChip></NodeViewWrapper>;
}

/** An inline, atomic chip for a mentioned chat or file, or an attached file. */
const MentionNode = Node.create({
	name: "mention",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,
	addAttributes: () => ({ kind: { default: "file" }, ref: { default: "" }, label: { default: "" } }),
	parseHTML: () => [{ tag: "span[data-mention]" }],
	renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes({ "data-mention": "" }, HTMLAttributes)],
	renderText: ({ node }) => mentionToken(node.attrs as Mention),
	addNodeView: () => ReactNodeViewRenderer(MentionChip),
});

/** Draft text, with `@[label](kind:ref)` chip tokens, as editor content: one paragraph per line. */
export function draftContent(text: string): JSONContent {
	return { type: "doc", content: text.split("\n").map(line => ({ type: "paragraph", content: parseMentions(line).filter(segment => segment !== "").map(segment => typeof segment === "string" ? { type: "text", text: segment } : { type: "mention", attrs: segment }) })) };
}
export function draftText(doc: ProseMirrorNode) {
	const lines: string[] = [];
	doc.forEach(paragraph => {
		let line = "";
		paragraph.forEach(node => { line += node.isText ? node.text ?? "" : node.type.name === "mention" ? mentionToken(node.attrs as Mention) : node.type.name === "hardBreak" ? "\n" : ""; });
		lines.push(line);
	});
	return lines.join("\n");
}
export const mentionContent = (mention: Mention): JSONContent[] => [{ type: "mention", attrs: mention }, { type: "text", text: " " }];

export type ComposerEditor = {
	editor: Editor | null;
	/** Keys the composer handles before the editor: the `/` and `@` menu, then Enter to send. */
	keys: { current?: (event: KeyboardEvent) => boolean };
	focus: (position?: "start" | "end") => void;
	/** Inserts chips at the caret, or at the end when the composer is not focused. */
	insert: (mentions: Mention[]) => void;
};

export function useComposerEditor({ value, onChange, placeholder, disabled, onFiles, label = "Message" }: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	disabled?: boolean;
	/** Images pasted or files dropped into the composer. */
	onFiles?: (files: File[]) => void;
	label?: string;
}): ComposerEditor {
	const keys = useRef<(event: KeyboardEvent) => boolean>(undefined);
	const last = useRef(value);
	const latest = useRef({ onChange, onFiles, placeholder });
	latest.current = { onChange, onFiles, placeholder };
	const editor = useEditor({
		extensions: [Document, Paragraph, Text, HardBreak, UndoRedo, MentionNode, Placeholder.configure({ placeholder: () => latest.current.placeholder })],
		content: draftContent(value),
		editable: !disabled,
		editorProps: {
			attributes: { "aria-label": label, "aria-multiline": "true", role: "textbox", spellcheck: "true", class: "composer-editor" },
			handleKeyDown: (_view, event) => keys.current?.(event) ?? false,
			// Pasted text arrives as plain text; images and dropped files become attachments.
			handlePaste: (view, event) => {
				const files = Array.from(event.clipboardData?.files ?? []);
				if (files.length && latest.current.onFiles) { event.preventDefault(); latest.current.onFiles(files); return true; }
				const text = event.clipboardData?.getData("text/plain");
				if (!text) return false;
				const lines = text.replace(/\r\n?/g, "\n").split("\n");
				editorInstance.current?.chain().focus().insertContent(lines.flatMap((line, index): JSONContent[] => [...index ? [{ type: "hardBreak" }] : [], ...line ? [{ type: "text", text: line }] : []])).run();
				void view; return true;
			},
			handleDrop: (view, event) => {
				// A chat dragged from the sidebar goes in where it is dropped.
				const chat = draggedChat(event.dataTransfer);
				if (chat) {
					event.preventDefault(); event.stopPropagation();
					const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
					if (at !== undefined) editorInstance.current?.commands.setTextSelection(at);
					insertRef.current([chat]); return true;
				}
				const files = Array.from(event.dataTransfer?.files ?? []);
				if (!files.length || !latest.current.onFiles) return false;
				event.preventDefault(); latest.current.onFiles(files); return true;
			},
		},
		onUpdate: ({ editor: current }) => { const text = draftText(current.state.doc); last.current = text; latest.current.onChange(text); },
	});
	const editorInstance = useRef<Editor | null>(null);
	editorInstance.current = editor;
	const insertRef = useRef<(mentions: Mention[]) => void>(() => {});

	// Drafts also change from outside: suggestions, clearing after send, switching chats.
	useEffect(() => {
		if (!editor || value === last.current) return;
		last.current = value;
		editor.commands.setContent(draftContent(value), { emitUpdate: false });
		editor.commands.focus("end");
	}, [editor, value]);
	useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
	// Placeholder text is read when the editor redraws; nudge it when the text changes.
	useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("placeholder", placeholder)); }, [editor, placeholder]);

	// Scripts drive the composer like a text field: `value` reads and replaces the draft text.
	useEffect(() => {
		if (!editor) return;
		const dom = editor.view.dom as HTMLElement & { value?: string };
		Object.defineProperty(dom, "value", { configurable: true, get: () => draftText(editor.state.doc), set: (text: string) => { editor.commands.setContent(draftContent(text), { emitUpdate: true }); editor.commands.focus("end"); } });
	}, [editor]);

	// The browser's screenshot and annotate tools hand images and a note to whichever composer is open.
	useEffect(() => {
		if (!editor) return;
		const attach = (event: Event) => {
			const detail = (event as CustomEvent<{ files?: File[]; text?: string; handled?: boolean }>).detail;
			if (!detail || detail.handled || editor.isDestroyed || !editor.isEditable) return;
			if (detail.files?.length) { if (!latest.current.onFiles) return; latest.current.onFiles(detail.files); }
			if (detail.text) {
				const empty = editor.state.doc.textContent.trim() === "";
				editor.chain().focus("end").insertContent([...empty ? [] : [{ type: "hardBreak" }], { type: "text", text: detail.text }]).run();
			}
			detail.handled = true;
		};
		window.addEventListener("phaseo:composer-attach", attach);
		return () => window.removeEventListener("phaseo:composer-attach", attach);
	}, [editor]);

	const insert = (mentions: Mention[]) => {
		if (!editor || !mentions.length) return;
		// Focusing restores the last caret, so chips land where the user was typing.
		const chain = editor.chain().focus();
		// A chip never runs into the word before it, so a file reads as `@path` to the agent.
		const { $from } = editor.state.selection, before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, "￼");
		chain.insertContent([...before && !/\s/.test(before) ? [{ type: "text", text: " " }] : [], ...mentions.flatMap(mentionContent)]).run();
	};
	insertRef.current = insert;
	return { editor, keys, focus: position => { editor?.commands.focus(position ?? "end"); }, insert };
}
