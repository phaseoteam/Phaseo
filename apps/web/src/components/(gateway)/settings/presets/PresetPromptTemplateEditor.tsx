"use client";

import React, { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	PROMPT_TEMPLATE_ROLES,
	PROMPT_VARIABLE_TYPES,
	compilePromptTemplate,
	renderPromptTemplate,
	resolvePromptVariables,
	type PromptTemplate,
	type PromptTemplateIssue,
	type PromptTemplatePart,
	type PromptTemplateRole,
	type PromptVariableSpec,
	type PromptVariableType,
	type RenderedPromptMessage,
} from "./promptTemplates";
import { PresetTemplateCode, PresetTemplateRun } from "./PresetTemplateRun";

type DraftPart = { key: string; type: "text"; text: string } | { key: string; type: "variable"; name: string };
/** Parts stay in their saved order, so text and image variables can interleave. */
type DraftMessage = { key: string; role: PromptTemplateRole; parts: DraftPart[] };

/** Editor state. Raw strings are kept for inputs whose value is typed per variable. */
export type PromptTemplateDraft = {
	messages: DraftMessage[];
	variables: Record<string, PromptVariableSpec>;
	defaults: Record<string, string>;
	testValues: Record<string, string>;
	tools: string;
	responseFormat: string;
	/** Template fields the editor does not show, such as tool_choice, saved back unchanged. */
	preserved: Record<string, unknown>;
};

let draftKey = 0;
const nextKey = () => `draft-${(draftKey += 1)}`;
const textPart = (text = ""): DraftPart => ({ key: nextKey(), type: "text", text });
const variablePart = (name = ""): DraftPart => ({ key: nextKey(), type: "variable", name });
/** Only user messages take images. */
function textOnly(parts: DraftPart[]): DraftPart[] {
	const text = parts.filter((part) => part.type === "text");
	return text.length ? text : [textPart()];
}

/** Types whose raw input is the value itself; the rest are typed as JSON. */
const TEXT_VALUE_TYPES: PromptVariableType[] = ["string", "enum", "image"];

function isPlainObject(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatJson(value: unknown): string {
	return value === undefined ? "" : JSON.stringify(value, null, 2);
}

export function draftFromTemplate(template: unknown): PromptTemplateDraft {
	const { messages: sourceMessages, variables: sourceVariables, tools, response_format, ...preserved } = isPlainObject(template) ? template : {};
	const messages: DraftMessage[] = Array.isArray(sourceMessages)
		? sourceMessages.map((message: any) => {
			const parts: DraftPart[] = Array.isArray(message?.content)
				? message.content.flatMap((part: any): DraftPart[] => {
					if (part?.type === "text") return [textPart(String(part.text ?? ""))];
					if (part?.type === "variable") return [variablePart(String(part.name ?? ""))];
					return [];
				})
				: [textPart(String(message?.content ?? ""))];
			return {
				key: nextKey(),
				role: PROMPT_TEMPLATE_ROLES.includes(message?.role) ? message.role : "user",
				parts: parts.length ? parts : [textPart()],
			};
		})
		: [];
	const variables: Record<string, PromptVariableSpec> = isPlainObject(sourceVariables) ? { ...sourceVariables } : {};
	const defaults: Record<string, string> = {};
	for (const [name, spec] of Object.entries(variables)) {
		if (spec?.default === undefined) continue;
		defaults[name] = typeof spec.default === "string" && TEXT_VALUE_TYPES.includes(spec.type)
			? spec.default
			: JSON.stringify(spec.default);
	}
	return {
		messages,
		variables,
		defaults,
		testValues: {},
		tools: formatJson(tools),
		responseFormat: formatJson(response_format),
		preserved,
	};
}

/** Parse a raw input into the variable's type; undefined when blank, an error when it does not fit. */
function parseTypedValue(type: PromptVariableType, raw: string): { value?: unknown; error?: true } {
	if (raw === "") return {};
	if (TEXT_VALUE_TYPES.includes(type)) return { value: raw };
	if (type === "number") {
		const value = Number(raw);
		return Number.isFinite(value) ? { value } : { error: true };
	}
	if (type === "boolean") return raw === "true" || raw === "false" ? { value: raw === "true" } : { error: true };
	try {
		return { value: JSON.parse(raw) };
	} catch {
		return { error: true };
	}
}

function parseJsonField(raw: string): { value?: unknown; error?: true } {
	if (!raw.trim()) return {};
	try {
		return { value: JSON.parse(raw) };
	} catch {
		return { error: true };
	}
}

function messagesOnlyTemplate(draft: PromptTemplateDraft): PromptTemplate {
	const messages: PromptTemplate["messages"] = [];
	for (const message of draft.messages) {
		const parts = message.parts.flatMap((part): PromptTemplatePart[] => {
			if (part.type === "text") return part.text ? [{ type: "text", text: part.text }] : [];
			const name = part.name.trim();
			return name ? [{ type: "variable", name }] : [];
		});
		if (!parts.some((part) => part.type === "variable" || part.text.trim())) continue;
		const [only] = parts;
		messages.push({ role: message.role, content: parts.length === 1 && only.type === "text" ? only.text : parts });
	}
	return { messages };
}

export type PromptTemplateBuild = {
	/** The template to save, or null when there are no messages. */
	template: PromptTemplate | null;
	issues: PromptTemplateIssue[];
	/** Every variable the template takes, declared or inferred. */
	variables: Array<{ name: string; spec: PromptVariableSpec; declared: boolean }>;
};

export function buildPromptTemplate(draft: PromptTemplateDraft): PromptTemplateBuild {
	const base = messagesOnlyTemplate(draft);
	if (base.messages.length === 0) return { template: null, issues: [], variables: [] };

	const issues: PromptTemplateIssue[] = [];
	// Keep declarations only for names the messages still use, so renamed
	// variables do not leave stale entries behind.
	const inferred = compilePromptTemplate(base);
	const referenced = inferred.ok ? inferred.value.variables : {};
	const variables: Record<string, PromptVariableSpec> = {};
	for (const name of Object.keys(referenced)) {
		const declared = draft.variables[name];
		if (!declared) continue;
		const spec: PromptVariableSpec = { ...declared };
		delete spec.default;
		// Blank lines are kept while editing so a new value can be typed.
		if (spec.enum) spec.enum = spec.enum.filter((value) => value !== "");
		const parsed = spec.required ? {} : parseTypedValue(spec.type, draft.defaults[name] ?? "");
		if (parsed.error) {
			issues.push({ path: ["prompt", "variables", name, "default"], keyword: "template_variable_spec", message: `Default for "${name}" is not a valid ${spec.type}` });
		} else if (parsed.value !== undefined) {
			spec.default = parsed.value;
		}
		variables[name] = spec;
	}

	const template: PromptTemplate = { ...draft.preserved, ...base, ...(Object.keys(variables).length ? { variables } : {}) };
	const tools = parseJsonField(draft.tools);
	if (tools.error) issues.push({ path: ["prompt", "tools"], keyword: "template_invalid", message: "Tools is not valid JSON" });
	else if (tools.value !== undefined) template.tools = tools.value as unknown[];
	const responseFormat = parseJsonField(draft.responseFormat);
	if (responseFormat.error) issues.push({ path: ["prompt", "response_format"], keyword: "template_invalid", message: "Response format is not valid JSON" });
	else if (responseFormat.value !== undefined) template.response_format = responseFormat.value;

	const compiled = compilePromptTemplate(template);
	if (compiled.ok === false) issues.push(...compiled.issues);
	const resolved = compiled.ok ? compiled.value.variables : { ...referenced, ...variables };
	return {
		template,
		issues,
		variables: Object.entries(resolved).map(([name, spec]) => ({ name, spec, declared: Boolean(variables[name]) })),
	};
}

export function renderPromptPreview(build: PromptTemplateBuild, testValues: Record<string, string>):
	| { ok: true; messages: RenderedPromptMessage[]; values: Record<string, unknown> }
	| { ok: false; issues: PromptTemplateIssue[] } {
	if (!build.template || build.issues.length) return { ok: false, issues: build.issues };
	const compiled = compilePromptTemplate(build.template);
	if (compiled.ok === false) return { ok: false, issues: compiled.issues };
	const values: Record<string, unknown> = {};
	const issues: PromptTemplateIssue[] = [];
	for (const { name, spec } of build.variables) {
		const parsed = parseTypedValue(spec.type, testValues[name] ?? "");
		if (parsed.error) issues.push({ path: ["prompt", "variables", name], keyword: "template_variable_type", message: `"${name}" is not a valid ${spec.type}` });
		else if (parsed.value !== undefined) values[name] = parsed.value;
	}
	if (issues.length) return { ok: false, issues };
	const resolved = resolvePromptVariables(compiled.value, values);
	if (resolved.ok === false) return { ok: false, issues: resolved.issues };
	const rendered = renderPromptTemplate(compiled.value, resolved.value);
	if (rendered.ok === false) return { ok: false, issues: rendered.issues };
	return { ok: true, messages: rendered.value, values };
}

function IssueList({ issues }: { issues: PromptTemplateIssue[] }) {
	return (
		<ul className="space-y-1 text-sm text-destructive">
			{issues.map((issue, index) => (
				<li key={`${issue.path.join(".")}-${index}`}>{issue.message}</li>
			))}
		</ul>
	);
}

const SYNTAX_EXAMPLES = [
	["{{customer_name}}", "syntaxInsert"],
	["{{#items}}…{{/items}}", "syntaxSection"],
	["{{^items}}…{{/items}}", "syntaxInverted"],
	["{{! note }}", "syntaxComment"],
	["\\{{", "syntaxLiteral"],
] as const;

export function PresetPromptTemplateEditor({
	draft,
	onChange,
	presetReference,
	savedReference = null,
	hasUnsavedChanges = false,
}: {
	draft: PromptTemplateDraft;
	onChange: (next: PromptTemplateDraft) => void;
	presetReference: string;
	/** How requests reach the saved preset; null until it is saved. */
	savedReference?: string | null;
	/** True when the template differs from the saved one, which is what runs. */
	hasUnsavedChanges?: boolean;
}) {
	const t = useTranslations("SettingsUI");
	const build = useMemo(() => buildPromptTemplate(draft), [draft]);
	const preview = useMemo(() => renderPromptPreview(build, draft.testValues), [build, draft.testValues]);
	const tools = parseJsonField(draft.tools);
	const responseFormat = parseJsonField(draft.responseFormat);

	const updateMessage = (key: string, patch: Partial<DraftMessage>) =>
		onChange({ ...draft, messages: draft.messages.map((message) => (message.key === key ? { ...message, ...patch } : message)) });
	const updatePart = (message: DraftMessage, partKey: string, patch: { text: string } | { name: string }) =>
		updateMessage(message.key, { parts: message.parts.map((part) => (part.key === partKey ? ({ ...part, ...patch } as DraftPart) : part)) });
	const updateVariable = (name: string, current: PromptVariableSpec, patch: Partial<PromptVariableSpec>) => {
		const next: PromptVariableSpec = { ...current, ...patch };
		if (next.type !== "enum") delete next.enum;
		if (next.type !== "string") delete next.max_length;
		onChange({ ...draft, variables: { ...draft.variables, [name]: next } });
	};

	return (
		<div className="space-y-8">
			<div className="space-y-2 rounded-md border border-border/70 p-4 text-sm">
				<div className="font-medium">{t("presetTemplate.syntaxTitle")}</div>
				<ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
					{SYNTAX_EXAMPLES.map(([code, key]) => (
						<li key={key}>
							<code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{code}</code>{" "}
							{t(`presetTemplate.${key}` as never)}
						</li>
					))}
				</ul>
			</div>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-sm font-semibold">{t("presetTemplate.messagesTitle")}</h3>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="rounded-md"
						onClick={() => onChange({ ...draft, messages: [...draft.messages, { key: nextKey(), role: draft.messages.length ? "user" : "system", parts: [textPart()] }] })}
					>
						<Plus className="mr-2 h-4 w-4" />
						{t("presetTemplate.addMessage")}
					</Button>
				</div>
				{draft.messages.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("presetTemplate.messagesEmpty")}</p>
				) : null}
				{draft.messages.map((message, messageIndex) => (
					<div key={message.key} className="space-y-2 rounded-md border border-border/70 p-3">
						<div className="flex items-center gap-2">
							<Select value={message.role} onValueChange={(role: PromptTemplateRole) => updateMessage(message.key, { role, ...(role === "user" ? {} : { parts: textOnly(message.parts) }) })}>
								<SelectTrigger className="w-40 rounded-md"><SelectValue>{message.role}</SelectValue></SelectTrigger>
								<SelectContent className="rounded-md">
									{PROMPT_TEMPLATE_ROLES.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
								</SelectContent>
							</Select>
							<div className="flex-1" />
							<Button type="button" variant="ghost" size="sm" aria-label={t("presetTemplate.removeMessage")} onClick={() => onChange({ ...draft, messages: draft.messages.filter((item) => item.key !== message.key) })}>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
						{message.parts.map((part) => (
							<div key={part.key} className="flex items-start gap-2">
								{part.type === "text" ? (
									<Textarea
										value={part.text}
										onChange={(event) => updatePart(message, part.key, { text: event.target.value })}
										placeholder={t("presetTemplate.messagePlaceholder")}
										aria-label={t("presetTemplate.messageLabel", { number: messageIndex + 1, role: message.role })}
										rows={4}
										className="font-mono text-sm"
									/>
								) : (
									<div className="flex flex-1 items-center gap-2">
										<Label htmlFor={part.key} className="shrink-0 text-xs text-muted-foreground">{t("presetTemplate.imageVariableLabel")}</Label>
										<Input
											id={part.key}
											value={part.name}
											onChange={(event) => updatePart(message, part.key, { name: event.target.value.trim() })}
											placeholder={t("presetTemplate.imageVariablePlaceholder")}
											className="h-8 rounded-md font-mono text-xs"
										/>
									</div>
								)}
								{message.parts.length > 1 ? (
									<Button type="button" variant="ghost" size="sm" aria-label={t("presetTemplate.removePart")} onClick={() => updateMessage(message.key, { parts: message.parts.filter((item) => item.key !== part.key) })}>
										<Trash2 className="h-4 w-4" />
									</Button>
								) : null}
							</div>
						))}
						{message.role === "user" ? (
							<div className="flex gap-2">
								<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => updateMessage(message.key, { parts: [...message.parts, textPart()] })}>
									<Plus className="mr-2 h-4 w-4" />
									{t("presetTemplate.addText")}
								</Button>
								<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => updateMessage(message.key, { parts: [...message.parts, variablePart()] })}>
									<Plus className="mr-2 h-4 w-4" />
									{t("presetTemplate.addImage")}
								</Button>
							</div>
						) : null}
					</div>
				))}
			</section>

			<section className="space-y-3">
				<h3 className="text-sm font-semibold">{t("presetTemplate.variablesTitle")}</h3>
				{build.variables.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("presetTemplate.variablesEmpty")}</p>
				) : (
					<div className="divide-y divide-border/70 rounded-md border border-border/70">
						{build.variables.map(({ name, spec, declared }) => (
							<div key={name} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
								<div className="min-w-0 space-y-2">
									<div className="flex items-center gap-2">
										<code className="font-mono text-sm">{name}</code>
										{declared ? null : <span className="text-xs text-muted-foreground">{t("presetTemplate.variableInferred")}</span>}
									</div>
									<Input
										value={spec.description ?? ""}
										onChange={(event) => updateVariable(name, spec, { description: event.target.value || undefined })}
										placeholder={t("presetTemplate.descriptionPlaceholder")}
										className="h-8 rounded-md text-xs"
									/>
									{spec.type === "enum" ? (
										<Textarea
											value={(draft.variables[name]?.enum ?? spec.enum ?? []).join("\n")}
											onChange={(event) => updateVariable(name, spec, { enum: event.target.value.split("\n") })}
											placeholder={t("presetTemplate.enumPlaceholder")}
											aria-label={t("presetTemplate.enumPlaceholder")}
											rows={3}
											className="rounded-md font-mono text-xs"
										/>
									) : null}
									{spec.required ? null : (
										<Input
											value={draft.defaults[name] ?? ""}
											onChange={(event) => onChange({ ...draft, variables: { ...draft.variables, [name]: { ...spec } }, defaults: { ...draft.defaults, [name]: event.target.value } })}
											placeholder={t("presetTemplate.defaultPlaceholder")}
											className="h-8 rounded-md font-mono text-xs"
										/>
									)}
								</div>
								<Select value={spec.type} onValueChange={(type: PromptVariableType) => updateVariable(name, spec, { type })}>
									<SelectTrigger className="h-8 rounded-md text-xs"><SelectValue>{spec.type}</SelectValue></SelectTrigger>
									<SelectContent className="rounded-md">
										{PROMPT_VARIABLE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
									</SelectContent>
								</Select>
								<label className="flex items-center gap-2 text-xs text-muted-foreground">
									<Switch checked={spec.required === true} onCheckedChange={(required) => updateVariable(name, spec, { required })} />
									{t("presetTemplate.required")}
								</label>
							</div>
						))}
					</div>
				)}
			</section>

			<section className="space-y-3">
				<h3 className="text-sm font-semibold">{t("presetTemplate.advancedTitle")}</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label>{t("presetTemplate.toolsLabel")}</Label>
						<Textarea value={draft.tools} onChange={(event) => onChange({ ...draft, tools: event.target.value })} rows={6} className="font-mono text-xs" placeholder='[{"type":"function","function":{"name":"assign","parameters":{"type":"object"}}}]' />
						{tools.error ? <p className="text-xs text-destructive">{t("presetTemplate.jsonInvalid")}</p> : null}
					</div>
					<div className="space-y-2">
						<Label>{t("presetTemplate.responseFormatLabel")}</Label>
						<Textarea value={draft.responseFormat} onChange={(event) => onChange({ ...draft, responseFormat: event.target.value })} rows={6} className="font-mono text-xs" placeholder='{"type":"json_schema","json_schema":{"name":"result","schema":{"type":"object"}}}' />
						{responseFormat.error ? <p className="text-xs text-destructive">{t("presetTemplate.jsonInvalid")}</p> : null}
					</div>
				</div>
			</section>

			{build.template ? (
				<section className="space-y-3">
					<div>
						<h3 className="text-sm font-semibold">{t("presetTemplate.testTitle")}</h3>
						<p className="mt-1 text-sm text-muted-foreground">{t("presetTemplate.testDescription")}</p>
					</div>
					{build.variables.length ? (
						<div className="grid gap-2 md:grid-cols-2">
							{build.variables.map(({ name, spec }) => (
								<div key={name} className="space-y-1">
									<Label className="font-mono text-xs">{name}</Label>
									<Input
										value={draft.testValues[name] ?? ""}
										onChange={(event) => onChange({ ...draft, testValues: { ...draft.testValues, [name]: event.target.value } })}
										placeholder={spec.type}
										className="h-8 rounded-md font-mono text-xs"
									/>
								</div>
							))}
						</div>
					) : null}
					{preview.ok ? (
						<div className="grid gap-4 lg:grid-cols-2">
							<div className="space-y-2">
								<div className="text-xs font-medium text-muted-foreground">{t("presetTemplate.renderedTitle")}</div>
								<div className="space-y-2">
									{preview.messages.map((message, index) => (
										<div key={index} className="rounded-md border border-border/70 p-3">
											<div className="mb-1 font-mono text-xs text-muted-foreground">{message.role}</div>
											{typeof message.content === "string" ? (
												<p className="whitespace-pre-wrap text-sm">{message.content}</p>
											) : (
												message.content.map((part, partIndex) => part.type === "text"
													? <p key={partIndex} className="whitespace-pre-wrap text-sm">{part.text}</p>
													: <p key={partIndex} className="truncate font-mono text-xs text-muted-foreground">{t("presetTemplate.imagePart", { url: part.image_url.url.slice(0, 80) })}</p>)
											)}
										</div>
									))}
								</div>
							</div>
							<div className="min-w-0 space-y-2">
								<PresetTemplateCode reference={savedReference ?? presetReference} variables={preview.values} />
								<p className="text-xs text-muted-foreground">{t("presetTemplate.requestHelp")}</p>
								<p className="text-xs text-muted-foreground">{t("presetTemplate.pinHelp", { reference: savedReference ?? presetReference })}</p>
							</div>
						</div>
					) : (
						<div className="space-y-2 rounded-md border border-destructive/40 p-3">
							<div className="text-sm font-medium">{t("presetTemplate.issuesTitle")}</div>
							<IssueList issues={preview.issues} />
						</div>
					)}
					<PresetTemplateRun savedReference={savedReference} hasUnsavedChanges={hasUnsavedChanges} variables={preview.ok ? preview.values : null} />
				</section>
			) : null}
		</div>
	);
}
