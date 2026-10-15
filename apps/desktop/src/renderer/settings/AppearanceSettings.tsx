import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, Ellipsis, Monitor, Moon, Pencil, Plus, Sun, Trash2, Upload } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { cn } from "../lib/utils";
import { themeCss, useThemes } from "../lib/appTheme";
import { builtInThemes, importTheme, serializeTheme, shareCode, themeColours, type Theme, type ThemeHalf, type ThemeMode } from "../lib/themes";
import type { ThemePreference } from "../types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { SettingsButton, SettingsField, SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

const fallback: Record<ThemeMode, ThemeHalf> = { light: { canvas: "#ffffff", accent: "#0069a8" }, dark: { canvas: "#1c1c1c", accent: "#3b9fe0" } };

/** A small picture of a theme: its light and dark canvases, sidebars and accents side by side. */
function Swatch({ theme }: { theme: Theme }) {
	const half = (mode: ThemeMode) => { const colours = themeColours(theme[mode] ?? fallback[mode], mode); return <div className="flex flex-1" style={{ background: colours.background }}>
		<div className="w-1/3" style={{ background: colours.sidebar, borderRight: `1px solid ${colours.border}` }} />
		<div className="flex flex-1 flex-col justify-end gap-1 p-1.5"><span className="h-1 w-3/4 rounded-full" style={{ background: colours["muted-foreground"] }} /><span className="h-2 w-1/2 rounded-full" style={{ background: colours.primary }} /></div>
	</div>; };
	return <div className="flex h-14 overflow-hidden rounded-lg border border-border">{half("light")}{half("dark")}</div>;
}

function ColourInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
	return <label className="flex items-center gap-2 text-xs text-muted-foreground">
		<input type="color" aria-label={label} value={hex} onChange={event => onChange(event.target.value)} className="size-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
		<span className="min-w-0 flex-1 truncate">{label}</span>
		<input value={value} onChange={event => onChange(event.target.value)} aria-label={`${label} value`} className={cn(settingsInput, "h-7 w-24 font-mono text-[11.5px]")} />
	</label>;
}

/** Name, then background and accent for light and dark. The draft previews live while editing. */
function ThemeEditor({ initial, onSave, onCancel }: { initial: Theme; onSave: (theme: Theme) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState<Theme>(initial);
	const set = (mode: ThemeMode, field: "canvas" | "accent", value: string) => setDraft(current => ({ ...current, [mode]: { ...(current[mode] ?? fallback[mode]), [field]: value } }));
	// Preview the draft over the active theme until it is saved or cancelled.
	useEffect(() => {
		const style = document.createElement("style"); style.id = "phaseo-colour-theme-preview"; document.head.append(style);
		return () => style.remove();
	}, []);
	useEffect(() => { const style = document.getElementById("phaseo-colour-theme-preview"); if (style) style.textContent = themeCss(draft); }, [draft]);
	return <div className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4">
		<SettingsField label="Name"><input value={draft.name} maxLength={60} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className={settingsInput} /></SettingsField>
		<div className="grid grid-cols-2 gap-6">
			{(["light", "dark"] as const).map(mode => <div key={mode} className="flex flex-col gap-2.5">
				<p className="flex items-center gap-1.5 text-xs font-semibold">{mode === "light" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}{mode === "light" ? "Light" : "Dark"}</p>
				<ColourInput label={`${mode === "light" ? "Light" : "Dark"} background`} value={(draft[mode] ?? fallback[mode]).canvas} onChange={value => set(mode, "canvas", value)} />
				<ColourInput label={`${mode === "light" ? "Light" : "Dark"} accent`} value={(draft[mode] ?? fallback[mode]).accent} onChange={value => set(mode, "accent", value)} />
			</div>)}
		</div>
		<p className="text-xs text-muted-foreground">Other colours follow from these two. The app shows your changes as you make them.</p>
		<div className="flex gap-2">
			<SettingsButton variant="primary" disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim(), id: draft.builtIn ? `${draft.id}-custom` : draft.id, builtIn: undefined, light: draft.light ?? fallback.light, dark: draft.dark ?? fallback.dark })}>Save theme</SettingsButton>
			<SettingsButton variant="ghost" onClick={onCancel}>Cancel</SettingsButton>
		</div>
	</div>;
}

function ImportTheme({ onImport, onCancel }: { onImport: (theme: Theme) => void; onCancel: () => void }) {
	const [text, setText] = useState(""), [error, setError] = useState("");
	const file = useRef<HTMLInputElement>(null);
	const attempt = (value: string) => { try { onImport(importTheme(value)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
	return <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4">
		<SettingsField label="Share code or theme JSON" hint="Phaseo themes, T3 Code themes and VS Code colour themes all work.">
			<textarea aria-label="Theme to import" rows={4} value={text} onChange={event => { setText(event.target.value); setError(""); }} placeholder="phaseo-theme:…" className={cn(settingsInput, "h-auto resize-y py-2 font-mono text-[11.5px]")} />
		</SettingsField>
		{error && <p className="text-xs text-destructive" role="alert">{error}</p>}
		<div className="flex gap-2">
			<SettingsButton variant="primary" disabled={!text.trim()} onClick={() => attempt(text)}>Import</SettingsButton>
			<SettingsButton onClick={() => file.current?.click()}><Upload />Choose file…</SettingsButton>
			<SettingsButton variant="ghost" onClick={onCancel}>Cancel</SettingsButton>
			<input ref={file} type="file" accept=".json,application/json" hidden onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ""; if (chosen) void chosen.text().then(attempt); }} />
		</div>
	</div>;
}

export function AppearanceSettings() {
	const { theme: mode, setTheme } = useWorkspace();
	const { themes, active, choose, save, remove } = useThemes();
	const [editing, setEditing] = useState<Theme>();
	const [importing, setImporting] = useState(false);
	const [notice, setNotice] = useState("");
	const modes: { value: ThemePreference; label: string; icon: ReactNode }[] = [{ value: "system", label: "System", icon: <Monitor /> }, { value: "light", label: "Light", icon: <Sun /> }, { value: "dark", label: "Dark", icon: <Moon /> }];
	const download = (theme: Theme) => {
		const link = document.createElement("a");
		link.href = URL.createObjectURL(new Blob([serializeTheme(theme)], { type: "application/json" }));
		link.download = `${theme.id}.phaseo-theme.json`; link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	};
	const copy = async (theme: Theme) => { try { await navigator.clipboard.writeText(shareCode(theme)); setNotice(`Share code for ${theme.name} copied.`); } catch { setNotice("Couldn't copy to the clipboard."); } };
	const newTheme = (): Theme => ({ version: 1, id: "custom", name: "My theme", light: { ...(active.light ?? fallback.light) }, dark: { ...(active.dark ?? fallback.dark) } });
	return <SettingsPageLayout title="Appearance">
		<SettingsSection title="Mode">
			<SettingsRow title="Light or dark" description="System follows your computer's setting."
				control={<div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
					{modes.map(option => <button key={option.value} type="button" role="radio" aria-checked={mode === option.value} onClick={() => setTheme(option.value)}
						className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors [&_svg]:size-3.5", mode === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.icon}{option.label}</button>)}
				</div>} />
		</SettingsSection>
		<SettingsSection title="Theme" description="Each theme has a light and a dark side, so it works with any mode."
			action={<div className="flex gap-1.5"><SettingsButton variant="ghost" onClick={() => { setImporting(true); setEditing(undefined); }}><Upload />Import</SettingsButton><SettingsButton onClick={() => { setEditing(newTheme()); setImporting(false); }}><Plus />New theme</SettingsButton></div>}>
			<div className="grid grid-cols-3 gap-3 p-4" role="radiogroup" aria-label="Colour theme">
				{themes.map(theme => <div key={theme.id} className={cn("group/theme relative flex flex-col gap-2 rounded-xl border p-2 transition-colors", active.id === theme.id ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-foreground/25")}>
					<button type="button" role="radio" aria-checked={active.id === theme.id} aria-label={theme.name} onClick={() => choose(theme.id)} className="flex flex-col gap-2 text-left">
						<Swatch theme={theme} />
						<span className="flex items-center gap-1.5 px-0.5 text-[13px] font-semibold">{theme.name}{active.id === theme.id && <Check className="size-3.5 text-primary" />}</span>
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger render={<button type="button" aria-label={`${theme.name} options`} className="absolute right-2 bottom-1.5 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 group-hover/theme:opacity-100 hover:bg-muted hover:text-foreground data-popup-open:opacity-100" />}><Ellipsis className="size-4" /></DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuItem onClick={() => { setEditing(theme.builtIn ? { ...theme, name: `${theme.name} copy`, light: theme.light ?? fallback.light, dark: theme.dark ?? fallback.dark } : theme); setImporting(false); }}><Pencil />{theme.builtIn ? "Customise a copy" : "Edit"}</DropdownMenuItem>
							<DropdownMenuItem onClick={() => void copy(theme)}><Copy />Copy share code</DropdownMenuItem>
							<DropdownMenuItem onClick={() => download(theme)}><Download />Export as file</DropdownMenuItem>
							{!theme.builtIn && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => remove(theme.id)}><Trash2 />Delete</DropdownMenuItem></>}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>)}
			</div>
			{editing && <div className="p-4 pt-0"><ThemeEditor key={editing.id} initial={editing} onCancel={() => setEditing(undefined)} onSave={theme => { save(theme); setEditing(undefined); setNotice(`${theme.name} saved.`); }} /></div>}
			{importing && <div className="p-4 pt-0"><ImportTheme onCancel={() => setImporting(false)} onImport={theme => { const saved = save(theme); setImporting(false); setNotice(`${saved.name} imported.`); }} /></div>}
			{notice && <SettingsNote role="status">{notice}</SettingsNote>}
		</SettingsSection>
		<p className="px-0.5 text-xs text-muted-foreground">Share a theme by sending its share code or file; anyone can import it here. The built-in themes are {builtInThemes.map(theme => theme.name).join(", ")}.</p>
	</SettingsPageLayout>;
}
