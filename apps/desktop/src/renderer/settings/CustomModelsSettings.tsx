import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Harness } from "../../shared/workspace";
import { harnessNames } from "../chat/ModelPicker";
import { HarnessLogo } from "../components/HarnessLogo";
import { Select } from "../components/Select";
import { addCustomModel, customModelsKey, type CustomModel } from "../lib/customModels";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { SettingsButton, SettingsField, SettingsSection, settingsInput } from "./SettingsLayout";

const harnesses = (Object.keys(harnessNames) as Harness[]).filter(harness => harness !== "acp");

/** Model ids the picker lists for an agent beside its own catalog, for models it does not list yet. */
export function CustomModelsSettings() {
	const [list, setList] = usePersistedState<CustomModel[]>(customModelsKey, []);
	const [harness, setHarness] = useState<Harness>("phaseo");
	const [id, setId] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const add = () => {
		const next = addCustomModel(list, { harness, id, name });
		if (typeof next === "string") { setError(next); return; }
		setList(next); setId(""); setName(""); setError("");
	};
	return <SettingsSection title="Custom models" description="Add a model id an agent accepts but does not list yet, such as a new release. It appears in that agent's group in the model picker.">
		<form className="flex flex-col gap-3 px-4 py-3.5" onSubmit={event => { event.preventDefault(); add(); }}>
			<div className="flex flex-wrap items-end gap-3">
				<SettingsField label="Agent"><Select label="Agent" value={harness} onValueChange={value => setHarness(value as Harness)} options={harnesses.map(value => ({ value, label: harnessNames[value] }))} /></SettingsField>
				<div className="min-w-48 flex-1"><SettingsField label="Model id"><input aria-label="Model id" value={id} onChange={event => setId(event.target.value)} spellCheck={false} placeholder={harness === "phaseo" ? "lab/model-name" : "model-name"} className={cn(settingsInput, "font-mono")} /></SettingsField></div>
				<div className="min-w-40 flex-1"><SettingsField label="Name"><input aria-label="Name" value={name} onChange={event => setName(event.target.value)} placeholder="Optional" className={settingsInput} /></SettingsField></div>
				<SettingsButton type="submit" disabled={!id.trim()}><Plus className="size-3.5" />Add</SettingsButton>
			</div>
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
		</form>
		{list.length > 0 && <div className="flex flex-col border-t border-border/60">
			{list.map(entry => <div key={`${entry.harness}:${entry.id}`} data-custom-model={entry.id} className="flex h-10 items-center gap-2.5 border-t border-border/60 px-4 first:border-t-0">
				<span className="flex size-5 shrink-0 items-center justify-center [&_img]:size-4 [&_.harness-logo]:size-4"><HarnessLogo harness={entry.harness} /></span>
				<span className="min-w-0 truncate text-[13px]">{entry.name ?? entry.id}</span>
				{entry.name && <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{entry.id}</span>}
				<span className="ml-auto shrink-0 text-xs text-muted-foreground">{harnessNames[entry.harness]}</span>
				<button type="button" aria-label={`Remove ${entry.name ?? entry.id}`} title="Remove" onClick={() => setList(list.filter(value => value !== entry))}
					className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-3.5" /></button>
			</div>)}
		</div>}
	</SettingsSection>;
}
