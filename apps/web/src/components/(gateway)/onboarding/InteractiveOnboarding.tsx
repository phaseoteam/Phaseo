"use client";

import * as React from "react";
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
	label: string;
	message: string;
	response: string;
};
type ResponseView = "parsed" | "object";

const STEPS: Array<{ id: StepId; title: string }> = [
	{ id: "api-key", title: "Create a Key" },
	{ id: "models", title: "Choose a Model" },
	{ id: "request", title: "Create a Request" },
];

const PROMPT_OPTIONS: PromptOption[] = [
	{
		id: "summary",
		label: "One sentence summary",
		message: "Explain what Phaseo does in one sentence.",
		response:
			"Phaseo helps developers discover, compare, and call AI models through one gateway with consistent pricing, routing, and observability.",
	},
	{
		id: "welcome",
		label: "Welcome message",
		message: "Write a friendly welcome message for a developer.",
		response:
			"Welcome to Phaseo. Create a key, choose a model, and send your first request whenever you are ready.",
	},
	{
		id: "compare",
		label: "Compare models",
		message: "Suggest three ways to compare AI models.",
		response:
			"Compare models by capability fit, latency and reliability, and total cost for your expected traffic pattern.",
	},
	{
		id: "json",
		label: "JSON draft",
		message: "Draft a JSON object with a project name and next action.",
		response:
			'{\n  "project": "Phaseo onboarding",\n  "next_action": "Send a test chat completion request"\n}',
	},
];

function safeString(value: unknown) {
	return typeof value === "string" ? value : "";
}

function buildModelsCode(): RestCodeExample {
	return {
		method: "GET",
		endpoint: "/v1/models",
		code: `curl "https://api.phaseo.ai/v1/models?endpoints=chat/completions" \\
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
		code: `curl https://api.phaseo.ai/v1/keys \\
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
		code: `curl https://api.phaseo.ai/v1/chat/completions \\
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
	if (!value && !isStreaming) return null;

	return (
		<div className="rounded-md border bg-background">
			<div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Response</span>
					<span className="font-mono text-xs text-muted-foreground">
						{(elapsedMs / 1000).toFixed(1)}s - {streamedTokens} tokens
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
						Parsed
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
						Full object
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
					aria-label="Copy code"
					onCopy={() => toast.success("Copied")}
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
	return (
		<Drawer>
			<DrawerTrigger asChild>
				<Button
					variant="default"
					size="sm"
					className="fixed bottom-4 right-4 z-40 shadow-lg lg:hidden"
				>
					<Code2 className="mr-1.5 h-4 w-4" />
					View code
				</Button>
			</DrawerTrigger>
			<DrawerContent className="lg:hidden max-h-[82dvh] gap-0 overflow-hidden p-0">
				<DrawerHeader className="border-b px-4 py-3 text-left">
					<DrawerTitle>Code</DrawerTitle>
					<DrawerDescription>
						The REST request for the current step.
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
	initialWorkspaceId,
	models,
	workspaces,
}: {
	initialState: Record<string, unknown>;
	initialCompletedAt: string | null;
	initialWorkspaceId: string | null;
	models: OnboardingModel[];
	workspaces: OnboardingWorkspace[];
}) {
	const initialSteps = Array.isArray(initialState.completedSteps)
		? initialState.completedSteps.map((step) => String(step))
		: [];
	const firstIncomplete =
		STEPS.find((step) => !initialSteps.includes(step.id))?.id ?? "request";

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
	const [keyName, setKeyName] = React.useState("Onboarding key");
	const [isCreatingKey, setIsCreatingKey] = React.useState(false);
	const [keyError, setKeyError] = React.useState("");
	const [keyStatus, setKeyStatus] = React.useState("");
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
	const selectedPrompt =
		PROMPT_OPTIONS.find((prompt) => prompt.id === selectedPromptId) ??
		PROMPT_OPTIONS[0];
	const keyPreview =
		createdPlaintextKey ||
		(createdKeyPrefix ? `phaseo_v1_sk_...${createdKeyPrefix}` : "") ||
		"$PHASEO_API_KEY";
	const simulatedResponseObject = buildSimulatedChatCompletionResponse({
		modelId: selectedModel?.id ?? selectedModelId,
		prompt: selectedPrompt?.message ?? "",
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
						selectedPrompt?.message ?? "Hello from Phaseo",
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
			setKeyStatus("Creating key...");
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
			setKeyStatus("");
			toast.success("API key created");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Could not create API key";
			setKeyStatus("");
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
			toast.success(
				status === "completed" ? "Onboarding complete" : "Onboarding skipped",
			);
			router.replace("/");
			router.refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save onboarding",
			);
		} finally {
			setIsSaving(false);
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

	return (
		<div className="min-h-[calc(100dvh-var(--site-header-height,4rem))] bg-background text-foreground">
			<div className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">
				<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-2xl font-semibold tracking-normal">
							Get started with Phaseo
						</h1>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
							Choose a model, preview the API flow, and create a key when you
							are ready.
						</p>
					</div>
					<Button
						variant="outline"
						className="w-full justify-center sm:w-auto"
						onClick={() => finish("skipped")}
						disabled={isSaving}
					>
						<X className="mr-1.5 h-4 w-4" />
						Skip
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
										<span className="font-medium">{step.title}</span>
									</button>
								);
							})}
						</div>

						<div>
							<div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								{initialCompletedAt ? (
									<p className="text-sm text-muted-foreground">
										You have completed onboarding before.
									</p>
								) : null}
							</div>

							{activeStep === "api-key" ? (
								<div className="space-y-5">
									<div>
										<h2 className="text-xl font-semibold tracking-normal">
											Create a Key
										</h2>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											Create a key now if you want to copy a ready-to-run
											request. You can also continue without one and come back to
											keys later.
										</p>
									</div>

									<div className="max-w-md space-y-3">
										<label className="text-sm font-medium" htmlFor="key-name">
											Key name
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
												Create key
											</Button>
											<Button
												type="button"
												variant="ghost"
												onClick={continueWithoutKey}
												disabled={isCreatingKey}
											>
												Continue without key
											</Button>
										</div>
										{keyError ? (
											<p className="text-sm text-destructive">{keyError}</p>
										) : null}
										{keyStatus ? (
											<p className="text-sm text-muted-foreground">
												{keyStatus}
											</p>
										) : null}
									</div>

									{createdPlaintextKey ? (
										<div className="space-y-3">
											<div className="rounded-md border p-4">
												<p className="text-sm font-medium">
													Copy your new key now
												</p>
												<p className="mt-1 text-sm text-muted-foreground">
													It will not be shown again.
												</p>
												<div className="mt-3 flex items-center gap-2 rounded-md border bg-muted p-2">
													<code className="min-w-0 flex-1 overflow-auto whitespace-nowrap text-sm">
														{createdPlaintextKey}
													</code>
												</div>
												<div className="mt-3">
													<SecretRevealActions
														secret={createdPlaintextKey}
														name={keyName || "AI Stats onboarding key"}
														kind="api-key"
													/>
												</div>
											</div>
											<p className="mt-1 text-sm text-muted-foreground">
												Once you have copied it, continue to choose a model.
											</p>
											<Button
												type="button"
												onClick={() => saveProgress("api-key", "models")}
											>
												Continue
											</Button>
										</div>
									) : null}
								</div>
							) : null}

							{activeStep === "models" ? (
								<div className="space-y-5">
									<div>
										<h2 className="text-xl font-semibold tracking-normal">
											Choose a Model
										</h2>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											This list is based on the gateway model catalogue. Choose
											one model for your first request.
										</p>
									</div>

									<div className="space-y-3">
										<h3 className="text-sm font-medium">Models</h3>
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
											Create a Request
										</h2>
										<p className="mt-2 text-sm leading-6 text-muted-foreground">
											Choose a message, then simulate the first response. This
											does not send a request to a model.
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
														{selectedModel?.name ?? "Selected model"}
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
												Change model
											</Button>
										</div>
									</div>

									<div className="space-y-3">
										<p className="text-sm font-medium">Message</p>
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
													<span className="font-medium">{prompt.label}</span>
													<span className="mt-1 block text-muted-foreground">
														{prompt.message}
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
											Send request
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
												Complete onboarding
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
