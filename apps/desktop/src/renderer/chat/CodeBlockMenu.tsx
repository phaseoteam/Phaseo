import { Braces } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { draftContent, type ComposerEditor } from "./composerEditor";

export const codeBlockLanguages = [["ts", "TypeScript"], ["tsx", "TSX"], ["js", "JavaScript"], ["json", "JSON"], ["python", "Python"], ["bash", "Shell"], ["powershell", "PowerShell"], ["sql", "SQL"], ["go", "Go"], ["rust", "Rust"], ["java", "Java"], ["csharp", "C#"], ["cpp", "C++"], ["ruby", "Ruby"], ["php", "PHP"], ["yaml", "YAML"], ["html", "HTML"], ["css", "CSS"], ["diff", "Diff"], ["markdown", "Markdown"], ["text", "Plain text"]] as const;

/** A fenced block in that language around the selected text, or an empty one at the caret. */
export function fencedBlock(selected: string, language: string) {
	const fence = /```/.test(selected) ? "````" : "```";
	return `${fence}${language === "text" ? "" : language}\n${selected}\n${fence}`;
}

/**
 * Wraps the selection in a code block of a chosen language, so pasted code keeps its highlighting when the reply quotes it
 * and the agent reads it as code. The draft stays plain Markdown.
 */
export function CodeBlockMenu({ editor, disabled }: { editor: ComposerEditor; disabled?: boolean }) {
	const insert = (language: string) => {
		const current = editor.editor;
		if (!current || current.isDestroyed) return;
		const { from, to } = current.state.selection;
		const selected = current.state.doc.textBetween(from, to, "\n");
		const lines = draftContent(fencedBlock(selected, language)).content ?? [];
		current.chain().focus().insertContentAt({ from, to }, lines).run();
		// The caret goes to the block's middle line, ready to paste or type.
		if (!selected) { const position = current.state.selection.from; current.commands.setTextSelection(Math.max(1, position - 5)); }
	};
	return <DropdownMenu>
		<DropdownMenuTrigger disabled={disabled} render={<button type="button" aria-label="Insert a code block" title="Code block" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-4" />}><Braces /></DropdownMenuTrigger>
		<DropdownMenuContent side="top" align="start" className="max-h-72 w-44 overflow-y-auto">
			{codeBlockLanguages.map(([id, label]) => <DropdownMenuItem key={id} onClick={() => insert(id)} className="text-xs">{label}</DropdownMenuItem>)}
		</DropdownMenuContent>
	</DropdownMenu>;
}
