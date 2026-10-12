import { Combobox } from "./Combobox";
import { useState } from "react";
import { Select } from "./Select";
import type { AgentForm as Form, FormAnswer, FormDraft } from "../../shared/agentForms";
import { collectFormAnswer, fieldActive, formAnswerError } from "../../shared/agentForms";

export function AgentForm({ form, onAnswer }: { form: Form; onAnswer: (answer: FormAnswer | null) => Promise<boolean> }) {
	const [draft, setDraft] = useState<FormDraft>(() => collectFormAnswer(form, {}));
	const [busy, setBusy] = useState(false); const [error, setError] = useState(form.error ?? "");
	const [showHidden, setShowHidden] = useState(false);
	const answer = collectFormAnswer(form, draft);
	const set = (key: string, value: FormAnswer[string] | undefined) => setDraft(current => ({ ...current, [key]: value }));
	const submit = async (value: FormAnswer | null) => {
		const invalid = value === null ? undefined : formAnswerError(form, value);
		if (invalid) { setError(invalid); return; }
		setBusy(true); setError("");
		try { await onAnswer(value); } catch (reason) { setError(reason instanceof Error ? reason.message : "The answer could not be sent."); }
		finally { setBusy(false); }
	};
	return <form className="task-question" onSubmit={event => { event.preventDefault(); void submit(answer); }}>
		<strong>{form.title}</strong>
		{form.fields.some(field => field.type !== "external" && field.hidden) && <button type="button" disabled={busy} onClick={() => setShowHidden(value => !value)}>{showHidden ? "Hide advanced fields" : "Show advanced fields"}</button>}
		{form.fields.filter(field => fieldActive(field, answer) && (field.type === "external" || !field.hidden || showHidden)).map(field => {
			const value = answer[field.key]; const title = field.title ?? field.key;
			return <fieldset key={field.key}><legend>{title}{field.type !== "external" && field.required ? " *" : ""}</legend>{field.description && <p>{field.description}</p>}
				{field.type === "external" ? <><button type="button" disabled={busy} onClick={() => { void window.phaseoDesktop?.workspace.openLink(field.url).catch(reason => setError(reason instanceof Error ? reason.message : "The link could not be opened.")); }}>Open link</button><label className="question-option"><input type="checkbox" checked={value === true} disabled={busy} onChange={event => set(field.key, event.target.checked)} />I’ve completed this step</label></> :
				field.type === "boolean" ? <Select label={title} disabled={busy} value={typeof value === "boolean" ? String(value) : ""} onValueChange={next => set(field.key, next ? next === "true" : undefined)} options={[{ value: "", label: "Choose" }, { value: "true", label: "Yes" }, { value: "false", label: "No" }]} /> :
				field.type === "number" || field.type === "integer" ? <input aria-label={title} type="number" step={field.type === "integer" ? 1 : "any"} min={field.minimum} max={field.maximum} required={field.required} disabled={busy} value={typeof value === "number" ? value : ""} onChange={event => set(field.key, event.target.value === "" ? undefined : Number(event.target.value))} /> :
				field.type === "multiselect" ? <>{field.options.map(option => <label className="question-option" key={option.value}><input type="checkbox" disabled={busy} checked={Array.isArray(value) && value.includes(option.value)} onChange={event => { const selected = Array.isArray(value) ? value : []; set(field.key, event.target.checked ? [...selected, option.value] : selected.filter(item => item !== option.value)); }} /><span>{option.label}<small>{option.description}</small></span></label>)}{field.custom && <textarea aria-label={`${title}: additional choices, one per line`} placeholder="Additional choices, one per line" disabled={busy} value={Array.isArray(value) ? value.filter(item => !field.options.some(option => option.value === item)).join("\n") : ""} onChange={event => set(field.key, [...(Array.isArray(value) ? value.filter(item => field.options.some(option => option.value === item)) : []), ...event.target.value.split("\n").filter(Boolean)])} />}</> :
				field.options && !field.custom ? <Select label={title} disabled={busy} value={String(field.options.findIndex(option => option.value === value))} onValueChange={next => { const index = Number(next); set(field.key, index < 0 ? undefined : field.options?.[index].value); }} options={[{ value: "-1", label: "Choose" }, ...field.options.map((option, index) => ({ value: String(index), label: option.label }))]} /> :
				<>{field.options ? <Combobox label={title} options={field.options} value={typeof value === "string" ? value : ""} onChange={next => set(field.key, next)} required={field.required} disabled={busy} maxLength={field.maxLength} minLength={field.minLength} placeholder={field.placeholder} /> : <input aria-label={title} type={field.format === "email" ? "email" : field.format === "date" ? "date" : "text"} placeholder={field.placeholder} minLength={field.minLength} maxLength={field.maxLength} required={field.required} disabled={busy} value={typeof value === "string" ? value : ""} onChange={event => set(field.key, event.target.value)} autoComplete="off" />}</>}
			</fieldset>;
		})}
		{error && <p className="task-error" role="alert">{error}</p>}
		<div className="request-actions"><button type="submit" className="task-primary" disabled={busy}>{busy ? "Sending…" : "Send answers"}</button><button type="button" disabled={busy} onClick={() => void submit(null)}>Cancel form</button></div>
	</form>;
}
