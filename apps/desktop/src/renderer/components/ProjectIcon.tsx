import { useEffect, useMemo, useRef, useState } from "react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { projectIdentity, settingsProject, validateProjectIcon, type ProjectIcon as Icon, type ProjectIconColor } from "../../shared/projectSettings";
import type { Project } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { SettingsButton, settingsInput } from "../settings/SettingsLayout";
import { segmentedGroup, segmentedItem } from "../views/pullRequests/segmented";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/** The icon colours, written out in full so Tailwind keeps every class. */
export const projectIconColours: { value: ProjectIconColor; label: string; className: string; swatch: string }[] = [
	{ value: "gray", label: "Grey", className: "text-gray-600 dark:text-gray-400", swatch: "bg-gray-500" },
	{ value: "red", label: "Red", className: "text-red-600 dark:text-red-400", swatch: "bg-red-500" },
	{ value: "orange", label: "Orange", className: "text-orange-600 dark:text-orange-400", swatch: "bg-orange-500" },
	{ value: "amber", label: "Amber", className: "text-amber-600 dark:text-amber-400", swatch: "bg-amber-500" },
	{ value: "yellow", label: "Yellow", className: "text-yellow-600 dark:text-yellow-400", swatch: "bg-yellow-500" },
	{ value: "lime", label: "Lime", className: "text-lime-600 dark:text-lime-400", swatch: "bg-lime-500" },
	{ value: "green", label: "Green", className: "text-green-600 dark:text-green-400", swatch: "bg-green-500" },
	{ value: "emerald", label: "Emerald", className: "text-emerald-600 dark:text-emerald-400", swatch: "bg-emerald-500" },
	{ value: "teal", label: "Teal", className: "text-teal-600 dark:text-teal-400", swatch: "bg-teal-500" },
	{ value: "cyan", label: "Cyan", className: "text-cyan-600 dark:text-cyan-400", swatch: "bg-cyan-500" },
	{ value: "sky", label: "Sky", className: "text-sky-600 dark:text-sky-400", swatch: "bg-sky-500" },
	{ value: "blue", label: "Blue", className: "text-blue-600 dark:text-blue-400", swatch: "bg-blue-500" },
	{ value: "indigo", label: "Indigo", className: "text-indigo-600 dark:text-indigo-400", swatch: "bg-indigo-500" },
	{ value: "violet", label: "Violet", className: "text-violet-600 dark:text-violet-400", swatch: "bg-violet-500" },
	{ value: "purple", label: "Purple", className: "text-purple-600 dark:text-purple-400", swatch: "bg-purple-500" },
	{ value: "fuchsia", label: "Fuchsia", className: "text-fuchsia-600 dark:text-fuchsia-400", swatch: "bg-fuchsia-500" },
	{ value: "pink", label: "Pink", className: "text-pink-600 dark:text-pink-400", swatch: "bg-pink-500" },
	{ value: "rose", label: "Rose", className: "text-rose-600 dark:text-rose-400", swatch: "bg-rose-500" },
];
const colourClass = (color: ProjectIconColor) => projectIconColours.find(value => value.value === color)?.className ?? "";

const popularIcons: IconName[] = ["folder-code", "code-xml", "terminal", "globe", "server", "database", "bot", "sparkles", "smartphone", "monitor", "cloud-cog", "package", "book-open", "flask-conical", "shield-check", "rocket", "gamepad-2", "music", "image", "shopping-bag", "git-branch", "workflow", "wrench", "layers"].filter((name): name is IconName => (iconNames as string[]).includes(name));
export const projectEmojis = [["💻", "Computer"], ["🛠️", "Tools"], ["🚀", "Rocket"], ["🤖", "Robot"], ["✨", "Sparkles"], ["⚡", "Lightning"], ["🌐", "Web"], ["📱", "Mobile"], ["🖥️", "Desktop"], ["⌨️", "Keyboard"], ["⚙️", "Gear"], ["🗄️", "Database"], ["☁️", "Cloud"], ["📦", "Package"], ["📚", "Books"], ["🧪", "Test tube"], ["🔒", "Lock"], ["🎮", "Game"], ["🎵", "Music"], ["🎬", "Film"], ["🖼️", "Picture"], ["🛍️", "Shopping"], ["🔥", "Fire"], ["💡", "Idea"], ["🧩", "Puzzle"], ["📊", "Chart"], ["🧠", "Brain"], ["🦄", "Unicorn"], ["🐙", "Octopus"], ["🌱", "Seedling"]] as const;

/** Icon search: popular icons until you type, then up to 60 Lucide icons whose names contain the words. */
export function searchProjectIcons(query: string): string[] {
	const needle = query.trim().toLowerCase().replaceAll(/\s+/g, "-");
	return needle ? (iconNames as string[]).filter(name => name.includes(needle)).slice(0, 60) : popularIcons;
}
/** The first emoji in pasted text, or undefined. */
export function firstEmoji(value: string) {
	const segment = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value.trim())][0]?.segment;
	if (!segment) return;
	const flag = /^\p{Regional_Indicator}{2}$/u.test(segment), keycap = /^[#*0-9]️?⃣$/u.test(segment);
	return /\p{Extended_Pictographic}/u.test(segment) || flag || keycap ? segment : undefined;
}
const label = (name: string) => name.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

/** A monogram tile: the letters on a tint of their colour. */
export function ProjectMonogram({ text, color, className }: { text: string; color: ProjectIconColor; className?: string }) {
	const single = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length === 1;
	return <span aria-hidden className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}>
		<svg viewBox="0 0 16 16" className={cn("size-full overflow-hidden rounded-[25%] font-mono select-none", colourClass(color))} style={{ backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)" }}>
			<text x="8" y="10.8" textAnchor="middle" fill="currentColor" fontSize="8.25" fontWeight="700" textLength={single ? 6 : 12} lengthAdjust="spacingAndGlyphs" textRendering="geometricPrecision">{text}</text>
		</svg>
	</span>;
}

/** An icon as chosen, or the automatic monogram from the name when there is none. */
export function ProjectIconGlyph({ icon, name, className }: { icon?: Icon; name: string; className?: string }) {
	const automatic = projectIdentity(name);
	if (icon?.kind === "emoji") return <span aria-hidden className={cn("inline-flex size-4 shrink-0 items-center justify-center leading-none [container-type:size]", className)}><span className="text-[length:85cqh] leading-none">{icon.emoji}</span></span>;
	if (icon?.kind === "lucide" && (iconNames as string[]).includes(icon.name)) return <span aria-hidden className={cn("inline-flex size-4 shrink-0 items-center justify-center", colourClass(icon.color), className)}>
		<DynamicIcon name={icon.name as IconName} className="size-full" fallback={() => <ProjectMonogram text={automatic.monogram} color={icon.color} className="size-full" />} />
	</span>;
	if (icon?.kind === "monogram") return <ProjectMonogram text={icon.text} color={icon.color} className={className} />;
	return <ProjectMonogram text={automatic.monogram} color={automatic.color} className={className} />;
}

/** A project's icon wherever projects are listed; worktrees show their project's. */
export function ProjectIcon({ project, className }: { project?: Pick<Project, "id" | "name">; className?: string }) {
	const { overview } = useWorkspace();
	const owner = project ? settingsProject(overview.projects, project.id) : undefined;
	return <ProjectIconGlyph icon={owner?.settings?.icon} name={owner?.name ?? project?.name ?? ""} className={className} />;
}

type Mode = Icon["kind"];

/** The Choose project icon dialog: Icons (searchable, with a colour), Emoji, or Monogram. */
export function ProjectIconPickerDialog({ current, projectName, open, onOpenChange, onSelect }: { current?: Icon; projectName: string; open: boolean; onOpenChange: (open: boolean) => void; onSelect: (icon: Icon) => void }) {
	const automatic = projectIdentity(projectName);
	const [mode, setMode] = useState<Mode>("lucide");
	const [iconName, setIconName] = useState("folder-code");
	const [color, setColor] = useState<ProjectIconColor>(automatic.color);
	const [letters, setLetters] = useState(automatic.monogram);
	const [emoji, setEmoji] = useState("💻");
	const [query, setQuery] = useState(""), [customEmoji, setCustomEmoji] = useState("");
	const wasOpen = useRef(false);
	useEffect(() => {
		if (open && !wasOpen.current) {
			setMode(current?.kind ?? "lucide"); setIconName(current?.kind === "lucide" ? current.name : "folder-code");
			setColor(current && current.kind !== "emoji" ? current.color : automatic.color); setLetters(current?.kind === "monogram" ? current.text : automatic.monogram);
			setEmoji(current?.kind === "emoji" ? current.emoji : "💻"); setQuery(""); setCustomEmoji("");
		}
		wasOpen.current = open;
	}, [open, current, automatic.color, automatic.monogram]);
	const icons = useMemo(() => searchProjectIcons(query), [query]);
	const choice: Icon = mode === "monogram" ? { kind: "monogram", text: letters, color } : mode === "lucide" ? { kind: "lucide", name: iconName, color } : { kind: "emoji", emoji };
	let valid: Icon | undefined; try { valid = validateProjectIcon(choice); } catch { valid = undefined; }
	const tile = "flex aspect-square items-center justify-center rounded-md border border-transparent outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="sm:max-w-lg">
			<DialogHeader><DialogTitle>Choose project icon</DialogTitle><DialogDescription>Choose an icon, emoji or monogram.</DialogDescription></DialogHeader>
			<div className="flex min-h-0 flex-col gap-3">
				<ToggleGroup aria-label="Icon type" value={mode} onValueChange={(value: string) => { if (value === "lucide" || value === "emoji" || value === "monogram") setMode(value); }} spacing={0.5} className={cn(segmentedGroup, "self-start")}>
					<ToggleGroupItem value="lucide" className={segmentedItem}>Icons</ToggleGroupItem>
					<ToggleGroupItem value="emoji" className={segmentedItem}>Emoji</ToggleGroupItem>
					<ToggleGroupItem value="monogram" className={segmentedItem}>Monogram</ToggleGroupItem>
				</ToggleGroup>
				{mode !== "emoji" && <div>
					<div className="mb-2 text-xs font-medium text-muted-foreground">Colour</div>
					<div role="group" aria-label="Icon colour" className="flex flex-wrap gap-1.5">{projectIconColours.map(option => <button key={option.value} type="button" aria-label={option.label} aria-pressed={color === option.value} onClick={() => setColor(option.value)}
						className={cn("flex size-6 items-center justify-center rounded-full border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", color === option.value && "border-foreground/64")}><span className={cn("size-4 rounded-full", option.swatch)} /></button>)}</div>
				</div>}
				{mode === "lucide" && <>
					<input type="search" aria-label="Search Lucide icons" placeholder="Search all Lucide icons" value={query} onChange={event => setQuery(event.target.value)} className={settingsInput} />
					<ScrollArea className="max-h-64">
						<div className="grid grid-cols-8 gap-1 p-0.5 sm:grid-cols-10">{icons.map(name => <button key={name} type="button" aria-label={label(name)} aria-pressed={iconName === name} onClick={() => setIconName(name)} className={cn(tile, colourClass(color), iconName === name && "border-border bg-accent")}>
							<DynamicIcon name={name as IconName} className="size-5" />
						</button>)}</div>
					</ScrollArea>
					{!icons.length && <p className="py-8 text-center text-sm text-muted-foreground">No icons found.</p>}
				</>}
				{mode === "monogram" && <div className="flex items-center gap-4 py-2">
					<ProjectMonogram text={valid?.kind === "monogram" ? valid.text : automatic.monogram} color={color} className="size-12" />
					<div className="flex flex-1 flex-col gap-1.5">
						<label htmlFor="project-monogram" className="text-xs font-semibold">Letters</label>
						<input id="project-monogram" value={letters} autoComplete="off" aria-invalid={!valid} aria-describedby="project-monogram-hint" onChange={event => setLetters(event.target.value)} className={settingsInput} />
						<p id="project-monogram-hint" className="text-xs text-muted-foreground">One or two letters or numbers.</p>
					</div>
				</div>}
				{mode === "emoji" && <>
					<ScrollArea className="max-h-64">
						<div className="grid grid-cols-8 gap-1 p-0.5 sm:grid-cols-10">{projectEmojis.map(([value, name]) => <button key={value} type="button" aria-label={name} aria-pressed={emoji === value} onClick={() => setEmoji(value)} className={cn(tile, "text-xl", emoji === value && "border-border bg-accent")}>{value}</button>)}</div>
					</ScrollArea>
					<div>
						<div className="mb-2 text-xs font-medium text-muted-foreground">Or paste any emoji</div>
						<input aria-label="Custom emoji" placeholder="Paste an emoji" value={customEmoji} onChange={event => { setCustomEmoji(event.target.value); const next = firstEmoji(event.target.value); if (next) setEmoji(next); }} className={settingsInput} />
					</div>
				</>}
			</div>
			<DialogFooter>
				<SettingsButton variant="ghost" onClick={() => onOpenChange(false)}>Cancel</SettingsButton>
				<SettingsButton variant="primary" disabled={!valid} onClick={() => { if (!valid) return; onSelect(valid); onOpenChange(false); }}>Save icon</SettingsButton>
			</DialogFooter>
		</DialogContent>
	</Dialog>;
}
