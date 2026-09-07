"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent as ReactDragEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
	Background,
	Handle,
	MarkerType,
	MiniMap,
	Position,
	ReactFlow,
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type ReactFlowInstance,
} from "@xyflow/react";
import {
	BadgeDollarSign,
	Braces,
	Check,
	ChevronsUpDown,
	CircleStop,
	Code2,
	Copy,
	GitBranch,
	Gauge,
	History,
	KeyRound,
	ListTree,
	Maximize2,
	PanelRightClose,
	PanelRightOpen,
	Percent,
	Play,
	Plus,
	Rocket,
	Route,
	Save,
	Sparkles,
	Trash2,
	Workflow,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Controls } from "@/components/ai-elements/controls";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { branchLabel, orderedRouteNodes } from "./dynamicRouteGraph";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { publicSWRFetcher } from "@/lib/swr/publicFetcher";
import { publicSWRKeys } from "@/lib/swr/keys";
import type {
	DynamicRouteAction,
	DynamicRouteConfig,
	DynamicRouteEdge,
	DynamicRouteNode,
	DynamicRouteNodeType,
	DynamicRouteRow,
	SettingsDynamicRoutesInitialData,
} from "@/lib/fetchers/internal/settingsTypes";
import {
	attachDynamicRouteKeysAction,
	createDynamicRouteAction,
	deployDynamicRouteVersionAction,
	deleteDynamicRouteAction,
	updateDynamicRouteAction,
} from "@/app/(dashboard)/settings/routing/actions";
import "@xyflow/react/dist/style.css";

type StudioTab = "editor" | "versions" | "settings";
type Provider = SettingsDynamicRoutesInitialData["providers"][number];
type RoutingModelOption = {
	id: string;
	label: string;
	organisationId: string;
	organisationName: string;
	providerNames: string[];
	capabilities: string[];
	releaseDate: string | null;
};

const NODE_COPY: Record<DynamicRouteNodeType, { label: string; description: string; icon: typeof Route; tone: string }> = {
	start: { label: "Start", description: "Incoming request", icon: Play, tone: "border-sky-500/35 bg-sky-500/8" },
	condition: { label: "If / else", description: "Body, header or metadata", icon: GitBranch, tone: "border-amber-500/35 bg-amber-500/8" },
	percentage: { label: "Traffic split", description: "A/B or gradual rollout", icon: Percent, tone: "border-violet-500/35 bg-violet-500/8" },
	model: { label: "Call model", description: "Model and provider policy", icon: Sparkles, tone: "border-emerald-500/35 bg-emerald-500/8" },
	rate_limit: { label: "Rate limit", description: "Requests per key and period", icon: Gauge, tone: "border-orange-500/35 bg-orange-500/8" },
	budget_limit: { label: "Budget limit", description: "Spend per key and period", icon: BadgeDollarSign, tone: "border-rose-500/35 bg-rose-500/8" },
	end: { label: "End", description: "Return the model response", icon: CircleStop, tone: "border-zinc-500/35 bg-zinc-500/8" },
};

const EMPTY_ACTION: DynamicRouteAction = { providerOrder: [], providerOnly: [], providerIgnore: [], allowFallbacks: true };

function startNode(): DynamicRouteNode {
	return { id: "start", type: "start", position: { x: 60, y: 240 }, data: { label: "Request received" } };
}

function newConfig(): DynamicRouteConfig {
	return { schemaVersion: 2, entryNodeId: "start", nodes: [startNode()], edges: [], cacheAwareRouting: true, sessionAffinity: true, defaultAction: { ...EMPTY_ACTION }, rules: [] };
}

function legacyGraph(config: DynamicRouteConfig): Pick<DynamicRouteConfig, "schemaVersion" | "entryNodeId" | "nodes" | "edges"> {
	const nodes: DynamicRouteNode[] = [startNode()];
	const edges: DynamicRouteEdge[] = [];
	let previous = "start";
	for (const [index, rule] of (config.rules ?? []).entries()) {
		const conditionId = `legacy-condition-${index}`;
		const modelId = `legacy-model-${index}`;
		nodes.push({ id: conditionId, type: "condition", position: { x: 350 + index * 330, y: 120 }, data: { label: rule.name, source: rule.condition.field === "metadata" ? "metadata" : rule.condition.field, path: rule.condition.metadataKey ?? "", operator: rule.condition.operator, value: rule.condition.value ?? "" } });
		nodes.push({ id: modelId, type: "model", position: { x: 350 + index * 330, y: 390 }, data: { label: rule.name, ...rule.action } });
		edges.push({ id: `${previous}-${conditionId}`, source: previous, target: conditionId });
		edges.push({ id: `${conditionId}-${modelId}`, source: conditionId, target: modelId, sourceHandle: "true" });
		previous = conditionId;
	}
	const fallbackId = "legacy-default";
	nodes.push({ id: fallbackId, type: "model", position: { x: 350 + (config.rules?.length ?? 0) * 330, y: 240 }, data: { label: "Default model", ...(config.defaultAction ?? EMPTY_ACTION) } });
	edges.push({ id: `${previous}-${fallbackId}`, source: previous, target: fallbackId, sourceHandle: previous === "start" ? null : "false" });
	return { schemaVersion: 2, entryNodeId: "start", nodes, edges };
}

function normalizedRoute(route: DynamicRouteRow): DynamicRouteRow {
	const config = route.config?.nodes?.length ? route.config : { ...route.config, ...legacyGraph(route.config ?? newConfig()) };
	return { ...route, keyIds: route.keyIds ?? [], config: { ...newConfig(), ...config, nodes: config.nodes ?? [], edges: config.edges ?? [] } };
}

function nodeData(type: DynamicRouteNodeType, providers: Provider[]): Record<string, any> {
	if (type === "condition") return { label: "Check a request value", source: "metadata", path: "plan", operator: "equals", value: "pro" };
	if (type === "percentage") return { label: "Split traffic", branches: [{ id: "primary", label: "Primary", percentage: 90 }, { id: "experiment", label: "Experiment", percentage: 10 }] };
	if (type === "model") return { label: "Call a model", model: "", modelFallbacks: [], routingMode: "balanced", providerOrder: providers.slice(0, 2).map((provider) => provider.id), providerOnly: [], providerIgnore: [], allowFallbacks: true };
	if (type === "rate_limit") return { label: "Limit requests", window: "daily", maxRequests: 1000 };
	if (type === "budget_limit") return { label: "Limit spend", window: "monthly", maxCostUsd: 100 };
	if (type === "end") return { label: "Return response" };
	return { label: "Request received" };
}

function summaryFor(node: DynamicRouteNode, providers: Provider[]): string {
	if (node.type === "condition") return `${node.data.source}${node.data.path ? `.${node.data.path}` : ""} ${String(node.data.operator).replaceAll("_", " ")} ${node.data.value ?? ""}`;
	if (node.type === "percentage") return (node.data.branches ?? []).map((branch: any) => `${branch.percentage}% ${branch.label}`).join(" · ");
	if (node.type === "model") {
		const providerNames = (node.data.providerOrder ?? []).map((id: string) => providers.find((provider) => provider.id === id)?.name ?? id);
		return [node.data.model || "Choose a model", providerNames.join(" → ")].filter(Boolean).join(" · ");
	}
	if (node.type === "rate_limit") return `${Number(node.data.maxRequests ?? 0).toLocaleString()} requests / ${node.data.window}`;
	if (node.type === "budget_limit") return `$${Number(node.data.maxCostUsd ?? 0).toLocaleString()} / ${node.data.window}`;
	return NODE_COPY[node.type].description;
}

function WorkflowNodeCard({ data, selected }: { data: any; selected: boolean }) {
	const node = data.node as DynamicRouteNode;
	const copy = NODE_COPY[node.type];
	const Icon = copy.icon;
	const isBranch = node.type === "condition" || node.type === "percentage" || node.type === "rate_limit" || node.type === "budget_limit";
	return (
		<div className={cn("relative w-64 rounded-xl border bg-background/95 px-4 py-3 shadow-lg shadow-black/10 transition", copy.tone, selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background")}>
			{node.type !== "start" ? <Handle type="target" position={Position.Top} className="!size-3 !border-2 !border-background !bg-muted-foreground" /> : null}
			<div className="flex items-start gap-3">
				<div className="grid size-8 shrink-0 place-items-center rounded-lg border border-current/15 bg-background/80"><Icon className="size-4" /></div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{node.data.label || copy.label}</p><span className="text-[11px] text-muted-foreground">{copy.label}</span></div>
					<p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{data.summary}</p>
				</div>
			</div>
			{node.type === "condition" ? <div className="mt-3 grid grid-cols-2 gap-2 border-t border-current/10 pt-2">
				<span className="rounded-md bg-emerald-500/15 px-2 py-1 text-center text-[11px] font-semibold text-emerald-400">True</span>
				<span className="rounded-md bg-rose-500/15 px-2 py-1 text-center text-[11px] font-semibold text-rose-400">False</span>
				<Handle id="true" type="source" position={Position.Bottom} style={{ left: "25%" }} className="!size-3.5 !border-2 !border-background !bg-emerald-500" />
				<Handle id="false" type="source" position={Position.Bottom} style={{ left: "75%" }} className="!size-3.5 !border-2 !border-background !bg-rose-500" />
			</div> : null}
			{node.type === "rate_limit" || node.type === "budget_limit" ? <div className="mt-3 grid grid-cols-2 gap-2 border-t border-current/10 pt-2">
				<span className="rounded-md bg-emerald-500/15 px-2 py-1 text-center text-[11px] font-semibold text-emerald-400">Within limit</span>
				<span className="rounded-md bg-rose-500/15 px-2 py-1 text-center text-[11px] font-semibold text-rose-400">Exceeded</span>
				<Handle id="within" type="source" position={Position.Bottom} style={{ left: "25%" }} className="!size-3.5 !border-2 !border-background !bg-emerald-500" />
				<Handle id="exceeded" type="source" position={Position.Bottom} style={{ left: "75%" }} className="!size-3.5 !border-2 !border-background !bg-rose-500" />
			</div> : null}
			{node.type === "percentage" ? <div className="mt-3 flex gap-2 border-t border-current/10 pt-2">{(node.data.branches ?? []).slice(0, 4).map((branch: any, index: number, branches: any[]) => <span key={branch.id} className="min-w-0 flex-1 rounded-md bg-violet-500/15 px-2 py-1 text-center text-[11px] font-semibold text-violet-300">{branch.percentage}% {branch.label}<Handle id={branch.id} type="source" position={Position.Bottom} style={{ left: `${((index + 0.5) / branches.length) * 100}%` }} className="!size-3.5 !border-2 !border-background !bg-violet-500" /></span>)}</div> : null}
			{!isBranch && node.type !== "end" ? <Handle type="source" position={Position.Bottom} className="!size-3.5 !border-2 !border-background !bg-muted-foreground" /> : null}
		</div>
	);
}

const nodeTypes = { workflow: WorkflowNodeCard };

function fallbackModelLabel(modelId: string): string {
	const leaf = modelId.split("/").pop() ?? modelId;
	return leaf.split(/[-_]/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function buildRoutingModelOptions(models: GatewaySupportedModel[]): RoutingModelOption[] {
	const byId = new Map<string, RoutingModelOption>();
	for (const model of models) {
		if (!model.isAvailable) continue;
		const id = model.selectorModelId || model.modelId;
		const organisationId = model.organisationId?.trim() || id.split("/")[0] || "phaseo";
		const existing = byId.get(id);
		const providerName = model.providerName ?? model.providerId;
		if (!existing) {
			byId.set(id, {
				id,
				label: model.modelName?.trim() || fallbackModelLabel(id),
				organisationId,
				organisationName: model.organisationName ?? organisationId.replaceAll("-", " "),
				providerNames: [providerName],
				capabilities: [...new Set(model.capabilities ?? [])],
				releaseDate: model.releaseDate ?? model.announcementDate ?? null,
			});
			continue;
		}
		if (!existing.providerNames.includes(providerName)) existing.providerNames.push(providerName);
		for (const capability of model.capabilities ?? []) if (!existing.capabilities.includes(capability)) existing.capabilities.push(capability);
		const releaseDate = model.releaseDate ?? model.announcementDate ?? null;
		if (!existing.releaseDate && releaseDate) existing.releaseDate = releaseDate;
	}
	return [...byId.values()].sort((left, right) => {
		const leftTime = left.releaseDate ? Date.parse(left.releaseDate) : Number.NEGATIVE_INFINITY;
		const rightTime = right.releaseDate ? Date.parse(right.releaseDate) : Number.NEGATIVE_INFINITY;
		return rightTime - leftTime || left.label.localeCompare(right.label);
	});
}

function releaseGroupLabel(releaseDate: string | null): string {
	if (!releaseDate) return "Earlier models";
	const date = new Date(releaseDate);
	if (Number.isNaN(date.getTime())) return "Earlier models";
	return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function capabilityLabel(capability: string): string {
	return capability.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function getProviderLogoId(providerId: string): string {
	const normalized = providerId.trim().toLowerCase();
	return normalized.includes("bedrock") ? "amazon-bedrock" : normalized || "phaseo";
}


function StudioSelect({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; ariaLabel: string }) {
	const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
	return (
		<Select value={value} items={options} onValueChange={onChange}>
			<SelectTrigger aria-label={ariaLabel} className="h-9 w-full rounded-md border border-input bg-background">
				<SelectValue>{selectedLabel}</SelectValue>
			</SelectTrigger>
			<SelectContent align="start">
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} label={option.label}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function ProviderSelect({ value, onChange, providers }: { value: string; onChange: (value: string) => void; providers: Provider[] }) {
	const selected = providers.find((provider) => provider.id === value);
	const items = [
		{ value: "__any__", label: "Any eligible provider" },
		...providers.map((provider) => ({ value: provider.id, label: provider.name })),
	];
	return (
		<Select value={value} items={items} onValueChange={onChange}>
			<SelectTrigger aria-label="Preferred provider" className="h-9 w-full rounded-md border border-input bg-background">
				<SelectValue>
					<span className="flex min-w-0 items-center gap-2">
						{selected ? <Logo id={getProviderLogoId(selected.id)} alt={selected.name} width={16} height={16} className="size-4 shrink-0 object-contain" /> : <Route className="size-4 shrink-0 text-muted-foreground" />}
						<span className="truncate">{selected?.name ?? "Any eligible provider"}</span>
					</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent align="start">
				<SelectItem value="__any__" label="Any eligible provider">
					<span className="flex items-center gap-2"><Route className="size-4 text-muted-foreground" />Any eligible provider</span>
				</SelectItem>
				{providers.map((provider) => (
					<SelectItem key={provider.id} value={provider.id} label={provider.name}>
						<span className="flex items-center gap-2"><Logo id={getProviderLogoId(provider.id)} alt={provider.name} width={16} height={16} className="size-4 shrink-0 object-contain" />{provider.name}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function GatewayModelCombobox({ value, onChange, options, excludedIds = [], requiredCapabilities = [], ariaLabel, loading, error }: { value: string; onChange: (value: string) => void; options: RoutingModelOption[]; excludedIds?: string[]; requiredCapabilities?: string[]; ariaLabel: string; loading: boolean; error: boolean }) {
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.id === value);
	const excluded = new Set(excludedIds.filter((id) => id !== value));
	const available = options.filter((option) => !excluded.has(option.id) && requiredCapabilities.every((capability) => option.capabilities.includes(capability)));
	const grouped = new Map<string, RoutingModelOption[]>();
	for (const option of available) {
		const group = releaseGroupLabel(option.releaseDate);
		grouped.set(group, [...(grouped.get(group) ?? []), option]);
	}
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" role="combobox" aria-label={ariaLabel} aria-expanded={open} className="h-auto min-h-10 w-full justify-between gap-2 px-3 py-2 font-normal">
					<span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">{selected ? <Logo id={selected.organisationId} alt={selected.organisationName} width={20} height={20} className="size-5 shrink-0 object-contain" /> : <Sparkles className="size-5 shrink-0 text-muted-foreground" />}<span className="min-w-0">{value ? <><span className="block truncate text-sm font-medium text-foreground">{selected?.organisationName ? `${selected.organisationName}: ` : ""}{selected?.label ?? value}</span>{selected ? <span className="block truncate text-[11px] text-muted-foreground">{selected.id}</span> : null}</> : <span className="text-muted-foreground">Choose a model…</span>}</span></span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(480px,calc(100vw-2rem))] p-0">
				<Command>
					<CommandInput placeholder="Search models, providers or IDs…" />
					<CommandList className="max-h-96 p-1">
						<CommandEmpty>{loading ? "Loading gateway models…" : error ? "Could not load the model catalogue." : "No compatible models found."}</CommandEmpty>
						{Array.from(grouped.entries()).map(([releaseGroup, entries]) => <CommandGroup key={releaseGroup} heading={releaseGroup} className="pb-1 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground">{entries.map((option) => <CommandItem key={option.id} value={`${option.label} ${option.id} ${option.organisationName} ${option.providerNames.join(" ")} ${option.capabilities.join(" ")}`} onSelect={() => { onChange(option.id); setOpen(false); }} className="min-h-11 gap-3 py-2"><Logo id={option.organisationId} alt={option.organisationName} width={20} height={20} className="size-5 shrink-0 object-contain" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{option.organisationName}: {option.label}</p><div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><span className="truncate">{option.id}</span>{option.capabilities.slice(0, 2).map((capability) => <Badge key={capability} variant="outline" className="h-4 shrink-0 rounded px-1 text-[9px] font-medium">{capabilityLabel(capability)}</Badge>)}</div></div><Check className={cn("size-4 shrink-0", option.id === value ? "opacity-100" : "opacity-0")} /></CommandItem>)}</CommandGroup>)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function nestedValue(path: string, value: unknown): Record<string, unknown> {
	const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
	if (!parts.length) return {};
	const root: Record<string, unknown> = {};
	let current = root;
	for (const [index, part] of parts.entries()) {
		if (index === parts.length - 1) current[part] = value;
		else {
			const next: Record<string, unknown> = {};
			current[part] = next;
			current = next;
		}
	}
	return root;
}

function conditionTriggerExample(node: DynamicRouteNode): string {
	const source = String(node.data.source ?? "metadata");
	const path = String(node.data.path ?? "").trim();
	const value = node.data.operator === "exists" ? "present" : node.data.value ?? "value";
	const base = { model: "openai/gpt-5-mini", input: "Your prompt" };
	if (source === "header") return JSON.stringify({ headers: { [path || "x-region"]: value }, body: base }, null, 2);
	if (source === "metadata") return JSON.stringify({ ...base, metadata: nestedValue(path || "customer_plan", value) }, null, 2);
	if (source === "body") return JSON.stringify({ ...base, ...nestedValue(path || "priority", value) }, null, 2);
	if (source === "session_id") return JSON.stringify({ ...base, session_id: value }, null, 2);
	if (source === "model") return JSON.stringify({ ...base, model: value }, null, 2);
	if (source === "endpoint") return `POST https://api.phaseo.app/v1/${String(value || "responses")}`;
	return JSON.stringify(base, null, 2);
}

function NodeInspector({ node, providers, update, remove }: { node: DynamicRouteNode; providers: Provider[]; update: (data: Record<string, any>) => void; remove: () => void }) {
	const copy = NODE_COPY[node.type];
	const [copied, setCopied] = useState(false);
	const { data: modelCatalog, error: modelCatalogRequestError, isLoading: modelCatalogLoading } = useSWR<{ models: GatewaySupportedModel[] }>(publicSWRKeys.gatewayModels, publicSWRFetcher);
	const modelOptions = useMemo(() => buildRoutingModelOptions(modelCatalog?.models ?? []), [modelCatalog?.models]);
	const modelCatalogError = Boolean(modelCatalogRequestError);
	const example = node.type === "condition" ? conditionTriggerExample(node) : "";
	async function copyExample() {
		await navigator.clipboard.writeText(example);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	}
	const modelFallbacks = Array.isArray(node.data.modelFallbacks) ? node.data.modelFallbacks as string[] : [];
	const primaryCapabilities = modelOptions.find((option) => option.id === node.data.model)?.capabilities ?? [];
	return (
		<div className="space-y-5 p-5">
			<div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{copy.label}</p><p className="mt-1 text-xs text-muted-foreground">{copy.description}</p></div>{node.type !== "start" ? <Button size="icon-sm" variant="ghost" onClick={remove} aria-label="Delete node"><Trash2 className="size-4" /></Button> : null}</div>
			<div className="space-y-2"><Label>Label</Label><Input value={node.data.label ?? ""} onChange={(event) => update({ label: event.target.value })} /></div>
			{node.type === "condition" ? <>
				<div className="space-y-2"><Label>Read from</Label><StudioSelect ariaLabel="Condition source" value={node.data.source ?? "metadata"} onChange={(source) => update({ source })} options={[{ value: "metadata", label: "Custom metadata" }, { value: "body", label: "Request body" }, { value: "header", label: "Request header" }, { value: "endpoint", label: "Endpoint" }, { value: "model", label: "Requested model" }, { value: "session_id", label: "Session ID" }]} /></div>
				{["metadata", "body", "header"].includes(node.data.source) ? <div className="space-y-2"><Label>{node.data.source === "header" ? "Header name" : "Field path"}</Label><Input value={node.data.path ?? ""} onChange={(event) => update({ path: event.target.value })} placeholder={node.data.source === "metadata" ? "customer.plan" : node.data.source === "header" ? "x-region" : "input.priority"} /></div> : null}
				<div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Operator</Label><StudioSelect ariaLabel="Condition operator" value={node.data.operator ?? "equals"} onChange={(operator) => update({ operator })} options={[{ value: "equals", label: "Equals" }, { value: "not_equals", label: "Does not equal" }, { value: "contains", label: "Contains" }, { value: "starts_with", label: "Starts with" }, { value: "exists", label: "Exists" }, { value: "greater_than", label: "Greater than" }, { value: "less_than", label: "Less than" }, { value: "in", label: "Is one of" }]} /></div><div className="space-y-2"><Label>Value</Label><Input disabled={node.data.operator === "exists"} value={node.data.value ?? ""} onChange={(event) => update({ value: event.target.value })} /></div></div>
				<div className="overflow-hidden rounded-xl border bg-zinc-950 text-zinc-100"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><div className="flex items-center gap-2 text-xs font-medium"><Code2 className="size-3.5" />How to trigger this branch</div><Button size="icon-sm" variant="ghost" className="text-zinc-300 hover:bg-white/10 hover:text-white" onClick={copyExample} aria-label="Copy request example">{copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}</Button></div><pre className="max-h-64 overflow-auto p-3 text-[11px] leading-5 text-zinc-300"><code>{example}</code></pre></div>
			</> : null}
			{node.type === "percentage" ? <div className="space-y-3"><Label>Traffic allocation</Label>{(node.data.branches ?? []).map((branch: any, index: number) => <div key={branch.id} className="grid grid-cols-[1fr_88px] gap-2"><Input value={branch.label} onChange={(event) => update({ branches: node.data.branches.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><div className="relative"><Input type="number" min={0} max={100} value={branch.percentage} onChange={(event) => update({ branches: node.data.branches.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, percentage: Number(event.target.value) } : item) })} /><span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">%</span></div></div>)}<p className={cn("text-xs", (node.data.branches ?? []).reduce((sum: number, branch: any) => sum + Number(branch.percentage || 0), 0) === 100 ? "text-muted-foreground" : "text-destructive")}>Allocations must total 100%.</p></div> : null}
			{node.type === "model" ? <>
				<div className="space-y-2"><Label>Primary model</Label><GatewayModelCombobox value={node.data.model ?? ""} onChange={(model) => {
					const capabilities = modelOptions.find((option) => option.id === model)?.capabilities ?? [];
					const compatibleFallbacks = modelFallbacks.filter((fallback) => {
						const option = modelOptions.find((candidate) => candidate.id === fallback);
						return option && capabilities.every((capability) => option.capabilities.includes(capability));
					});
					update({ model, modelFallbacks: compatibleFallbacks });
				}} options={modelOptions} excludedIds={modelFallbacks} ariaLabel="Primary model" loading={modelCatalogLoading} error={modelCatalogError} /></div>
				<div className="space-y-2"><Label>Routing strategy</Label><StudioSelect ariaLabel="Routing strategy" value={node.data.routingMode ?? "balanced"} onChange={(routingMode) => update({ routingMode })} options={[{ value: "balanced", label: "Balanced" }, { value: "latency", label: "Lowest latency" }, { value: "price", label: "Lowest price" }, { value: "throughput", label: "Highest throughput" }]} /></div>
				<div className="space-y-2"><Label>Preferred provider</Label><ProviderSelect value={node.data.providerOrder?.[0] ?? "__any__"} onChange={(providerId) => update({ providerOrder: providerId === "__any__" ? [] : [providerId] })} providers={providers} /></div>
				<div className="flex items-center justify-between border-y py-3"><div><p className="text-sm font-medium">Provider fallbacks</p><p className="text-xs text-muted-foreground">Try another eligible provider for this model.</p></div><Switch checked={node.data.allowFallbacks !== false} onCheckedChange={(allowFallbacks) => update({ allowFallbacks })} /></div>
				<div className="space-y-3 border-t pt-4"><div className="flex items-start justify-between gap-3"><div><Label>Model fallbacks</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">Tried in order when the primary model cannot complete the request.</p>{primaryCapabilities.length ? <p className="mt-1 text-[11px] text-muted-foreground">Compatible capability: {primaryCapabilities.map(capabilityLabel).join(", ")}</p> : null}</div><Badge variant="outline" className="shrink-0">{modelFallbacks.length}/8</Badge></div>{modelFallbacks.map((fallback, index) => <div key={`${index}-${fallback}`} className="grid grid-cols-[24px_minmax(0,1fr)_32px] items-center gap-2"><span className="text-center text-xs font-medium text-muted-foreground">{index + 1}</span><GatewayModelCombobox value={fallback} onChange={(model) => update({ modelFallbacks: modelFallbacks.map((item, itemIndex) => itemIndex === index ? model : item) })} options={modelOptions} excludedIds={[node.data.model ?? "", ...modelFallbacks.filter((_, itemIndex) => itemIndex !== index)]} requiredCapabilities={primaryCapabilities} ariaLabel={`Fallback model ${index + 1}`} loading={modelCatalogLoading} error={modelCatalogError} /><Button size="icon-sm" variant="ghost" onClick={() => update({ modelFallbacks: modelFallbacks.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove fallback model ${index + 1}`}><X className="size-4" /></Button></div>)}<Button variant="outline" size="sm" className="w-full" disabled={modelFallbacks.length >= 8} onClick={() => update({ modelFallbacks: [...modelFallbacks, ""] })}><Plus className="size-4" />Add fallback model</Button></div>
			</> : null}
			{node.type === "rate_limit" || node.type === "budget_limit" ? <>
				<div className="space-y-2"><Label>Window</Label><StudioSelect ariaLabel="Limit window" value={node.data.window ?? "daily"} onChange={(window) => update({ window })} options={[{ value: "daily", label: "Per day" }, { value: "weekly", label: "Per week" }, { value: "monthly", label: "Per month" }]} /></div>
				<div className="space-y-2"><Label>{node.type === "rate_limit" ? "Maximum requests" : "Maximum spend (USD)"}</Label><Input type="number" min={0} value={node.type === "rate_limit" ? node.data.maxRequests ?? 0 : node.data.maxCostUsd ?? 0} onChange={(event) => update(node.type === "rate_limit" ? { maxRequests: Number(event.target.value) } : { maxCostUsd: Number(event.target.value) })} /></div>
				<p className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Use the <strong className="text-foreground">within</strong> output for normal traffic and the <strong className="text-foreground">exceeded</strong> output for fallback or rejection.</p>
			</> : null}
		</div>
	);
}

function MobileFlowEditor({ nodes, edges, entryNodeId, providers, selectedNodeId, onSelect, onAdd, onUpdate, onRemove }: {
	nodes: DynamicRouteNode[];
	edges: DynamicRouteEdge[];
	entryNodeId?: string | null;
	providers: Provider[];
	selectedNodeId: string | null;
	onSelect: (id: string) => void;
	onAdd: (type: DynamicRouteNodeType) => void;
	onUpdate: (id: string, data: Record<string, any>) => void;
	onRemove: (id: string) => void;
}) {
	const ordered = orderedRouteNodes(nodes, edges, entryNodeId);
	const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? ordered[0] ?? null;
	const nodeNames = new Map(nodes.map((node) => [node.id, node.data.label || NODE_COPY[node.type].label]));
	return <div className="lg:hidden">
		<div className="border-b p-4"><div className="flex items-center gap-2"><ListTree className="size-4 text-muted-foreground" /><div><p className="text-sm font-semibold">Route steps</p><p className="text-xs text-muted-foreground">A simplified editor for smaller screens.</p></div></div><div className="mt-3"><StudioSelect ariaLabel="Add route step" value="__add__" onChange={(value) => { if (value !== "__add__") onAdd(value as DynamicRouteNodeType); }} options={[{ value: "__add__", label: "Add a step…" }, ...(["condition", "percentage", "model", "rate_limit", "budget_limit", "end"] as DynamicRouteNodeType[]).map((type) => ({ value: type, label: NODE_COPY[type].label }))]} /></div></div>
		<div className="space-y-3 p-4">{ordered.map((node, index) => {
			const copy = NODE_COPY[node.type];
			const Icon = copy.icon;
			const outgoing = edges.filter((edge) => edge.source === node.id);
			const selected = node.id === selectedNode?.id;
			return <div key={node.id} className="relative pl-10"><div className={cn("absolute left-0 top-3 grid size-7 place-items-center rounded-full border bg-background text-xs font-semibold", selected && "border-primary text-primary")}>{index + 1}</div>{index < ordered.length - 1 ? <div className="absolute bottom-[-14px] left-[13px] top-10 w-px bg-border" /> : null}<button onClick={() => onSelect(node.id)} className={cn("w-full rounded-xl border p-4 text-left transition", selected ? "border-primary bg-primary/5" : "bg-card")}><div className="flex items-start gap-3"><div className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", copy.tone)}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{node.data.label || copy.label}</p><Badge variant="outline" className="shrink-0">{copy.label}</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{summaryFor(node, providers)}</p></div></div>{outgoing.length ? <div className="mt-3 space-y-1.5 border-t pt-3">{outgoing.map((edge) => <div key={edge.id} className="flex items-center justify-between gap-3 text-xs"><span className={cn("rounded-md px-2 py-1 font-semibold", edge.sourceHandle === "false" || edge.sourceHandle === "exceeded" ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400")}>{branchLabel(edge.sourceHandle)}</span><span className="truncate text-muted-foreground">→ {nodeNames.get(edge.target) ?? "Unconnected"}</span></div>)}</div> : null}</button>{selected ? <div className="mt-3 overflow-hidden rounded-xl border bg-muted/15"><NodeInspector node={node} providers={providers} update={(data) => onUpdate(node.id, data)} remove={() => onRemove(node.id)} /></div> : null}</div>;
		})}</div>
	</div>;
}

export default function DynamicRoutesStudio({ initialData, demoMode = false }: { initialData: SettingsDynamicRoutesInitialData; demoMode?: boolean }) {
	const router = useRouter();
	const [routes, setRoutes] = useState(() => initialData.routes.map(normalizedRoute));
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(routes[0]?.id ?? null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(routes[0]?.config.entryNodeId ?? null);
	const [tab, setTab] = useState<StudioTab>("editor");
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [focusModeOpen, setFocusModeOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const selectedIndex = routes.findIndex((route) => route.id === selectedRouteId);
	const selectedRoute = selectedIndex >= 0 ? routes[selectedIndex] : null;
	const config = selectedRoute?.config ?? newConfig();
	const routeNodes = useMemo(() => config.nodes ?? [], [config.nodes]);
	const routeEdges = useMemo(() => config.edges ?? [], [config.edges]);
	const routeNodesSignature = JSON.stringify(routeNodes);
	const providerSignature = initialData.providers.map((provider) => `${provider.id}:${provider.name}`).join("|");
	const selectedNode = routeNodes.find((node) => node.id === selectedNodeId) ?? null;

	const [flowNodes, setFlowNodes] = useState<Node[]>(() => routeNodes.map((node) => ({ id: node.id, type: "workflow", position: node.position ?? { x: 0, y: 0 }, data: { node, summary: summaryFor(node, initialData.providers) }, selected: node.id === selectedNodeId })));
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
	const paletteDragTypeRef = useRef<DynamicRouteNodeType | null>(null);
	const suppressPaletteClickRef = useRef(false);
	useEffect(() => {
		// React Flow owns measured dimensions; merge them back when route data changes.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setFlowNodes((current) => {
			const next = routeNodes.map((node) => {
				const existing = current.find((item) => item.id === node.id);
				return { ...existing, id: node.id, type: "workflow", position: node.position ?? existing?.position ?? { x: 0, y: 0 }, data: { node, summary: summaryFor(node, initialData.providers) }, selected: node.id === selectedNodeId };
			});
			const unchanged = next.length === current.length && next.every((node, index) => {
				const previous = current[index];
				return previous?.id === node.id &&
					previous.type === node.type &&
					previous.selected === node.selected &&
					previous.position.x === node.position.x &&
					previous.position.y === node.position.y &&
					previous.data.summary === node.data.summary;
			});
			return unchanged ? current : next;
		});
		// Object identities can change during React Flow measurement without the
		// persisted route changing. Stable signatures prevent a render loop while
		// still synchronizing every semantic route/provider update.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [routeNodesSignature, selectedNodeId, providerSignature]);
	const flowEdges = useMemo<Edge[]>(() => routeEdges.map((edge) => ({ ...edge, sourceHandle: edge.sourceHandle ?? undefined, type: "smoothstep", interactionWidth: 24, markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.75 } })), [routeEdges]);

	function replaceSelected(update: (route: DynamicRouteRow) => DynamicRouteRow) {
		if (selectedIndex < 0) return;
		setRoutes((current) => current.map((route, index) => index === selectedIndex ? update(route) : route));
	}
	function updateConfig(update: (current: DynamicRouteConfig) => DynamicRouteConfig) { replaceSelected((route) => ({ ...route, config: update(route.config) })); }
	function updateNode(id: string, data: Record<string, any>) { updateConfig((current) => ({ ...current, nodes: (current.nodes ?? []).map((node) => node.id === id ? { ...node, data: { ...node.data, ...data } } : node) })); }

	function addNode(type: DynamicRouteNodeType, options?: { position?: { x: number; y: number }; connect?: boolean }) {
		if (!selectedRoute || type === "start") return;
		const id = `${type}-${crypto.randomUUID()}`;
		const selected = options?.connect === false ? undefined : routeNodes.find((node) => node.id === selectedNodeId);
		let sourceHandle: string | null = null;
		if (selected?.type === "condition") sourceHandle = routeEdges.some((edge) => edge.source === selected.id && edge.sourceHandle === "true") ? "false" : "true";
		if (selected?.type === "rate_limit" || selected?.type === "budget_limit") sourceHandle = routeEdges.some((edge) => edge.source === selected.id && edge.sourceHandle === "within") ? "exceeded" : "within";
		if (selected?.type === "percentage") {
			const branches = selected.data.branches ?? [];
			sourceHandle = branches.find((branch: any) => !routeEdges.some((edge) => edge.source === selected.id && edge.sourceHandle === branch.id))?.id ?? branches[0]?.id ?? null;
		}
		const furthestY = Math.max(40, ...routeNodes.map((node) => node.position?.y ?? 0));
		let x = selected?.position?.x ?? 460;
		if (sourceHandle === "true" || sourceHandle === "within") x -= 180;
		if (sourceHandle === "false" || sourceHandle === "exceeded") x += 180;
		if (selected?.type === "percentage") {
			const branches = selected.data.branches ?? [];
			const branchIndex = Math.max(0, branches.findIndex((branch: any) => branch.id === sourceHandle));
			x += (branchIndex - (branches.length - 1) / 2) * 300;
		}
		const node: DynamicRouteNode = { id, type, position: options?.position ?? { x, y: selected ? (selected.position?.y ?? 0) + 260 : furthestY + 260 }, data: nodeData(type, initialData.providers) };
		updateConfig((current) => ({ ...current, nodes: [...(current.nodes ?? []), node], edges: selected ? [...(current.edges ?? []), { id: `${selected.id}-${id}`, source: selected.id, target: id, sourceHandle }] : current.edges }));
		setSelectedNodeId(id);
	}

	function startPaletteDrag(event: ReactDragEvent<HTMLButtonElement>, type: DynamicRouteNodeType) {
		paletteDragTypeRef.current = type;
		suppressPaletteClickRef.current = true;
		event.dataTransfer.setData("application/phaseo-route-node", type);
		event.dataTransfer.effectAllowed = "copy";
	}

	function finishPaletteDrag(event: ReactDragEvent<HTMLButtonElement>) {
		paletteDragTypeRef.current = null;
		event.dataTransfer.clearData();
		// Native drag-and-drop can emit a trailing click on the draggable element.
		// Keep that click suppressed until the drag event sequence has fully settled.
		window.setTimeout(() => { suppressPaletteClickRef.current = false; }, 250);
	}

	function appendPaletteNode(type: DynamicRouteNodeType) {
		if (suppressPaletteClickRef.current) return;
		addNode(type);
	}

	function dropPaletteNode(event: ReactDragEvent<HTMLDivElement>) {
		event.preventDefault();
		const type = paletteDragTypeRef.current;
		// Consume the active drag before updating state so duplicate drop/click events
		// cannot create the same node again.
		paletteDragTypeRef.current = null;
		if (!flowInstance || !type || !NODE_COPY[type] || type === "start") return;
		addNode(type, { position: flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }), connect: false });
	}

	function removeNode(id: string) {
		updateConfig((current) => ({ ...current, nodes: (current.nodes ?? []).filter((node) => node.id !== id), edges: (current.edges ?? []).filter((edge) => edge.source !== id && edge.target !== id) }));
		setSelectedNodeId(config.entryNodeId ?? null);
	}

	function onNodesChange(changes: NodeChange[]) {
		setFlowNodes((current) => applyNodeChanges(changes, current));
		const moved = changes.filter((change): change is Extract<NodeChange, { type: "position" }> => change.type === "position" && Boolean(change.position));
		if (moved.length) updateConfig((current) => ({ ...current, nodes: (current.nodes ?? []).map((node) => ({ ...node, position: moved.find((change) => change.id === node.id)?.position ?? node.position })) }));
	}
	function onEdgesChange(changes: EdgeChange[]) {
		const changed = applyEdgeChanges(changes, flowEdges);
		updateConfig((current) => ({ ...current, edges: changed.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null })) }));
	}
	function onConnect(connection: Connection) {
		const changed = addEdge({ ...connection, id: `${connection.source}-${connection.sourceHandle ?? "next"}-${connection.target}` }, flowEdges);
		updateConfig((current) => ({ ...current, edges: changed.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? null })) }));
	}

	function createRoute() {
		const createLocal = (id: string, version: number) => {
			const now = new Date().toISOString();
			const route: DynamicRouteRow = { id, workspace_id: initialData.workspaceId ?? "demo", name: `Untitled route ${routes.length + 1}`, description: null, status: "active", version, config: newConfig(), keyIds: [], created_at: now, updated_at: now, versions: [{ version, status: "draft", created_at: now }] };
			setRoutes((current) => [route, ...current]); setSelectedRouteId(id); setSelectedNodeId("start"); setTab("editor");
		};
		if (demoMode) { createLocal(crypto.randomUUID(), 1); toast.success("Draft route created"); return; }
		startTransition(async () => { try { const config = newConfig(); const created = await createDynamicRouteAction({ name: `Untitled route ${routes.length + 1}`, description: null, config }); createLocal(created.id, created.version); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create route"); } });
	}

	function saveRoute() {
		if (!selectedRoute) return;
		const saveLocal = (nextVersion = selectedRoute.version + 1) => replaceSelected((route) => {
			const savedAt = new Date().toISOString();
			return { ...route, version: nextVersion, updated_at: savedAt, versions: [{ version: nextVersion, status: "draft", created_at: savedAt }, ...(route.versions ?? []).filter((version) => version.version !== nextVersion).map((version) => version.status === "draft" ? { ...version, status: "superseded" as const } : version)] };
		});
		if (demoMode) { saveLocal(); toast.success("Draft version saved"); return; }
		startTransition(async () => { try { const [saved] = await Promise.all([updateDynamicRouteAction(selectedRoute.id, { name: selectedRoute.name, description: selectedRoute.description, status: selectedRoute.status, config: selectedRoute.config }), attachDynamicRouteKeysAction(selectedRoute.id, selectedRoute.keyIds)]); saveLocal(saved.version); toast.success("Draft version saved"); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save route"); } });
	}

	function deleteRoute() {
		if (!selectedRoute) return;
		const remove = () => { const remaining = routes.filter((route) => route.id !== selectedRoute.id); setRoutes(remaining); setSelectedRouteId(remaining[0]?.id ?? null); setSelectedNodeId(remaining[0]?.config.entryNodeId ?? null); };
		if (demoMode) { remove(); toast.success("Route deleted"); return; }
		startTransition(async () => { try { await deleteDynamicRouteAction(selectedRoute.id, selectedRoute.name); remove(); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete route"); } });
	}

	function deployVersion(version: number) {
		if (!selectedRoute) return;
		const deployLocal = () => replaceSelected((route) => ({ ...route, deployed_version: version, versions: (route.versions ?? []).map((item) => ({ ...item, status: item.version === version ? "deployed" as const : item.status === "deployed" ? "superseded" as const : item.status })) }));
		if (demoMode) { deployLocal(); toast.success(`Version ${version} deployed locally`); return; }
		startTransition(async () => { try { await deployDynamicRouteVersionAction(selectedRoute.id, version); deployLocal(); toast.success(`Version ${version} deployed`); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not deploy version"); } });
	}

	function renderEditorSurface(immersive = false) {
		return (
			<div className={cn("hidden min-h-0 grid-cols-[210px_minmax(0,1fr)_auto] border-b lg:grid", immersive ? "flex-1" : "h-[680px]")}>
				<aside className="overflow-y-auto border-r p-3">
					<p className="px-2 pb-2 text-sm font-semibold">Add a step</p>
					<div className="space-y-1">
						{(["condition", "percentage", "model", "rate_limit", "budget_limit", "end"] as DynamicRouteNodeType[]).map((type) => {
							const copy = NODE_COPY[type];
							const Icon = copy.icon;
							return <button key={type} draggable onDragStart={(event) => startPaletteDrag(event, type)} onDragEnd={finishPaletteDrag} onClick={() => appendPaletteNode(type)} title="Drag onto the canvas or click to append" className="flex w-full cursor-grab items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-muted active:cursor-grabbing"><div className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", copy.tone)}><Icon className="size-4" /></div><div><p className="text-sm font-medium">{copy.label}</p><p className="text-[11px] text-muted-foreground">{copy.description}</p></div></button>;
						})}
					</div>
					<div className="mt-5 border-t px-2 pt-4 text-xs leading-5 text-muted-foreground"><Braces className="mb-2 size-4" />Drag a step onto the canvas to place it freely, then connect its handles. Click to append it to the selected branch.</div>
				</aside>

				<main className="relative min-h-0 min-w-0 bg-background">
					<div className="absolute left-4 top-4 z-10 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur"><span className="font-medium">Drag to pan</span><span className="text-muted-foreground"> · Scroll to zoom · Connect node handles</span></div>
					<Button size="icon-sm" variant="outline" className="absolute right-4 top-4 z-10 bg-background" onClick={() => setInspectorOpen((open) => !open)} aria-label={inspectorOpen ? "Close inspector" : "Open inspector"}>{inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</Button>
					<ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onInit={setFlowInstance} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={dropPaletteNode} onNodeClick={(_, node) => { setSelectedNodeId(node.id); setInspectorOpen(true); }} onPaneClick={() => { setSelectedNodeId(null); setInspectorOpen(false); }} fitView fitViewOptions={{ padding: 0.25, minZoom: 0.65, maxZoom: 1 }} minZoom={0.4} maxZoom={1.6} panOnDrag selectionOnDrag={false} zoomOnDoubleClick={false} deleteKeyCode={["Backspace", "Delete"]}>
						<Background gap={22} size={1} color="var(--border)" /><Controls position="bottom-left" /><MiniMap position="bottom-right" pannable zoomable className="!border !bg-background/90" maskColor="color-mix(in srgb, var(--background) 72%, transparent)" />
					</ReactFlow>
				</main>

				{inspectorOpen ? <aside className="w-[360px] overflow-y-auto border-l">{selectedNode ? <NodeInspector node={selectedNode} providers={initialData.providers} update={(data) => updateNode(selectedNode.id, data)} remove={() => removeNode(selectedNode.id)} /> : <div className="p-6 text-sm text-muted-foreground">Select a node to configure it.</div>}</aside> : null}
			</div>
		);
	}

	if (!selectedRoute) return <div className="rounded-xl border border-dashed p-12 text-center"><Workflow className="mx-auto size-7 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">Create your first dynamic route</h2><p className="mt-2 text-sm text-muted-foreground">Branch on request context, split traffic and call the right model.</p><Button className="mt-5" onClick={createRoute}><Plus className="size-4" />New route</Button></div>;

	return (
		<section className="overflow-hidden rounded-xl border bg-background">
			<header className="border-b px-4 py-3 sm:px-5 sm:py-4">
				<div className="flex flex-wrap items-start gap-4">
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium text-muted-foreground">Route</p>
						<div className="mt-1 flex flex-wrap items-center gap-2">
							<div className="w-full min-w-0 sm:w-72"><StudioSelect ariaLabel="Editing route" value={selectedRoute.id} onChange={(routeId) => { const route = routes.find((item) => item.id === routeId); setSelectedRouteId(routeId); setSelectedNodeId(route?.config.entryNodeId ?? null); }} options={routes.map((route) => ({ value: route.id, label: route.name }))} /></div>
							<Badge variant="outline" className="h-6 capitalize">{selectedRoute.status}</Badge>
						</div>
						<p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{selectedRoute.description || "No route description"}</p>
						<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>{selectedRoute.keyIds.length} API key{selectedRoute.keyIds.length === 1 ? "" : "s"}</span><span aria-hidden="true">·</span><span>Version {selectedRoute.version}{selectedRoute.deployed_version === selectedRoute.version ? " deployed" : " draft"}</span></div>
					</div>
					<div className="flex shrink-0 items-center gap-2"><Button variant="outline" onClick={createRoute} aria-label="New route"><Plus className="size-4" /><span className="hidden sm:inline">New route</span></Button><Button variant="outline" onClick={() => { setTab("editor"); setFocusModeOpen(true); }} aria-label="Open focus mode"><Maximize2 className="size-4" /><span className="hidden sm:inline">Focus mode</span></Button><Button onClick={saveRoute} disabled={isPending}><Save className="size-4" /><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save version</span></Button></div>
				</div>
				<nav className="flex w-full gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Route sections">{([['editor','Flow'],['versions','Versions'],['settings','Configuration']] as const).map(([value,label]) => <button key={value} onClick={() => setTab(value)} className={cn("relative h-10 shrink-0 border-b-2 px-0.5 text-sm transition", tab === value ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>)}</nav>
			</header>

			{tab === "editor" && !focusModeOpen ? <>{renderEditorSurface()}<MobileFlowEditor nodes={routeNodes} edges={routeEdges} entryNodeId={config.entryNodeId} providers={initialData.providers} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} onAdd={addNode} onUpdate={updateNode} onRemove={removeNode} /></> : null}

			<Dialog open={focusModeOpen} onOpenChange={setFocusModeOpen}>
				<DialogContent showCloseButton={false} className="flex h-[92vh] max-h-[92vh] max-w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[92vw]">
					<div className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-5">
						<DialogHeader className="min-w-0 gap-0.5">
							<DialogTitle className="truncate text-sm font-semibold">{selectedRoute.name}</DialogTitle>
							<DialogDescription className="truncate text-xs">Focus mode · edit the route flow and node settings</DialogDescription>
						</DialogHeader>
						<DialogClose asChild><Button variant="outline" size="icon-sm" aria-label="Close focus mode"><X className="size-4" /></Button></DialogClose>
					</div>
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
						{renderEditorSurface(true)}
						<MobileFlowEditor nodes={routeNodes} edges={routeEdges} entryNodeId={config.entryNodeId} providers={initialData.providers} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} onAdd={addNode} onUpdate={updateNode} onRemove={removeNode} />
					</div>
				</DialogContent>
			</Dialog>

			{tab === "versions" ? <div className="mx-auto max-w-4xl p-8"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Version history</h2><p className="mt-1 text-sm text-muted-foreground">Every save creates an immutable draft. Deploy or roll back without rebuilding the flow.</p></div><Button onClick={() => deployVersion(selectedRoute.version)}><Rocket className="size-4" />Deploy v{selectedRoute.version}</Button></div><div className="mt-6 divide-y rounded-xl border">{(selectedRoute.versions?.length ? selectedRoute.versions : [{ version: selectedRoute.version, status: "draft" as const, created_at: selectedRoute.updated_at }]).map((version) => <div key={`${version.version}-${version.created_at}`} className="flex items-center gap-4 p-4"><div className="grid size-9 place-items-center rounded-lg bg-muted"><History className="size-4" /></div><div className="flex-1"><div className="flex items-center gap-2"><p className="text-sm font-medium">Version {version.version}</p><Badge variant="outline">{version.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString()}</p></div>{version.status !== "deployed" ? <Button size="sm" variant="outline" onClick={() => deployVersion(version.version)}>Deploy</Button> : <span className="flex items-center gap-1 text-xs text-emerald-500"><Check className="size-3.5" />Live</span>}</div>)}</div></div> : null}

			{tab === "settings" ? <div className="mx-auto grid max-w-4xl gap-8 p-8 md:grid-cols-2"><div className="space-y-5"><div><h2 className="text-lg font-semibold">Route details</h2><p className="mt-1 text-sm text-muted-foreground">Name, lifecycle and request affinity.</p></div><div className="space-y-2"><Label>Name</Label><Input value={selectedRoute.name} onChange={(event) => replaceSelected((route) => ({ ...route, name: event.target.value }))} /></div><div className="space-y-2"><Label>Description</Label><Textarea value={selectedRoute.description ?? ""} onChange={(event) => replaceSelected((route) => ({ ...route, description: event.target.value }))} /></div><div className="flex items-center justify-between rounded-lg border p-4"><div><p className="text-sm font-medium">Cache-aware routing</p><p className="text-xs text-muted-foreground">Keep cache-producing requests on one provider for 15 minutes.</p></div><Switch checked={config.cacheAwareRouting !== false} onCheckedChange={(cacheAwareRouting) => updateConfig((current) => ({ ...current, cacheAwareRouting }))} /></div><div className="flex items-center justify-between rounded-lg border p-4"><div><p className="text-sm font-medium">Session affinity</p><p className="text-xs text-muted-foreground">Preserve provider affinity for cached sessions.</p></div><Switch checked={config.sessionAffinity !== false} onCheckedChange={(sessionAffinity) => updateConfig((current) => ({ ...current, sessionAffinity }))} /></div></div><div><div><h2 className="text-lg font-semibold">Attach API keys</h2><p className="mt-1 text-sm text-muted-foreground">Requests authenticated with these keys enter this route.</p></div><div className="mt-5 space-y-2">{initialData.keys.map((key) => { const active = selectedRoute.keyIds.includes(key.id); return <button key={key.id} onClick={() => replaceSelected((route) => ({ ...route, keyIds: active ? route.keyIds.filter((id) => id !== key.id) : [...route.keyIds, key.id] }))} className={cn("flex w-full items-center gap-3 rounded-lg border p-3 text-left", active && "border-primary bg-primary/5")}><KeyRound className="size-4" /><div className="flex-1"><p className="text-sm font-medium">{key.name}</p><p className="text-xs text-muted-foreground">{key.prefix}</p></div>{active ? <Check className="size-4 text-primary" /> : null}</button>; })}</div><Button variant="destructive" className="mt-8" onClick={deleteRoute}><Trash2 className="size-4" />Delete route</Button></div></div> : null}

		</section>
	);
}
