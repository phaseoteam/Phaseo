import { useEffect, useState } from "react";
import { appFontsKey, validAppFonts, type AppFonts } from "../lib/appFonts";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { SettingsButton, SettingsRow, SettingsSection, settingsInput } from "./SettingsLayout";

/** One font field: saved on Enter or leaving it, so a half-typed name never applies. */
function FontField({ label, field, fonts, onSave, placeholder, sample, mono }: { label: string; field: keyof AppFonts; fonts: AppFonts; onSave: (fonts: AppFonts) => string | undefined; placeholder: string; sample: string; mono?: boolean }) {
	const [text, setText] = useState(fonts[field] ?? "");
	const [error, setError] = useState("");
	useEffect(() => { setText(fonts[field] ?? ""); }, [fonts, field]);
	const save = () => { if ((fonts[field] ?? "") !== text.trim()) setError(onSave({ ...fonts, [field]: text.trim() || undefined }) ?? ""); };
	return <SettingsRow title={label} description={<span className={cn("block truncate", mono ? "font-mono" : "font-sans")}>{sample}</span>}
		control={<div className="flex flex-col items-end gap-1">
			<div className="flex items-center gap-1.5">
				<input aria-label={label} value={text} placeholder={placeholder} spellCheck={false} onChange={event => setText(event.target.value)} onBlur={save}
					onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setText(fonts[field] ?? ""); setError(""); } }}
					className={cn(settingsInput, "w-56")} />
				{fonts[field] && <SettingsButton variant="ghost" onClick={() => { setText(""); onSave({ ...fonts, [field]: undefined }); }}>Reset</SettingsButton>}
			</div>
			{error && <p role="alert" className="max-w-72 text-right text-xs text-destructive">{error}</p>}
		</div>} />;
}

/** Font families for the interface and for code, kept on this device; a font that is not installed falls back to the system's. */
export function FontSettings() {
	const [fonts, setFonts] = usePersistedState<AppFonts>(appFontsKey, {});
	const save = (next: AppFonts) => { try { setFonts(validAppFonts(next)); return undefined; } catch (reason) { return reason instanceof Error ? reason.message : "That font name cannot be used."; } };
	return <SettingsSection title="Fonts" description="Any font installed on this computer, by name. Leave a field empty for the app's own font.">
		<FontField label="Interface font" field="interface" fonts={fonts} onSave={save} placeholder="Montserrat" sample="The quick brown fox jumps over the lazy dog" />
		<FontField label="Code font" field="code" fonts={fonts} onSave={save} placeholder="Cascadia Code" sample="const answer = await agent.run(prompt); // 0O 1lI" mono />
	</SettingsSection>;
}
