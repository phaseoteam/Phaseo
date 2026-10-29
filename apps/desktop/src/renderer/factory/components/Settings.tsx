import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Select } from "../../components/Select";
import { Switch } from "../../components/ui/switch";
import { SettingsPageLayout, SettingsRow, SettingsSection, settingsInput } from "../../settings/SettingsLayout";

/** Factory's settings pages, in the desktop settings layout: a page title, then titled groups of rows. */

export function SettingsPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
	return <SettingsPageLayout title={title} description={description}>{children}</SettingsPageLayout>;
}

export function Group({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
	return <SettingsSection title={title} description={description}>{children}</SettingsSection>;
}

export function Row({ title, description, mark, children }: { title: ReactNode; description: ReactNode; mark?: ReactNode; children?: ReactNode }) {
	return <SettingsRow title={title} description={description} icon={mark} control={children} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
	return <Switch aria-label={label} checked={on} onCheckedChange={onChange} />;
}

/** A text input that saves when it loses focus or on Enter. */
export function Field({ value, placeholder, onSave, mono, secret, className }: { value: string; placeholder: string; onSave: (value: string) => void; mono?: boolean; secret?: boolean; className?: string }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return <input type={secret ? "password" : "text"} autoComplete="off" value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onSave(draft.trim())} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} className={cn(settingsInput, "w-72 rounded-md", mono && "font-mono text-xs", className)} />;
}

/** A multi-line field that saves when it loses focus. */
export function TextBox({ value, placeholder, onSave, rows = 6, className }: { value: string; placeholder?: string; onSave: (value: string) => void; rows?: number; className?: string }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return <textarea value={draft} placeholder={placeholder} rows={rows} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onSave(draft)} className={cn("block w-full resize-y rounded-md border border-input bg-background/40 px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20", className)} />;
}

export function Choice<T extends string | number>({ value, options, onChange, label = "Choose" }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label?: string }) {
	return <Select label={label} value={String(value)} options={options.map((option) => ({ value: String(option.value), label: option.label }))} onValueChange={(next) => {
		const picked = options.find((option) => String(option.value) === next);
		if (picked) onChange(picked.value);
	}} />;
}
