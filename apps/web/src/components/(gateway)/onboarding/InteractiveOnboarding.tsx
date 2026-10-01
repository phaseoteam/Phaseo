"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
	Check,
	Code2,
	KeyRound,
	Loader2,
	RefreshCw,
	Send,
	X,
} from "lucide-react";
import { toast } from "sonner";
import {
	createOnboardingApiKeyAction,
	saveOnboardingProgressAction,
} from "@/app/(dashboard)/onboarding/actions";
import { CodeBlock as HighlightedCodeBlock } from "@/components/ai-elements/code-block";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CopyButton } from "@/components/ui/copy-button";
import { SecretRevealActions } from "@/components/(gateway)/settings/keys/SecretRevealActions";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { captureProductEvent } from "@/lib/productAnalytics";

export type OnboardingWorkspace = {
	id: string;
	name: string;
	role: string;
};

export type OnboardingModel = {
	id: string;
	name: string;
	providerName: string;
	organisationId: string;
	organisationName: string;
	capabilities: string[];
	featured?: boolean;
};

type StepId = "api-key" | "models" | "request";
type RestCodeExample = {
	method: "GET" | "POST";
	endpoint: string;
	code: string;
};
type PromptOption = {
	id: string;
	codeMessage: string;
};
type ResponseView = "parsed" | "object";

const STEPS: Array<{ id: StepId; titleKey: string }> = [
	{ id: "api-key", titleKey: "steps.createKey" },
	{ id: "models", titleKey: "steps.chooseModel" },
	{ id: "request", titleKey: "steps.createRequest" },
];

const PROMPT_OPTIONS: PromptOption[] = [
	{ id: "summary", codeMessage: "Explain what Phaseo does in one sentence." },
	{ id: "welcome", codeMessage: "Write a friendly welcome message for a developer." },
	{ id: "compare", codeMessage: "Suggest three ways to compare AI models." },
	{ id: "json", codeMessage: "Draft a JSON object with a project name and next action." },
];

function safeString(value: unknown) {
	return typeof value === "string" ? value : "";
}

function buildModelsCode(): RestCodeExample {
	return {
		method: "GET",
		endpoint: "/v1/models",
		code: `curl "https://api.phaseo.app/v1/models?endpoints=chat/completions" \\
  -H "Authorization: Bearer $PHASEO_API_KEY"`,
	};
}

function toShellSingleQuotedJson(value: unknown) {
	return JSON.stringify(value, null, 2).replace(/'/g, "'\\''");
}

function buildKeyCode(keyName: string): RestCodeExample {
	const payload = toShellSingleQuotedJson({
		name: keyName || "Onboarding key",
	});

	return {
		method: "POST",
		endpoint: "/v1/keys",
		code: `curl https://api.phaseo.app/v1/keys \\
  -H "Authorization: Bearer $PHASEO_MANAGEMENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'`,
	};
}

function buildRequestCode(
	modelId: string,
	keyPreview: string,
	message: string,
): RestCodeExample {
	const payload = toShellSingleQuotedJson({
		model: modelId || "openai/gpt-4.1-mini",
		messages: [
			{
				role: "user",
				content: message || "Hello from Phaseo",
			},
		],
	});

	return {
		method: "POST",
		endpoint: "/v1/chat/completions",
		code: `curl https://api.phaseo.app/v1/chat/completions \\
  -H "Authorization: Bearer ${keyPreview || "$PHASEO_API_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'`,
	};
}

function estimateTokenCount(value: string) {
	return Math.max(1, Math.ceil(value.trim().split(/\s+/).filter(Boolean).length * 1.35));
}

function splitIntoDisplayTokens(value: string) {
	const tokens = value.match(/\s+|[\w'-]+|[^\s\w]/g) ?? [];
	return tokens.filter((token) => token.length > 0);
}

function buildSimulatedChatCompletionResponse({
	modelId,
	prompt,
	response,
	completionTokens,
}: {
	modelId: string;
	prompt: string;
	response: string;
	completionTokens: number;
}) {
	const promptTokens = estimateTokenCount(prompt);
	return {
		id: "chatcmpl_onboarding_demo",
		object: "chat.completion",
		created: 1791619200,
		model: modelId || "openai/gpt-5.5",
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: response,
				},
				finish_reason: "stop",
			},
		],
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	};
}

function SimulatedResponse({
	value,
	isStreaming,
	elapsedMs,
	streamedTokens,
	view,
	onViewChange,
	objectJson,
}: {
	value: string;
	isStreaming: boolean;
	elapsedMs: number;
	streamedTokens: number;
	view: ResponseView;
	onViewChange: (view: ResponseView) => void;
	objectJson: string;
}) {
	const t = useTranslations("Product.interactiveOnboarding");
	const locale = useLocale();
	if (!value && !isStreaming) return null;
	const seconds = new Intl.NumberFormat(locale, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(elapsedMs / 1000);

	return (
		<div className="rounded-md border bg-background">
			<div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{t("responseTitle")}</span>
					<span className="font-mono text-xs text-muted-foreground">
						{t("responseStats", { seconds, count: streamedTokens } as never)}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => onViewChange("parsed")}
						className={cn(
							"rounded px-2 py-1 text-xs transition",
							view === "parsed"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{t("parsedView")}
					</button>
					<button
						type="button"
						onClick={() => onViewChange("object")}
						className={cn(
							"rounded px-2 py-1 text-xs transition",
							view === "object"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{t("fullObjectView")}
					</button>
				</div>
			</div>
			{view === "parsed" ? (
				<pre className="max-h-72 overflow-auto whitespace-pre-wrap p-4 text-sm leading-6 text-foreground">
					{value}
					{isStreaming ? <span className="animate-pulse">|</span> : null}
				</pre>
			) : (
				<HighlightedCodeBlock
					code={objectJson}
					language="json"
					className="rounded-none border-0 [&_pre]:max-h-72"
				/>
			)}
		</div>
	);
}

function RestCodeBlock({ example }: { example: RestCodeExample }) {
	const t = useTranslations("Product.interactiveOnboarding");
	return (
		<div className="overflow-hidden rounded-md border bg-background">
			<div className="flex min-h-11 items-center justify-between gap-3 border-b px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					<span
						className={cn(
							"rounded px-2 py-0.5 text-xs font-semibold",
							example.method === "POST"
								? "bg-yellow-100 text-yellow-900"
								: "bg-green-100 text-green-800",
						)}
					>
						{example.method}
					</span>
					<span className="truncate font-mono text-xs text-muted-foreground">
						{example.endpoint}
					</span>
				</div>
				<CopyButton
					content={example.code}
					variant="ghost"
					size="sm"
				aria-label={t("copyCode")}
				onCopy={() => toast.success(t("copied"))}
				/>
			</div>
			<HighlightedCodeBlock
				code={example.code}
				language="bash"
				className="rounded-none border-0 [&_pre]:max-h-[28rem]"
			/>
		</div>
	);
}

function MobileCodeDrawer({ example }: { example: RestCodeExample }) {
	const t = useTranslations("Product.interactiveOnboarding");
	return (
		<Drawer>
			<DrawerTrigger asChild>
				<Button
					variant="default"
					size="sm"
					className="fixed bottom-4 right-4 z-40 shadow-lg lg:hidden"
				>
					<Code2 className="mr-1.5 h-4 w-4" />
					{t("viewCode")}
				</Button>
			</DrawerTrigger>
			<DrawerContent className="lg:hidden max-h-[82dvh] gap-0 overflow-hidden p-0">
				<DrawerHeader className="border-b px-4 py-3 text-left">
					<DrawerTitle>{t("codeTitle")}</DrawerTitle>
					<DrawerDescription>
						{t("restRequestDescription")}
					</DrawerDescription>
				</DrawerHeader>
				<div className="overflow-auto p-4">
					<RestCodeBlock example={example} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}

export default function InteractiveOnboarding({
	initialState,
	initialCompletedAt,
	initialCountryCode,
	countryStorageAvailable,
	initialWorkspaceId,
	models,
	workspaces,
}: {
	initialState: Record<string, unknown>;
	initialCompletedAt: string | null;
	initialCountryCode: string | null;
	countryStorageAvailable: boolean;
	initialWorkspaceId: string | null;
	models: OnboardingModel[];
	workspaces: OnboardingWorkspace[];
}) {
	const t = useTranslations("Product.interactiveOnboarding");
	const initialSteps = Array.isArray(initialState.completedSteps)
		? initialState.completedSteps.map((step) => String(step))
		: [];
	const firstIncomplete =
		STEPS.find((step) => !initialSteps.includes(step.id))?.id ?? "request";

	const [countryCode, setCountryCode] = React.useState(initialCountryCode ?? "");
	const [declaredCountryCode, setDeclaredCountryCode] = React.useState(initialCountryCode ?? "");
	const [isSavingCountry, setIsSavingCountry] = React.useState(false);
	const [activeStep, setActiveStep] = React.useState<StepId>(firstIncomplete);
	const [completedSteps, setCompletedSteps] = React.useState<Set<string>>(
		() => new Set(initialSteps),
	);
	const [workspaceId, setWorkspaceId] = React.useState(
		safeString(initialState.workspaceId) ||
			initialWorkspaceId ||
			workspaces[0]?.id ||
			"",
	);
	const [selectedModelId, setSelectedModelId] = React.useState(
		safeString(initialState.selectedModelId) || models[0]?.id || "",
	);
	const [selectedKeyId, setSelectedKeyId] = React.useState(
		safeString(initialState.selectedKeyId),
	);
	const [createdPlaintextKey, setCreatedPlaintextKey] = React.useState("");
	const [createdKeyPrefix, setCreatedKeyPrefix] = React.useState(
		safeString(initialState.keyPrefix),
	);
	const [keyName, setKeyName] = React.useState(() => t("defaultKeyName"));
	const [isCreatingKey, setIsCreatingKey] = React.useState(false);
	const [keyError, setKeyError] = React.useState("");
	const [isSaving, setIsSaving] = React.useState(false);
	const [selectedPromptId, setSelectedPromptId] = React.useState(
		PROMPT_OPTIONS[0]?.id ?? "",
	);
	const [simulatedResponse, setSimulatedResponse] = React.useState("");
	const [isStreamingResponse, setIsStreamingResponse] = React.useState(false);
	const [responseElapsedMs, setResponseElapsedMs] = React.useState(0);
	const [streamedTokenCount, setStreamedTokenCount] = React.useState(0);
	const [responseView, setResponseView] = React.useState<ResponseView>("parsed");
	const streamTimeoutsRef = React.useRef<number[]>([]);
	const streamIntervalRef = React.useRef<number | null>(null);
	const streamStartedAtRef = React.useRef<number | null>(null);
	const router = useRouter();

	const selectedModel =
		models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
	const selectedPromptOption =
		PROMPT_OPTIONS.find((prompt) => prompt.id === selectedPromptId) ??
		PROMPT_OPTIONS[0];
	const selectedPrompt = selectedPromptOption
		? {
				...selectedPromptOption,
				label: t(`prompts.${selectedPromptOption.id}.label` as never),
				message: t(`prompts.${selectedPromptOption.id}.message` as never),
				response: t(`prompts.${selectedPromptOption.id}.response` as never),
			}
		: null;
	const keyPreview =
		createdPlaintextKey ||
		(createdKeyPrefix ? `phaseo_v1_sk_...${createdKeyPrefix}` : "") ||
		"$PHASEO_API_KEY";
	const simulatedResponseObject = buildSimulatedChatCompletionResponse({
		modelId: selectedModel?.id ?? selectedModelId,
		prompt: selectedPromptOption?.codeMessage ?? "Explain what Phaseo does in one sentence.",
		response: simulatedResponse,
		completionTokens: streamedTokenCount,
	});
	const simulatedResponseJson = JSON.stringify(simulatedResponseObject, null, 2);

	const codeExample =
		activeStep === "api-key"
			? buildKeyCode(keyName)
			: activeStep === "models"
				? buildModelsCode()
				: buildRequestCode(
					selectedModel?.id ?? selectedModelId,
						keyPreview,
						selectedPromptOption?.codeMessage ?? "Explain what Phaseo does in one sentence.",
					);

	const clearStreamTimeouts = React.useCallback(() => {
		for (const timeoutId of streamTimeoutsRef.current) {
			window.clearTimeout(timeoutId);
		}
		streamTimeoutsRef.current = [];
		if (streamIntervalRef.current !== null) {
			window.clearInterval(streamIntervalRef.current);
			streamIntervalRef.current = null;
		}
	}, []);

	React.useEffect(() => {
		return () => clearStreamTimeouts();
	}, [clearStreamTimeouts]);

	function resetSimulation() {
		clearStreamTimeouts();
		setSimulatedResponse("");
		setResponseElapsedMs(0);
		setStreamedTokenCount(0);
		setIsStreamingResponse(false);
		setResponseView("parsed");
	}

	function simulateRequest() {
		const response = selectedPrompt?.response ?? "";
		clearStreamTimeouts();
		setSimulatedResponse("");
		setResponseElapsedMs(0);
		setStreamedTokenCount(0);
		setIsStreamingResponse(true);
		setResponseView("parsed");
		streamStartedAtRef.current = Date.now();
		streamIntervalRef.current = window.setInterval(() => {
			if (!streamStartedAtRef.current) return;
			setResponseElapsedMs(Date.now() - streamStartedAtRef.current);
		}, 100);

		const tokens = splitIntoDisplayTokens(response);
		if (tokens.length === 0) {
			setIsStreamingResponse(false);
			if (streamIntervalRef.current !== null) {
				window.clearInterval(streamIntervalRef.current);
				streamIntervalRef.current = null;
			}
			return;
		}

		const semanticTokenTotal = tokens.filter((token) => token.trim().length > 0).length;
		let nextValue = "";
		let semanticTokenCount = 0;
		tokens.forEach((token, index) => {
			const timeoutId = window.setTimeout(
				() => {
					nextValue += token;
					setSimulatedResponse(nextValue.trimStart());
					if (token.trim().length > 0) {
						semanticTokenCount += 1;
						setStreamedTokenCount(semanticTokenCount);
					}
					if (index === tokens.length - 1) {
						setStreamedTokenCount(semanticTokenTotal);
						setIsStreamingResponse(false);
						if (streamStartedAtRef.current) {
							setResponseElapsedMs(Date.now() - streamStartedAtRef.current);
						}
						if (streamIntervalRef.current !== null) {
							window.clearInterval(streamIntervalRef.current);
							streamIntervalRef.current = null;
						}
					}
				},
				160 + index * 58,
			);
			streamTimeoutsRef.current.push(timeoutId);
		});
	}

	async function saveProgress(
		step: StepId,
		nextStep?: StepId,
		overrides?: {
			selectedKeyId?: string | null;
			keyPrefix?: string | null;
		},
	) {
		const nextCompleted = new Set(completedSteps);
		nextCompleted.add(step);
		setCompletedSteps(nextCompleted);
		if (nextStep) setActiveStep(nextStep);

		await saveOnboardingProgressAction({
			workspaceId,
			selectedModelId,
			selectedKeyId:
				overrides && "selectedKeyId" in overrides
					? overrides.selectedKeyId
					: selectedKeyId || null,
			keyPrefix:
				overrides && "keyPrefix" in overrides
					? overrides.keyPrefix
					: createdKeyPrefix || null,
			completedSteps: [step],
			status: "started",
		});
	}

	async function createKey() {
		try {
			setIsCreatingKey(true);
			setKeyError("");
			const result = await createOnboardingApiKeyAction({
				name: keyName,
				workspaceId,
				selectedModelId,
			});
			if (result.workspaceId) setWorkspaceId(result.workspaceId);
			setCreatedPlaintextKey(result.plaintext ?? "");
			setCreatedKeyPrefix(result.prefix ?? "");
			if (result.id) setSelectedKeyId(result.id);
			captureProductEvent("api_key_created", {
				preset: "development",
				surface: "onboarding",
			});

			const nextCompleted = new Set(completedSteps);
			nextCompleted.add("api-key");
			setCompletedSteps(nextCompleted);
			toast.success(t("toasts.apiKeyCreated"));
		} catch (error) {
			void error;
			const message = t("errors.apiKeyCreate");
			setKeyError(message);
			toast.error(message);
		} finally {
			setIsCreatingKey(false);
		}
	}

	async function continueWithoutKey() {
		setCreatedPlaintextKey("");
		setCreatedKeyPrefix("");
		setSelectedKeyId("");
		await saveProgress("api-key", "models", {
			selectedKeyId: null,
			keyPrefix: null,
		});
	}

	async function chooseModel(modelId: string) {
		setSelectedModelId(modelId);
		resetSimulation();
		const nextCompleted = new Set(completedSteps);
		nextCompleted.add("models");
		setCompletedSteps(nextCompleted);
		setActiveStep("request");

		await saveOnboardingProgressAction({
			workspaceId,
			selectedModelId: modelId,
			selectedKeyId: selectedKeyId || null,
			keyPrefix: createdKeyPrefix || null,
			completedSteps: ["models"],
			status: "started",
		});
	}

	async function finish(status: "completed" | "skipped") {
		try {
			setIsSaving(true);
			await saveOnboardingProgressAction({
				workspaceId,
				selectedModelId,
				selectedKeyId: selectedKeyId || null,
				keyPrefix: createdKeyPrefix || null,
				completedSteps:
					status === "completed"
						? ["api-key", "models", "request"]
						: Array.from(completedSteps),
				status,
			});
			captureProductEvent("onboarding_finished", {
				completed_step_count:
					status === "completed" ? 3 : completedSteps.size,
				outcome: status,
			});
			toast.success(status === "completed" ? t("toasts.completed") : t("toasts.skipped"));
			router.replace("/");
			router.refresh();
		} catch (error) {
			void error;
			toast.error(t("errors.saveProgress"));
		} finally {
			setIsSaving(false);
		}
	}

	async function saveCountry() {
		if (!countryCode) return;
		try {
			setIsSavingCountry(true);
			await saveOnboardingProgressAction({
				countryCode,
				completedSteps: ["country"],
				status: "started",
			});
			setDeclaredCountryCode(countryCode);
			toast.success(t("toasts.countrySaved"));
		} catch (error) {
			void error;
			toast.error(t("errors.saveCountry"));
		} finally {
			setIsSavingCountry(false);
		}
	}

	function renderModelButton(model: OnboardingModel) {
		return (
			<button
				key={model.id}
				type="button"
				onClick={() => chooseModel(model.id)}
				className={cn(
					"rounded-md border px-3 py-2.5 text-left text-sm transition",
					selectedModelId === model.id
						? "border-foreground"
						: "border-border hover:border-foreground/40",
				)}
			>
				<div className="flex items-center gap-2.5">
					<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background">
						<Logo
							id={model.organisationId}
							alt={model.organisationName}
							width={18}
							height={18}
							className="max-h-[18px] max-w-[18px]"
						/>
					</span>
					<div className="min-w-0">
						<div className="truncate font-medium">{model.name}</div>
						<div className="mt-1 truncate font-mono text-xs text-muted-foreground">
							{model.id}
						</div>
					</div>
				</div>
			</button>
		);
	}

	if (countryStorageAvailable && !declaredCountryCode) {
		return (
			<div className="min-h-[calc(100dvh-var(--site-header-height,4rem))] bg-background px-4 py-10 text-foreground sm:px-6">
				<div className="mx-auto max-w-lg rounded-xl border bg-card p-6 sm:p-8">
						<h1 className="text-2xl font-semibold tracking-tight">{t("country.title")}</h1>
						<p className="mt-2 text-sm leading-6 text-muted-foreground">
							{t("country.description")}
						</p>
						<div className="mt-6 space-y-2">
							<label htmlFor="onboarding-country" className="text-sm font-medium">{t("country.label")}</label>
						<CountryCombobox
							id="onboarding-country"
							value={countryCode}
							onValueChange={setCountryCode}
							disabled={isSavingCountry}
						/>
					</div>
					<Button className="mt-6 w-full" onClick={saveCountry} disabled={!countryCode || isSavingCountry}>
						{isSavingCountry ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
						{t("continue")}
					</Button>
					<p className="mt-4 text-xs leading-5 text-muted-foreground">
						{t("country.privacyNote")}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-[calc(100dvh-var(--site-header-height,4rem))] bg-background text-foreground">
			<div className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">
				<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-normal">
							{t("pageTitle")}
						</h1>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
							{t("pageDescription")}
						</p>
					</div>
					<Button
						variant="outline"
						className="w-full justify-center sm:w-auto"
						onClick={() => finish("skipped")}
						disabled={isSaving}
					>
						<X className="mr-1.5 h-4 w-4" />
						{t("skip")}
					</Button>
				</div>

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.82fr)]">
					<section className="min-w-0 space-y-3">
						<div className="grid gap-3 sm:grid-cols-3">
							{STEPS.map((step, index) => {
								const isActive = activeStep === step.id;
								return (
									<button
										key={step.id}
										type="button"
										onClick={() => setActiveStep(step.id)}
										className={cn(
											"flex min-h-12 items-center gap-3 border-b px-1 pb-3 text-left text-sm transition",
											isActive
												? "border-foreground text-foreground"
												: "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
										)}
									>
										<span
											className={cn(
												"grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-medium leading-none",
												isActive
													? "border-foreground bg-foreground text-background"
													: "border-border bg-background text-muted-foreground",
											)}
										>
											<span className="min-w-3 text-center font-mono tabular-nums">
												{index + 1}
											</span>
										</span>
											<span className="font-medium">{t(step.titleKey as never)}</span>
									</button>
								);
							})}
						</div>

						<div>
							<div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								{initialCompletedAt ? (
									<p className="text-sm text-muted-foreground">
										{t("completedPreviously")}
									</p>
								) : null}
							</div>

							{activeStep === "api-key" ? (
								<div className="space-y-5">
									<div>
										<h2 className="text-xl font-semibold tracking-normal">
											{t("steps.createKey")}
										</h2>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											{t("keyStepDescription")}
										</p>
									</div>

									<div className="max-w-md space-y-3">
										<label className="text-sm font-medium" htmlFor="key-name">
											{t("keyName")}
										</label>
										<input
											id="key-name"
											value={keyName}
											onChange={(event) => setKeyName(event.target.value)}
											className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
										/>
										<div className="flex flex-col gap-2 sm:flex-row">
											<Button
												type="button"
												onClick={createKey}
												disabled={isCreatingKey}
											>
												{isCreatingKey ? (
													<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
												) : (
													<KeyRound className="mr-1.5 h-4 w-4" />
												)}
												{isCreatingKey ? t("creatingKey") : t("createKey")}
											</Button>
											<Button
												type="button"
												variant="ghost"
												onClick={continueWithoutKey}
												disabled={isCreatingKey}
											>
												{t("continueWithoutKey")}
											</Button>
										</div>
										{keyError ? (
											<p className="text-sm text-destructive">{keyError}</p>
										) : null}
									</div>

									{createdPlaintextKey ? (
										<div className="space-y-3">
											<div className="rounded-md border p-4">
												<p className="text-sm font-medium">
													{t("copyNewKey")}
												</p>
												<p className="mt-1 text-sm text-muted-foreground">
													{t("keyShownOnce")}
												</p>
												<div className="mt-3 flex items-center gap-2 rounded-md border bg-muted p-2">
													<code className="min-w-0 flex-1 overflow-auto whitespace-nowrap text-sm">
														{createdPlaintextKey}
													</code>
												</div>
												<div className="mt-3">
													<SecretRevealActions
														secret={createdPlaintextKey}
														name={keyName || t("defaultKeyName")}
														kind="api-key"
													/>
												</div>
											</div>
											<p className="mt-1 text-sm text-muted-foreground">
												{t("continueAfterCopy")}
											</p>
											<Button
												type="button"
												onClick={() => saveProgress("api-key", "models")}
											>
												{t("continue")}
											</Button>
										</div>
									) : null}
								</div>
							) : null}

							{activeStep === "models" ? (
								<div className="space-y-5">
									<div>
										<h2 className="text-xl font-semibold tracking-normal">
											{t("steps.chooseModel")}
										</h2>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											{t("modelStepDescription")}
										</p>
									</div>

									<div className="space-y-3">
										<h3 className="text-sm font-medium">{t("models")}</h3>
										<div className="grid gap-2 md:grid-cols-2">
											{models.map((model) => renderModelButton(model))}
										</div>
									</div>
								</div>
							) : null}

							{activeStep === "request" ? (
								<div className="space-y-5">
									<div>
										<h2 className="text-xl font-semibold tracking-normal">
										{t("steps.createRequest")}
										</h2>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											{t("requestStepDescription")}
										</p>
									</div>

									<div className="rounded-md border p-4">
										<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
											<div className="flex min-w-0 items-start gap-3">
												{selectedModel ? (
													<span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
														<Logo
															id={selectedModel.organisationId}
															alt={selectedModel.organisationName}
															width={22}
															height={22}
															className="max-h-[22px] max-w-[22px]"
														/>
													</span>
												) : null}
												<div className="min-w-0">
													<p className="text-sm font-medium">
															{selectedModel?.name ?? t("selectedModel")}
													</p>
													<p className="mt-1 break-words font-mono text-sm text-muted-foreground">
														{selectedModel?.id ?? selectedModelId}
													</p>
												</div>
											</div>
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="w-full justify-center sm:w-auto"
												onClick={() => setActiveStep("models")}
											>
												<RefreshCw className="mr-1.5 h-4 w-4" />
												{t("changeModel")}
											</Button>
										</div>
									</div>

									<div className="space-y-3">
										<p className="text-sm font-medium">{t("message")}</p>
										<div className="grid gap-2 sm:grid-cols-2">
											{PROMPT_OPTIONS.map((prompt) => (
												<button
													key={prompt.id}
													type="button"
													onClick={() => {
														setSelectedPromptId(prompt.id);
														resetSimulation();
													}}
													className={cn(
														"rounded-md border p-3 text-left text-sm transition",
														selectedPromptId === prompt.id
															? "border-foreground"
															: "border-border hover:border-foreground/40",
													)}
												>
										<span className="font-medium">
											{t(`prompts.${prompt.id}.label` as never)}
										</span>
										<span className="mt-1 block text-muted-foreground">
											{t(`prompts.${prompt.id}.message` as never)}
										</span>
												</button>
											))}
										</div>
									</div>

									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											onClick={simulateRequest}
											disabled={isStreamingResponse}
										>
											{isStreamingResponse ? (
												<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
											) : (
												<Send className="mr-1.5 h-4 w-4" />
											)}
											{t("sendRequest")}
										</Button>
									</div>

									<div className="lg:hidden">
										<SimulatedResponse
											value={simulatedResponse}
											isStreaming={isStreamingResponse}
											elapsedMs={responseElapsedMs}
											streamedTokens={streamedTokenCount}
											view={responseView}
											onViewChange={setResponseView}
											objectJson={simulatedResponseJson}
										/>
									</div>

									{simulatedResponse ? (
										<div className="border-t pt-5">
											<Button
												type="button"
												onClick={async () => {
													await saveProgress("request");
													await finish("completed");
												}}
												disabled={isSaving || isStreamingResponse}
											>
												{isSaving ? (
													<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
												) : (
													<Check className="mr-1.5 h-4 w-4" />
												)}
												{t("completeOnboarding")}
											</Button>
										</div>
									) : null}
								</div>
							) : null}
						</div>
					</section>

					<aside className="hidden min-w-0 lg:sticky lg:top-[calc(var(--site-header-height,4rem)+1rem)] lg:block lg:h-fit">
						<div className="space-y-3">
							<RestCodeBlock example={codeExample} />
							{activeStep === "request" ? (
								<div className="hidden lg:block">
									<SimulatedResponse
										value={simulatedResponse}
										isStreaming={isStreamingResponse}
										elapsedMs={responseElapsedMs}
										streamedTokens={streamedTokenCount}
										view={responseView}
										onViewChange={setResponseView}
										objectJson={simulatedResponseJson}
									/>
								</div>
							) : null}
						</div>
					</aside>
				</div>
			</div>
			<MobileCodeDrawer example={codeExample} />
		</div>
	);
}
