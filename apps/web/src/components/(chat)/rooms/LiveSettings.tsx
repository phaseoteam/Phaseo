import { useTranslations, useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Verified 2026-09-11: https://developers.openai.com/api/docs/guides/live-conversations#voice-options
// Regional influence describes style, not guaranteed accent fidelity. Leave
// voices without documented Live profiles undescribed; do not infer from TTS.
export const LIVE_VOICE_OPTIONS: Array<{ id: string; label: string; description?: string }> = [
	{ id: "alloy", label: "Alloy" },
	{ id: "ash", label: "Ash" },
	{ id: "ballad", label: "Ballad" },
	{ id: "beacon", label: "Beacon", description: "English · Filipino-influenced · Masculine" },
	{ id: "bossa", label: "Bossa", description: "Portuguese · Brazilian-influenced · Feminine" },
	{ id: "cedar", label: "Cedar" },
	{ id: "cinder", label: "Cinder", description: "English · Southern U.S.-influenced · Masculine" },
	{ id: "coral", label: "Coral" },
	{ id: "delta", label: "Delta", description: "English · Southern U.S.-influenced · Feminine" },
	{ id: "echo", label: "Echo" },
	{ id: "gleam", label: "Gleam", description: "English · North American-influenced · Feminine" },
	{ id: "marin", label: "Marin" },
	{ id: "meridian", label: "Meridian", description: "English · North American-influenced · Masculine" },
	{ id: "quartz", label: "Quartz", description: "English · Australian-influenced · Feminine" },
	{ id: "ripple", label: "Ripple", description: "English · Australian-influenced · Masculine" },
	{ id: "sage", label: "Sage" },
	{ id: "shimmer", label: "Shimmer" },
	{ id: "stone", label: "Stone", description: "English · Irish-influenced · Masculine" },
	{ id: "tempo", label: "Tempo", description: "Portuguese · Brazilian-influenced · Masculine" },
	{ id: "verse", label: "Verse" },
	{ id: "vesper", label: "Vesper", description: "English · British-influenced · Masculine" },
	{ id: "willow", label: "Willow", description: "English · Irish-influenced · Feminine" },
];

export type LiveSettingsValue = {
	instructions: string; max_output_tokens: number;
	reasoning_effort?: string; reasoning_summary?: string; verbosity?: string;
	service_tier: string; web_search: boolean; tool_choice: string; parallel_tool_calls: boolean;
};
export const DEFAULT_LIVE_SETTINGS: LiveSettingsValue = {
	instructions: "Answer the user's request accurately and concisely for a spoken conversation. Return verified facts and task status. Do not claim to have performed actions without a tool result.",
	max_output_tokens: 4096, service_tier: "default", web_search: false, tool_choice: "auto", parallel_tool_calls: true,
};

export function LiveSettings({ value, onChange }: { value: LiveSettingsValue; onChange: (value: LiveSettingsValue) => void }) {
	const tCopy = useTranslations("SettingsUI.chatGaps");
	const optionLabel = (option: string) => ({ none: tCopy("copyNone"), low: tCopy("copyLow"), medium: tCopy("copyMedium"), high: tCopy("copyHigh"), xhigh: tCopy("copyExtraHigh"), auto: tCopy("copyAuto"), concise: tCopy("copyConcise"), detailed: tCopy("copyDetailed"), default: tCopy("copyDefault"), flex: "Flex", priority: tCopy("copyPriority"), required: tCopy("copyRequired") } as Record<string, string>)[option] ?? option;
	const selectors: Array<{ key: "reasoning_effort" | "reasoning_summary" | "verbosity" | "service_tier" | "tool_choice"; label: string; options: string[]; defaultLabel?: string }> = [
		{ key: "reasoning_effort", label: tCopy("copyReasoningEffort"), options: ["none", "low", "medium", "high", "xhigh"], defaultLabel: tCopy("modelDefault") },
		{ key: "reasoning_summary", label: tCopy("reasoningSummary"), options: ["auto", "concise", "detailed"], defaultLabel: tCopy("copyOff") },
		{ key: "verbosity", label: tCopy("backendDetail"), options: ["low", "medium", "high"], defaultLabel: tCopy("modelDefault") },
		{ key: "service_tier", label: tCopy("copyServiceTier"), options: ["default", "flex", "priority"] },
		{ key: "tool_choice", label: tCopy("toolChoice"), options: value.web_search ? ["auto", "none", "required"] : ["auto", "none"] },
	];
	return <section className="grid gap-4 rounded-lg border p-3" aria-label={tCopy("liveSettings")}>
		<div><h3 className="text-sm font-semibold">{tCopy("responsesDelegation")}</h3>
			<p className="text-xs text-muted-foreground">{tCopy("backendBilling")}</p></div>
		<div className="grid gap-2"><Label htmlFor="live-backend-instructions">{tCopy("backendInstructions")}</Label>
			<Textarea id="live-backend-instructions" value={value.instructions} maxLength={16000} className="min-h-28"
				onChange={(event) => onChange({ ...value, instructions: event.target.value })} /></div>
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{selectors.map(({ key, label, options, defaultLabel }) => <div className="grid gap-2" key={key}>
				<Label htmlFor={`live-${key}`}>{label}</Label>
				<Select value={value[key] ?? "unset"} onValueChange={(selected) => onChange({ ...value, [key]: selected === "unset" ? undefined : selected })}>
					<SelectTrigger id={`live-${key}`} className="w-full"><SelectValue>{value[key] ? optionLabel(value[key]) : defaultLabel}</SelectValue></SelectTrigger>
					<SelectContent>{defaultLabel ? <SelectItem value="unset">{defaultLabel}</SelectItem> : null}
						{options.map((option) => <SelectItem key={option} value={option}>{optionLabel(option)}</SelectItem>)}</SelectContent>
				</Select></div>)}
			<div className="grid gap-2"><Label htmlFor="live-output-limit">{tCopy("outputLimit")}</Label>
				<Input id="live-output-limit" type="number" min={16} max={32768} step={1} value={value.max_output_tokens}
					onChange={(event) => onChange({ ...value, max_output_tokens: Number(event.target.value) })} /></div>
		</div>
		<div className="flex items-center justify-between gap-3"><Label htmlFor="live-web-search">{tCopy("copyWebSearch")}</Label>
			<Switch id="live-web-search" checked={value.web_search} onCheckedChange={(checked) => onChange({ ...value, web_search: checked,
				tool_choice: !checked && value.tool_choice === "required" ? "auto" : value.tool_choice })} /></div>
		<div className="flex items-center justify-between gap-3"><Label htmlFor="live-parallel-tools">{tCopy("parallelTools")}</Label>
			<Switch id="live-parallel-tools" checked={value.parallel_tool_calls} disabled={!value.web_search}
				onCheckedChange={(checked) => onChange({ ...value, parallel_tool_calls: checked })} /></div>
		<p className="text-xs text-muted-foreground">{tCopy("searchBilling")}</p>
	</section>;
}

export type LiveUsageView = {
	input_tokens?: number; cached_read_text_tokens?: number; cached_write_text_tokens?: number;
	output_tokens?: number; output_reasoning_tokens?: number; native_web_search_requests?: number;
	live_responses?: Array<{ id: string; delegation_id?: string; status: string; model?: string; service_tier?: string;
		usage: Record<string, number> }>;
};

export function LiveUsageDetails({ usage, pending }: { usage?: LiveUsageView; pending?: number }) {
	const tCopy = useTranslations("SettingsUI.chatGaps");
	const locale = useLocale();
	const responseStatus: Record<string, string> = { completed: tCopy("copyCompleted"), failed: tCopy("copyFailed"), incomplete: tCopy("incomplete"), in_progress: tCopy("copyInProgress"), cancelled: tCopy("copyCancelled"), queued: tCopy("copyQueued") };
	const tiers: Record<string, string> = { default: tCopy("copyDefault"), priority: tCopy("copyPriority"), flex: "Flex" };
	if (!usage) return null;
	return <Collapsible className="w-full min-w-0 rounded-lg border text-xs">
		<CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
			<span className="flex-1 text-sm font-medium">{tCopy("delegationUsage")}</span>
			{pending ? <span className="text-muted-foreground">{tCopy("runningCount", { count: pending })}</span> : null}
			<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none" />
		</CollapsibleTrigger>
		<CollapsibleContent keepMounted>
		<ScrollArea className="border-t" viewportClassName="max-h-64 overscroll-contain" viewportProps={{ role: "region", "aria-label": tCopy("delegationUsageDetails"), tabIndex: 0 }}>
		<div className="px-4 py-3">
		<dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
			{[[tCopy("copyInputTokens"), usage.input_tokens], [tCopy("copyCacheReads"), usage.cached_read_text_tokens], [tCopy("copyCacheWrites"), usage.cached_write_text_tokens],
				[tCopy("copyOutputTokens"), usage.output_tokens], [tCopy("reasoningIncluded"), usage.output_reasoning_tokens], [tCopy("webSearches"), usage.native_web_search_requests]]
				.map(([label, count]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{Number(count ?? 0).toLocaleString(locale)}</dd></div>)}
		</dl>
		{usage.live_responses?.map((response) => <div key={response.id} className="mt-3 border-t pt-2">
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
				<p className="font-medium">{responseStatus[response.status.replace("response.", "")] ?? response.status} · {tiers[response.service_tier ?? "default"] ?? response.service_tier}</p>
				<p className="tabular-nums text-muted-foreground">{tCopy("inputOutput", { input: response.usage.input_tokens ?? 0, output: response.usage.output_tokens ?? 0 })}</p>
			</div>
			<p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{response.id}</p>
		</div>)}
		</div>
		</ScrollArea>
		</CollapsibleContent>
	</Collapsible>;
}
