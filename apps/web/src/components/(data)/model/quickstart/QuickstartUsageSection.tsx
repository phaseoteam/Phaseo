"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	Check,
	Copy,
	Gauge,
	Layers,
	Shuffle,
	TerminalSquare,
	type LucideIcon,
	Zap,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	codeToHtmlBoth,
	type ShikiLang,
} from "@/components/(data)/model/quickstart/shiki";
import {
	ALL_PARAMETERS_DOCS_HREF,
	getParameterDocsHref,
	getParameterReference,
} from "@/lib/parameters/reference";
import { cn } from "@/lib/utils";

type LanguageFamilyOption = {
	id: string;
	label: string;
	options: Array<{ value: string; label: string }>;
};

type QuickstartVisual =
	| { kind: "logo"; logoId: string; alt: string }
	| { kind: "icon"; icon: LucideIcon; className?: string };

type ServiceTierOption = {
	value: "standard" | "priority" | "flex" | "batch";
	label: string;
	disabled?: boolean;
	hint?: string;
};

const SERVICE_TIER_OPTIONS: ServiceTierOption[] = [
	{ value: "standard", label: "Standard" },
	{ value: "priority", label: "Priority" },
	{ value: "flex", label: "Flex" },
	{ value: "batch", label: "Batch", disabled: true, hint: "Coming soon" },
];

type QuickstartUsageSectionProps = {
	modelIdentifierInCode: string;
	acceptedIdentifiers: string[];
	onSelectModelIdentifier: (value: string) => void;
	supportedParameters: Array<{
		param_id: string;
		provider_count_supported: number;
		provider_count_total: number;
		support_level: "all_providers" | "some_providers";
		providers: Array<{
			api_provider_id: string;
			api_provider_name: string;
			supported: boolean;
		}>;
	}>;
	selectedEndpointLabel: string;
	selectedEndpointValue: string;
	endpointOptions: Array<{ value: string; label: string }>;
	selectedLanguage: string;
	selectedLanguageLabel?: string;
	selectedLanguageFamilyId: string;
	availableLanguageFamilies: LanguageFamilyOption[];
	secondaryLanguageOptions: Array<{ value: string; label: string }>;
	supportsStreaming: boolean;
	supportsServiceTier: boolean;
	streamingEnabled: boolean;
	selectedServiceTier: "standard" | "priority" | "flex";
	requestModeLabel?: string;
	serviceTierDocsHref?: string | null;
	streamingDocsHref?: string | null;
	docsLinks: Array<{ label: string; href: string }>;
	onSelectEndpoint: (value: string) => void;
	onSelectLanguageFamily: (familyId: string) => void;
	onSelectLanguage: (value: string) => void;
	onSelectServiceTier: (value: "standard" | "priority" | "flex") => void;
	onToggleStreaming: (enabled: boolean) => void;
	curlQuickstart: string;
	typescriptSdkUsage: string | null;
	aiSdkUsage: string | null;
	agentSdkTsUsage: string | null;
	agentSdkPythonUsage: string | null;
	agentSdkGoUsage: string | null;
	agentSdkCsharpUsage: string | null;
	agentSdkPhpUsage: string | null;
	agentSdkRubyUsage: string | null;
	pythonSdkUsage: string | null;
	goSdkUsage: string;
	csharpSdkUsage: string;
	phpSdkUsage: string;
	rubySdkUsage: string;
	nodeFetchQuickstart: string;
	nodeFetchStreamingQuickstart: string;
	pythonRequestsQuickstart: string;
	pythonRequestsStreamingQuickstart: string;
	openaiPythonUsage: string | null;
	openaiNodeUsage: string | null;
	anthropicPythonUsage: string | null;
	anthropicNodeUsage: string | null;
};

function getLanguageOptionVisual(value: string): QuickstartVisual {
	if (value === "ai-sdk") {
		return { kind: "logo", logoId: "vercel", alt: "Vercel" };
	}

	if (
		value === "typescript-sdk" ||
		value === "python-sdk" ||
		value === "go-sdk" ||
		value === "csharp-sdk" ||
		value === "php-sdk" ||
		value === "ruby-sdk" ||
		value === "agent-sdk-ts" ||
		value === "agent-sdk-python" ||
		value === "agent-sdk-go" ||
		value === "agent-sdk-csharp" ||
		value === "agent-sdk-php" ||
		value === "agent-sdk-ruby"
	) {
		return { kind: "logo", logoId: "ai-stats", alt: "Phaseo" };
	}

	if (value === "openai-node" || value === "openai-python") {
		return { kind: "logo", logoId: "openai", alt: "OpenAI" };
	}

	if (value === "anthropic-node" || value === "anthropic-python") {
		return { kind: "logo", logoId: "anthropic", alt: "Anthropic" };
	}

	return { kind: "icon", icon: TerminalSquare };
}

function getLanguageFamilyVisual(familyId: string): QuickstartVisual {
	switch (familyId) {
		case "typescript":
			return { kind: "logo", logoId: "typescript", alt: "TypeScript" };
		case "python":
			return { kind: "logo", logoId: "python", alt: "Python" };
		case "go":
			return { kind: "logo", logoId: "go", alt: "Go" };
		case "csharp":
			return { kind: "logo", logoId: "csharp", alt: "C#" };
		case "php":
			return { kind: "logo", logoId: "php", alt: "PHP" };
		case "ruby":
			return { kind: "logo", logoId: "ruby", alt: "Ruby" };
		default:
			return { kind: "icon", icon: TerminalSquare };
	}
}

function getServiceTierVisual(tier: ServiceTierOption["value"]): QuickstartVisual {
	switch (tier) {
		case "priority":
			return {
				kind: "icon",
				icon: Zap,
				className: "text-violet-600 dark:text-violet-300",
			};
		case "flex":
			return {
				kind: "icon",
				icon: Shuffle,
				className: "text-emerald-600 dark:text-emerald-300",
			};
		case "batch":
			return {
				kind: "icon",
				icon: Layers,
				className: "text-orange-600 dark:text-orange-300",
			};
		case "standard":
		default:
			return {
				kind: "icon",
				icon: Gauge,
				className: "text-muted-foreground",
			};
	}
}

function OptionVisual({ visual }: { visual: QuickstartVisual }) {
	if (visual.kind === "logo") {
		return (
			<span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
				<Logo
					id={visual.logoId}
					alt={visual.alt}
					width={16}
					height={16}
					className="object-contain"
				/>
			</span>
		);
	}

	const Icon = visual.icon;

	return (
		<Icon
			className={cn(
				"h-3.5 w-3.5 shrink-0 text-muted-foreground",
				visual.className,
			)}
		/>
	);
}

function OptionLabel({
	label,
	visual,
}: {
	label: string;
	visual: QuickstartVisual;
}) {
	return (
		<span className="inline-flex min-w-0 items-center gap-2">
			<OptionVisual visual={visual} />
			<span className="truncate">{label}</span>
		</span>
	);
}

const PARAMETER_PRIORITY = [
	"temperature",
	"top_p",
	"top_k",
	"max_tokens",
	"max_completion_tokens",
	"frequency_penalty",
	"presence_penalty",
	"repetition_penalty",
	"seed",
	"stream",
	"stop",
	"logprobs",
	"tool_choice",
	"tools",
	"parallel_tool_calls",
	"response_format",
	"structured_outputs",
	"json_schema",
	"reasoning",
	"reasoning_effort",
	"reasoning_tokens",
	"include_reasoning",
] as const;

const PARAMETER_PRIORITY_INDEX = new Map<string, number>(
	PARAMETER_PRIORITY.map((paramId, index) => [paramId, index]),
);
function sortSupportedParameters(
	parameters: QuickstartUsageSectionProps["supportedParameters"],
) {
	return [...parameters].sort((a, b) => {
		if (a.provider_count_supported !== b.provider_count_supported) {
			return b.provider_count_supported - a.provider_count_supported;
		}

		const aPriority =
			PARAMETER_PRIORITY_INDEX.get(a.param_id) ?? Number.MAX_SAFE_INTEGER;
		const bPriority =
			PARAMETER_PRIORITY_INDEX.get(b.param_id) ?? Number.MAX_SAFE_INTEGER;

		if (aPriority !== bPriority) {
			return aPriority - bPriority;
		}

		return a.param_id.localeCompare(b.param_id);
	});
}

function MiniCopyButton({
	content,
	label = "Copy",
}: {
	content: string;
	label?: string;
}) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 1800);
		return () => window.clearTimeout(timer);
	}, [copied]);

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className="h-8 rounded-lg gap-1.5 px-2.5 text-xs"
			onClick={async () => {
				await navigator.clipboard.writeText(content);
				setCopied(true);
			}}
		>
			{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
			{copied ? "Copied" : label}
		</Button>
	);
}

function PlainCode({ code }: { code: string }) {
	return (
		<pre className="overflow-x-auto p-4 text-sm">
			<code>{code}</code>
		</pre>
	);
}

function RequestCodePane({
	code,
	lang,
}: {
	code: string;
	lang: ShikiLang;
}) {
	const [lightHtml, setLightHtml] = useState<string | null>(null);
	const [darkHtml, setDarkHtml] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let mounted = true;

		async function highlight() {
			try {
				const res = await codeToHtmlBoth(code, lang);
				if (mounted) {
					setLightHtml(res.light);
					setDarkHtml(res.dark);
					setError(false);
				}
			} catch (err) {
				console.error("[Shiki] quickstart highlight failed:", err);
				if (mounted) {
					setError(true);
				}
			}
		}

		highlight();

		return () => {
			mounted = false;
		};
	}, [code, lang]);

	return (
		<div className="overflow-x-auto p-4 text-sm">
			{!error && lightHtml && darkHtml ? (
				<>
					<div
						className="block dark:hidden [&_.shiki]:bg-transparent! [&_.shiki]:m-0! [&_.shiki]:p-0!"
						dangerouslySetInnerHTML={{ __html: lightHtml }}
					/>
					<div
						className="hidden dark:block [&_.shiki]:bg-transparent! [&_.shiki]:m-0! [&_.shiki]:p-0!"
						dangerouslySetInnerHTML={{ __html: darkHtml }}
					/>
				</>
			) : (
				<PlainCode code={code} />
			)}
		</div>
	);
}

export function QuickstartUsageSection({
	modelIdentifierInCode,
	acceptedIdentifiers,
	onSelectModelIdentifier,
	supportedParameters,
	selectedEndpointLabel,
	selectedEndpointValue,
	endpointOptions,
	selectedLanguage,
	selectedLanguageFamilyId,
	availableLanguageFamilies,
	secondaryLanguageOptions,
	supportsStreaming,
	supportsServiceTier,
	streamingEnabled,
	selectedServiceTier,
	docsLinks,
	onSelectEndpoint,
	onSelectLanguageFamily,
	onSelectLanguage,
	onSelectServiceTier,
	onToggleStreaming,
	curlQuickstart,
	typescriptSdkUsage,
	aiSdkUsage,
	agentSdkTsUsage,
	agentSdkPythonUsage,
	agentSdkGoUsage,
	agentSdkCsharpUsage,
	agentSdkPhpUsage,
	agentSdkRubyUsage,
	pythonSdkUsage,
	goSdkUsage,
	csharpSdkUsage,
	phpSdkUsage,
	rubySdkUsage,
	nodeFetchQuickstart,
	nodeFetchStreamingQuickstart,
	pythonRequestsQuickstart,
	pythonRequestsStreamingQuickstart,
	openaiPythonUsage,
	openaiNodeUsage,
	anthropicPythonUsage,
	anthropicNodeUsage,
}: QuickstartUsageSectionProps) {
	const shouldStream = supportsStreaming && streamingEnabled;
	const selectedLanguageFamilyLabel =
		availableLanguageFamilies.find((family) => family.id === selectedLanguageFamilyId)
			?.label ?? "Language";
	const selectedLanguageFamilyVisual =
		getLanguageFamilyVisual(selectedLanguageFamilyId);
	const selectedExampleTypeLabel =
		secondaryLanguageOptions.find((option) => option.value === selectedLanguage)
			?.label ?? "Example type";
	const selectedExampleTypeVisual = getLanguageOptionVisual(selectedLanguage);
	const selectedServiceTierLabel =
		SERVICE_TIER_OPTIONS.find((option) => option.value === selectedServiceTier)
			?.label ?? "Service tier";
	const selectedServiceTierVisual = getServiceTierVisual(selectedServiceTier);
	const sortedSupportedParameters = useMemo(
		() => sortSupportedParameters(supportedParameters),
		[supportedParameters],
	);

	const requestExample = useMemo((): { code: string; lang: ShikiLang } => {
		if (selectedLanguage === "curl") {
			return { code: curlQuickstart, lang: "bash" };
		}
		if (selectedLanguage === "typescript-sdk" && typescriptSdkUsage) {
			return { code: typescriptSdkUsage, lang: "ts" };
		}
		if (selectedLanguage === "ai-sdk" && aiSdkUsage) {
			return { code: aiSdkUsage, lang: "ts" };
		}
		if (selectedLanguage === "agent-sdk-ts" && agentSdkTsUsage) {
			return { code: agentSdkTsUsage, lang: "ts" };
		}
		if (selectedLanguage === "agent-sdk-python" && agentSdkPythonUsage) {
			return { code: agentSdkPythonUsage, lang: "python" };
		}
		if (selectedLanguage === "agent-sdk-go" && agentSdkGoUsage) {
			return { code: agentSdkGoUsage, lang: "go" };
		}
		if (selectedLanguage === "agent-sdk-csharp" && agentSdkCsharpUsage) {
			return { code: agentSdkCsharpUsage, lang: "csharp" };
		}
		if (selectedLanguage === "agent-sdk-php" && agentSdkPhpUsage) {
			return { code: agentSdkPhpUsage, lang: "php" };
		}
		if (selectedLanguage === "agent-sdk-ruby" && agentSdkRubyUsage) {
			return { code: agentSdkRubyUsage, lang: "ruby" };
		}
		if (selectedLanguage === "python-sdk" && pythonSdkUsage) {
			return { code: pythonSdkUsage, lang: "python" };
		}
		if (selectedLanguage === "go-sdk") {
			return { code: goSdkUsage, lang: "go" };
		}
		if (selectedLanguage === "csharp-sdk") {
			return { code: csharpSdkUsage, lang: "csharp" };
		}
		if (selectedLanguage === "php-sdk") {
			return { code: phpSdkUsage, lang: "php" };
		}
		if (selectedLanguage === "ruby-sdk") {
			return { code: rubySdkUsage, lang: "ruby" };
		}
		if (selectedLanguage === "node-fetch") {
			return {
				code: shouldStream ? nodeFetchStreamingQuickstart : nodeFetchQuickstart,
				lang: "ts",
			};
		}
		if (selectedLanguage === "python-requests") {
			return {
				code: shouldStream
					? pythonRequestsStreamingQuickstart
					: pythonRequestsQuickstart,
				lang: "python",
			};
		}
		if (selectedLanguage === "openai-python" && openaiPythonUsage) {
			return { code: openaiPythonUsage, lang: "python" };
		}
		if (selectedLanguage === "openai-node" && openaiNodeUsage) {
			return { code: openaiNodeUsage, lang: "ts" };
		}
		if (selectedLanguage === "anthropic-python" && anthropicPythonUsage) {
			return { code: anthropicPythonUsage, lang: "python" };
		}
		if (selectedLanguage === "anthropic-node" && anthropicNodeUsage) {
			return { code: anthropicNodeUsage, lang: "ts" };
		}
		return { code: curlQuickstart, lang: "bash" };
	}, [
		agentSdkCsharpUsage,
		agentSdkGoUsage,
		agentSdkPhpUsage,
		agentSdkPythonUsage,
		agentSdkRubyUsage,
		agentSdkTsUsage,
		aiSdkUsage,
		anthropicNodeUsage,
		anthropicPythonUsage,
		csharpSdkUsage,
		curlQuickstart,
		goSdkUsage,
		nodeFetchQuickstart,
		nodeFetchStreamingQuickstart,
		openaiNodeUsage,
		openaiPythonUsage,
		phpSdkUsage,
		pythonRequestsQuickstart,
		pythonRequestsStreamingQuickstart,
		pythonSdkUsage,
		rubySdkUsage,
		selectedLanguage,
		shouldStream,
		typescriptSdkUsage,
	]);

	return (
		<div className="space-y-3">
			<div className="overflow-hidden rounded-xl border border-border/70 bg-card">
				<div className="flex flex-col gap-3 px-3 py-3 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex flex-wrap items-center gap-3">
						<div className="w-full sm:w-[168px]">
							<Select
								value={selectedEndpointValue}
								onValueChange={onSelectEndpoint}
							>
								<SelectTrigger className="h-8 rounded-lg text-xs">
									<SelectValue placeholder={selectedEndpointLabel}>
										{selectedEndpointLabel}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel className="text-[11px] tracking-[0.04em] text-muted-foreground">
											Endpoint
										</SelectLabel>
										<SelectSeparator />
										{endpointOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<div className="w-full sm:w-[140px]">
							<Select
								value={selectedLanguageFamilyId}
								onValueChange={onSelectLanguageFamily}
							>
								<SelectTrigger className="h-8 rounded-lg text-xs">
									<SelectValue placeholder="Language">
										<OptionLabel
											label={selectedLanguageFamilyLabel}
											visual={selectedLanguageFamilyVisual}
										/>
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel className="text-[11px] tracking-[0.04em] text-muted-foreground">
											Language
										</SelectLabel>
										<SelectSeparator />
										{availableLanguageFamilies.map((family) => (
											<SelectItem key={family.id} value={family.id}>
												<OptionLabel
													label={family.label}
													visual={getLanguageFamilyVisual(family.id)}
												/>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<div className="w-full max-w-full sm:w-fit">
							<Select value={selectedLanguage} onValueChange={onSelectLanguage}>
								<SelectTrigger className="h-8 w-fit min-w-[168px] max-w-full rounded-lg text-xs">
									<SelectValue placeholder="Example type">
										<OptionLabel
											label={selectedExampleTypeLabel}
											visual={selectedExampleTypeVisual}
										/>
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel className="text-[11px] tracking-[0.04em] text-muted-foreground">
											Example type
										</SelectLabel>
										<SelectSeparator />
										{secondaryLanguageOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												<OptionLabel
													label={option.label}
													visual={getLanguageOptionVisual(option.value)}
												/>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="flex w-full flex-wrap items-center gap-2.5 xl:w-auto xl:justify-end">
						{supportsServiceTier ? (
							<div className="w-full sm:w-[148px]">
								<Select
									value={selectedServiceTier}
									onValueChange={(value) =>
										onSelectServiceTier(value as "standard" | "priority" | "flex")
									}
								>
									<SelectTrigger className="h-8 rounded-lg text-xs">
										<SelectValue placeholder="Service tier">
											<OptionLabel
												label={selectedServiceTierLabel}
												visual={selectedServiceTierVisual}
											/>
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectLabel className="text-[11px] tracking-[0.04em] text-muted-foreground">
												Service tier
											</SelectLabel>
											<SelectSeparator />
											{SERVICE_TIER_OPTIONS.map((option) => (
												<SelectItem
													key={option.value}
													value={option.value}
													disabled={option.disabled}
													title={option.hint}
												>
													<div className="flex w-full items-center justify-between gap-3">
														<OptionLabel
															label={option.label}
															visual={getServiceTierVisual(option.value)}
														/>
														{option.hint ? (
															<span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
																{option.hint}
															</span>
														) : null}
													</div>
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>
						) : null}
						<div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-1.5">
							<Switch
								checked={streamingEnabled}
								onCheckedChange={onToggleStreaming}
								disabled={!supportsStreaming}
							/>
							<span className="text-xs font-medium">
								{supportsStreaming ? "Streaming" : "No stream"}
							</span>
						</div>
						<div className="ml-auto">
							<MiniCopyButton content={requestExample.code} />
						</div>
					</div>
				</div>
				<Separator />
				<RequestCodePane code={requestExample.code} lang={requestExample.lang} />
				<Separator />
				<div className="flex flex-col gap-2 px-3 py-3">
					<div className="flex items-center justify-between gap-3">
						<span className="text-xs font-medium text-muted-foreground">
							Accepted IDs
						</span>
						<span className="text-xs text-muted-foreground">
							Click to use and copy
						</span>
					</div>
					{acceptedIdentifiers.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{acceptedIdentifiers.map((identifier) => {
								const isActiveModelId = identifier === modelIdentifierInCode;
								return (
									<Button
										key={identifier}
										type="button"
										variant="outline"
										size="sm"
										className="h-auto min-h-8 max-w-full justify-start gap-2 rounded-md px-2.5 py-1.5 font-mono text-xs"
										onClick={async () => {
											onSelectModelIdentifier(identifier);
											await navigator.clipboard.writeText(identifier);
											toast.success("Updated model ID", {
												description: identifier,
											});
										}}
									>
										<span className="truncate">{identifier}</span>
										{isActiveModelId ? (
											<span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
												<Check className="h-2.5 w-2.5" />
											</span>
										) : null}
									</Button>
								);
							})}
						</div>
					) : (
						<p className="text-xs text-muted-foreground">
							Use the model ID shown in the request example above.
						</p>
					)}
				</div>
				<Separator />
				{sortedSupportedParameters.length > 0 ? (
					<>
						<div className="flex flex-col gap-3 px-3 py-3">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="space-y-1">
									<p className="text-xs font-medium text-muted-foreground">
										Parameters
									</p>
									<p className="text-xs text-muted-foreground">
										Aggregated across active providers for the{" "}
										{selectedEndpointLabel.toLowerCase()} route.
									</p>
									<p className="text-xs text-muted-foreground">
										Routing will select a compatible provider when a
										parameter narrows availability, so this list stays
										model-facing instead of provider-facing.
									</p>
								</div>
								<Link
									href={ALL_PARAMETERS_DOCS_HREF}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
								>
									View all parameters
								</Link>
							</div>
							<div className="overflow-hidden rounded-lg border border-border/70">
								<Table className="text-xs">
									<TableHeader>
										<TableRow className="hover:bg-transparent">
											<TableHead className="h-9 px-3">Parameter</TableHead>
											<TableHead className="h-9 px-3">Description</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{sortedSupportedParameters.map((parameter) => {
											const reference = getParameterReference(
												parameter.param_id,
											);

											return (
												<TableRow key={parameter.param_id}>
													<TableCell className="px-3 py-2">
														<Link
															href={getParameterDocsHref(parameter.param_id)}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex text-foreground underline underline-offset-4 hover:text-foreground/80"
														>
															<code className="font-mono text-[11px]">
																{parameter.param_id}
															</code>
														</Link>
													</TableCell>
													<TableCell className="px-3 py-2 align-top text-muted-foreground">
														{reference.description}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						</div>
						<Separator />
					</>
				) : null}
				{docsLinks.length > 0 ? (
					<div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
						<span>Docs:</span>
						{docsLinks.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								className="underline underline-offset-4 hover:text-foreground"
							>
								{link.label}
							</Link>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}
