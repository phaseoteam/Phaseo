"use client";

import { MessageScroller } from "@shadcn/react/message-scroller";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ArrowDown,
	PanelLeftClose,
	PanelLeftOpen,
	Save,
	Settings,
	SquarePen,
	X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import {
	APP_HEADERS,
	getRoomStorageKeys,
} from "@/components/(chat)/playground/chat-playground-core";
import {
	DecisionComposer,
	createDefaultDecisionDraft,
	serializeDecisionDraft,
	validateDecisionDraft,
	type DecisionDraft,
} from "@/components/(chat)/DecisionComposer";
import {
	DecisionResponseCard,
	getDecisionResponseMetadata,
} from "@/components/(chat)/DecisionResponseCard";
import {
	AssistantMessageFooter,
	UserMessageFooter,
} from "@/components/(chat)/ChatMessageFooters";
import {
	RoomComposerFooter,
	RoomComposerSurface,
} from "@/components/(chat)/RoomComposer";
import { RoomEmptyState } from "@/components/(chat)/RoomEmptyState";
import { RoomModelSelector } from "@/components/(chat)/RoomModelSelector";
import { RoomSdkExport } from "@/components/(chat)/RoomSdkExport";
import { RoomWorkingIndicator } from "@/components/(chat)/RoomWorkingIndicator";
import { RoomErrorNotice } from "@/components/(chat)/rooms/RoomErrorNotice";
import { DecisionsChatSidebar } from "@/components/(chat)/rooms/DecisionsChatSidebar";
import { DecisionsModelSettingsDialog } from "@/components/(chat)/rooms/settings/DecisionsModelSettingsDialog";
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import { chatLocalStorage } from "@/lib/chat/userStorage";
import {
	deleteRoomHistory,
	upsertRoomHistory,
} from "@/lib/indexeddb/chatRoomHistory";
import {
	deleteChat,
	normalizeChatTags,
	upsertChat,
	upsertChatTags,
	type ChatTag,
} from "@/lib/indexeddb/chats";
import {
	createDecisionConversation,
	loadDecisionConversationHistory,
	sortDecisionConversations,
	toStoredDecisionRun,
	truncateConversationTitle,
	type DecisionConversation,
	type DecisionHistoryPayload,
	type DecisionRequest,
	type DecisionRun,
} from "@/components/(chat)/rooms/decisionChatConversations";
import { Button } from "@/components/ui/button";
import {
	Message,
	MessageContent,
	MessageHeader,
} from "@/components/ui/message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULT_MODEL_ID = "typesafe/jev-1.13.0";
const DEFAULT_USER_MESSAGE_ACCENT_COLOR = "#111111";
const DECISIONS_STORAGE_KEYS = getRoomStorageKeys("decisions");

function readActiveDecisionConversationId(): string | null {
	try {
		return chatLocalStorage.getItem(DECISIONS_STORAGE_KEYS.activeChatId);
	} catch {
		return null;
	}
}

function writeActiveDecisionConversationId(id: string): boolean {
	try {
		chatLocalStorage.setItem(DECISIONS_STORAGE_KEYS.activeChatId, id);
		return true;
	} catch {
		return false;
	}
}

function formatDecisionTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const now = new Date();
	const isSameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	const time = new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
	if (isSameDay) return time;
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const startOfMessageDay = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	).getTime();
	const daysAgo = Math.round(
		(startOfToday - startOfMessageDay) / 86_400_000,
	);
	if (daysAgo > 0 && daysAgo < 7) {
		const dayName = new Intl.DateTimeFormat("en-GB", {
			weekday: "long",
		}).format(date);
		return `${dayName} ${time}`;
	}
	const dateLabel = new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		...(date.getFullYear() === now.getFullYear()
			? {}
			: { year: "numeric" as const }),
	}).format(date);
	return `${dateLabel}, ${time}`;
}

function formatErrorBody(body: string, status: number): string {
	try {
		const parsed = JSON.parse(body) as Record<string, unknown>;
		const message = parsed.message ?? parsed.error ?? parsed.detail;
		return typeof message === "string"
			? message
			: `Decisions request failed (${status}).`;
	} catch {
		return body.trim() || `Decisions request failed (${status}).`;
	}
}

function cloneDraft(draft: DecisionDraft): DecisionDraft {
	return structuredClone(draft);
}

function getDefaultDecisionModelParams(): Record<string, never> {
	return {};
}

export function DecisionsRoom({ models }: { models: GatewaySupportedModel[] }) {
	const searchParams = useSearchParams();
	const { state: sidebarState, toggleSidebar, isMobile } = useSidebar();
	const sidebarCollapsed = sidebarState === "collapsed" && !isMobile;
	const roomModels = useMemo(
		() => filterModelsForRoom(models, "decisions"),
		[models],
	);
	const requestedModel = searchParams.get("model")?.trim() || DEFAULT_MODEL_ID;
	const [model, setModel] = useState(requestedModel);
	const [draft, setDraft] = useState<DecisionDraft>(createDefaultDecisionDraft);
	const [runs, setRuns] = useState<DecisionRun[]>([]);
	const [conversations, setConversations] = useState<DecisionConversation[]>([]);
	const initialConversationRef = useRef<DecisionConversation | null>(null);
	const [chatTags, setChatTags] = useState<ChatTag[]>([]);
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
	const [loadedHistoryModel, setLoadedHistoryModel] = useState<string | null>(null);
	const historyLoaded = loadedHistoryModel === requestedModel;
	const [copiedRunId, setCopiedRunId] = useState<string | null>(null);
	const [copiedInputRunId, setCopiedInputRunId] = useState<string | null>(null);
	const [metadataOpenRunId, setMetadataOpenRunId] = useState<string | null>(null);
	const [editingRunId, setEditingRunId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const scrollViewportRef = useRef<HTMLDivElement | null>(null);
	const modelSettings = useRoomModelSettings<Record<string, never>>({
		roomId: "decisions",
		models: roomModels,
		selectedModelId: model,
		onModelChange: setModel,
		getDefaultParams: getDefaultDecisionModelParams,
	});
	const settingsModelId = modelSettings.modelSettingsModelId;
	const settingsProfile = settingsModelId
		? modelSettings.getProfileForModel(settingsModelId)
		: null;
	const catalogueModelNameById = useMemo(() => {
		const names: Record<string, string> = {};
		for (const entry of roomModels) {
			if (!entry.modelName?.trim()) continue;
			names[entry.modelId] ??= entry.modelName;
			names[entry.selectorModelId] ??= entry.modelName;
		}
		return names;
	}, [roomModels]);
	const activeConversation = useMemo(
		() =>
			conversations.find((conversation) => conversation.id === activeConversationId) ??
			null,
		[activeConversationId, conversations],
	);
	const activeRuns = useMemo(() => {
		if (!activeConversationId) return [];
		return runs
			.filter((run) => run.conversationId === activeConversationId)
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	}, [activeConversationId, runs]);

	useEffect(() => {
		let mounted = true;
		void loadDecisionConversationHistory(
			requestedModel,
			initialConversationRef.current,
		)
			.then(async (loadedHistory) => {
				if (!mounted) return;
				initialConversationRef.current = loadedHistory.initialConversation;
				const saveResults = await Promise.allSettled(
					loadedHistory.conversationsToPersist.map((conversation) =>
						upsertChat(conversation, "decisions"),
					),
				);
				if (!mounted) return;
				setRuns(loadedHistory.runs);
				setConversations(loadedHistory.conversations);
				setChatTags(loadedHistory.tags);
				const storedActiveId = readActiveDecisionConversationId();
				const selectedId =
					loadedHistory.conversations.find(
						(conversation) => conversation.id === storedActiveId,
					)?.id ?? loadedHistory.conversations[0]?.id ?? null;
				setActiveConversationId(selectedId);
				if (selectedId) writeActiveDecisionConversationId(selectedId);
				setLoadedHistoryModel(loadedHistory.complete ? requestedModel : null);
				if (!loadedHistory.complete) {
					setError(
						"Some local chat history could not be loaded. Reload before editing or sending.",
					);
				} else if (saveResults.some((result) => result.status === "rejected")) {
					setError("A chat could not be saved locally.");
				}
			})
			.catch(() => {
				if (!mounted) return;
				setLoadedHistoryModel(null);
				setError("Local chat history could not be loaded.");
			});
		return () => {
			mounted = false;
		};
	}, [requestedModel]);

	function persistActiveConversation(id: string) {
		if (!writeActiveDecisionConversationId(id)) {
			setError("The active chat could not be saved locally.");
		}
	}

	function resetConversationView() {
		setCopiedRunId(null);
		setCopiedInputRunId(null);
		setMetadataOpenRunId(null);
		setEditingRunId(null);
		setEditingValue("");
		setError(null);
	}

	function selectConversation(conversation: DecisionConversation) {
		setActiveConversationId(conversation.id);
		const latestRun = runs
			.filter((run) => run.conversationId === conversation.id)
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
		setDraft(createDefaultDecisionDraft(latestRun?.draft.mode));
		resetConversationView();
		if (!historyLoaded) {
			setError(
				"Some local chat history could not be loaded. Reload before editing or sending.",
			);
		}
		persistActiveConversation(conversation.id);
	}

	async function createNewConversation(
		initialDraft = createDefaultDecisionDraft(),
	) {
		if (!historyLoaded) return;
		const conversation = createDecisionConversation(model || DEFAULT_MODEL_ID);
		setConversations((previous) =>
			sortDecisionConversations([conversation, ...previous]),
		);
		setActiveConversationId(conversation.id);
		setDraft(initialDraft);
		resetConversationView();
		persistActiveConversation(conversation.id);
		try {
			await upsertChat(conversation, "decisions");
		} catch {
			setError("The new chat could not be saved locally.");
		}
	}

	function startNewConversation() {
		void createNewConversation();
	}

	async function persistRun(run: DecisionRun) {
		await upsertRoomHistory<DecisionHistoryPayload>({
			id: run.id,
			roomId: "decisions",
			createdAt: run.createdAt,
			updatedAt: run.completedAt ?? run.createdAt,
			payload: toStoredDecisionRun(run),
		});
	}

	async function deleteConversation(
		conversation: DecisionConversation,
	): Promise<boolean> {
		if (!historyLoaded) return false;
		const conversationRuns = runs.filter(
			(run) => run.conversationId === conversation.id,
		);
		if (conversationRuns.some((run) => run.isPending)) {
			setError("Wait for the decision to finish before deleting this chat.");
			return false;
		}
		const deletionResults = await Promise.allSettled([
			deleteChat(conversation.id, "decisions"),
			...conversationRuns.map((run) => deleteRoomHistory(run.id)),
		]);
		if (deletionResults.some((result) => result.status === "rejected")) {
			// Chat metadata and room history live in separate IndexedDB databases,
			// so restore the snapshot if one database fails after another commits.
			const currentConversation =
				conversations.find((entry) => entry.id === conversation.id) ??
				conversation;
			const restoreResults = await Promise.allSettled([
				upsertChat(currentConversation, "decisions"),
				...conversationRuns.map((run) => persistRun(run)),
			]);
			const restored = restoreResults.every(
				(result) => result.status === "fulfilled",
			);
			setError(
				restored
					? "This chat could not be deleted locally; its saved history was restored."
					: "This chat could not be deleted completely. Reload to reconcile its local history.",
			);
			return false;
		}
		const nextRuns = runs.filter(
			(run) => run.conversationId !== conversation.id,
		);
		const nextConversations = conversations.filter(
			(entry) => entry.id !== conversation.id,
		);
		setRuns(nextRuns);
		setConversations(nextConversations);
		if (activeConversationId === conversation.id) {
			const nextConversation = nextConversations[0];
			if (nextConversation) {
				selectConversation(nextConversation);
			} else {
				await createNewConversation();
			}
		}
		return true;
	}

	async function renameConversation(
		conversation: DecisionConversation,
		title: string,
	): Promise<boolean> {
		if (!historyLoaded) return false;
		const renamedConversation = {
			...conversation,
			title: title.trim(),
			titleLocked: true,
		};
		setConversations((previous) =>
			sortDecisionConversations(
				previous.map((entry) =>
					entry.id === conversation.id ? renamedConversation : entry,
				),
			),
		);
		try {
			await upsertChat(renamedConversation, "decisions");
			return true;
		} catch {
			setConversations((previous) =>
				sortDecisionConversations(
					previous.map((entry) =>
						entry.id === conversation.id ? conversation : entry,
					),
				),
			);
			setError("This chat could not be renamed locally.");
			return false;
		}
	}

	async function toggleConversationPin(conversation: DecisionConversation) {
		if (!historyLoaded) return;
		const updatedConversation = {
			...conversation,
			pinned: !conversation.pinned,
		};
		setConversations((previous) =>
			sortDecisionConversations(
				previous.map((entry) =>
					entry.id === conversation.id ? updatedConversation : entry,
				),
			),
		);
		try {
			await upsertChat(updatedConversation, "decisions");
		} catch {
			setConversations((previous) =>
				sortDecisionConversations(
					previous.map((entry) =>
						entry.id === conversation.id ? conversation : entry,
					),
				),
			);
			setError("This chat could not be updated locally.");
		}
	}

	async function saveConversationTags(
		conversation: DecisionConversation,
		tags: ChatTag[],
	): Promise<boolean> {
		if (!historyLoaded) return false;
		const normalizedTags = normalizeChatTags(tags).sort((left, right) =>
			left.name.localeCompare(right.name),
		);
		const updatedConversation = { ...conversation, tags: normalizedTags };
		try {
			await upsertChatTags(normalizedTags);
			await upsertChat(updatedConversation, "decisions");
			setConversations((previous) =>
				sortDecisionConversations(
					previous.map((entry) =>
						entry.id === conversation.id ? updatedConversation : entry,
					),
				),
			);
			setChatTags((previous) => {
				const byId = new Map(previous.map((tag) => [tag.id, tag]));
				for (const tag of normalizedTags) byId.set(tag.id, tag);
				return Array.from(byId.values()).sort((left, right) =>
					left.name.localeCompare(right.name),
				);
			});
			return true;
		} catch {
			setError("These chat tags could not be saved locally.");
			return false;
		}
	}

	async function submit(): Promise<boolean> {
		if (!historyLoaded || isSubmitting) return false;
		setError(null);
		if (modelSettings.selectedProfile?.enabled === false) {
			setError("Enable this model in settings before sending a decision.");
			return false;
		}
		const draftError = validateDecisionDraft(draft);
		if (draftError) {
			setError(draftError);
			return false;
		}

		const { state, questions } = serializeDecisionDraft(draft);
		const submittedDraft = cloneDraft(draft);
		const prompt = draft.prompt.trim();
		const runId = `decision-${crypto.randomUUID()}`;
		const runModel = model || DEFAULT_MODEL_ID;
		const conversation =
			activeConversation ?? createDecisionConversation(runModel);
		const conversationId = conversation.id;
		const hasPreviousRuns = runs.some(
			(run) => run.conversationId === conversationId,
		);
		const conversationTitle =
			conversation.titleLocked || hasPreviousRuns
				? conversation.title
				: truncateConversationTitle(prompt);
		const createdAt = new Date().toISOString();
		const updatedConversation = {
			...conversation,
			title: conversationTitle,
			modelId: runModel,
			updatedAt: createdAt,
		};
		setConversations((previous) =>
			sortDecisionConversations([
				...previous.filter((entry) => entry.id !== conversationId),
				updatedConversation,
			]),
		);
		setActiveConversationId(conversationId);
		persistActiveConversation(conversationId);
		void upsertChat(updatedConversation, "decisions").catch(() => {
			setError("This chat could not be saved locally.");
		});
		const pendingRun: DecisionRun = {
			id: runId,
			conversationId,
			conversationTitle,
			input: prompt,
			model: runModel,
			request: {
				state,
				questions,
			},
			draft: submittedDraft,
			result: null,
			createdAt,
			isPending: true,
		};
		setRuns((previousRuns) => [
			...previousRuns,
			pendingRun,
		]);
		setDraft(createDefaultDecisionDraft(submittedDraft.mode));
		window.requestAnimationFrame(() => {
			document
				.querySelector<HTMLElement>("[data-decision-question-input='true']")
				?.blur();
		});
		void evaluateRun(runId, {
			model: runModel,
			state,
			questions,
		}, pendingRun);
		return true;
	}

	async function evaluateRun(
		runId: string,
		request: DecisionRequest,
		baseRun: DecisionRun,
	) {
		setError(null);
		setRuns((previousRuns) =>
			previousRuns.map((run) =>
				run.id === runId
					? {
							...run,
							result: null,
							completedAt: undefined,
							isPending: true,
							error: undefined,
						}
					: run,
			),
		);
		setIsSubmitting(true);
		try {
			const response = await fetchChatWebApi("/api/chat/decisions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requestBody: {
						model: request.model,
						state: request.state,
						questions: request.questions,
						meta: true,
					},
					appHeaders: APP_HEADERS,
				}),
			});
			const body = await response.text();
			if (!response.ok) throw new Error(formatErrorBody(body, response.status));
			const parsedResult = body ? JSON.parse(body) : null;
			const completedRun: DecisionRun = {
				...baseRun,
				result: parsedResult,
				completedAt: new Date().toISOString(),
				isPending: false,
				error: undefined,
			};
			setRuns((previousRuns) =>
				previousRuns.map((run) =>
					run.id === runId ? completedRun : run,
				),
			);
			await persistRun(completedRun).catch(() => {
				setError("The decision completed, but it could not be saved locally.");
			});
		} catch (submissionError) {
			const message =
				submissionError instanceof Error
					? submissionError.message
					: "Decisions request failed.";
			setError(message);
			const failedRun: DecisionRun = {
				...baseRun,
				result: null,
				completedAt: new Date().toISOString(),
				isPending: false,
				error: message,
			};
			setRuns((previousRuns) =>
				previousRuns.map((run) =>
					run.id === runId ? failedRun : run,
				),
			);
			await persistRun(failedRun).catch(() => undefined);
		} finally {
			setIsSubmitting(false);
		}
	}

	function retryRun(run: DecisionRun) {
		if (isSubmitting) return;
		void evaluateRun(run.id, {
			model: run.model,
			...run.request,
		}, run);
	}

	function startEditingRun(run: DecisionRun) {
		if (isSubmitting) return;
		setEditingRunId(run.id);
		setEditingValue(run.input);
		setError(null);
	}

	function cancelEditingRun() {
		setEditingRunId(null);
		setEditingValue("");
		setError(null);
	}

	function saveEditedRun(run: DecisionRun) {
		if (isSubmitting) return;
		const nextPrompt = editingValue.trim();
		const nextDraft = { ...cloneDraft(run.draft), prompt: nextPrompt };
		const draftError = validateDecisionDraft(nextDraft);
		if (draftError) {
			setError(draftError);
			return;
		}
		if (nextPrompt === run.input) {
			cancelEditingRun();
			return;
		}
		const { state, questions } = serializeDecisionDraft(nextDraft);
		const editedRun: DecisionRun = {
			...run,
			input: nextPrompt,
			request: { state, questions },
			draft: nextDraft,
		};
		setEditingRunId(null);
		setEditingValue("");
		void evaluateRun(
			run.id,
			{ model: run.model, state, questions },
			editedRun,
		);
	}

	async function branchRun(run: DecisionRun) {
		await createNewConversation(cloneDraft(run.draft));
		window.requestAnimationFrame(() => {
			document
				.querySelector<HTMLElement>("[data-decision-question-input='true']")
				?.focus();
		});
	}

	async function copyRunResult(run: DecisionRun) {
		if (run.result === null || run.result === undefined) return;
		try {
			await navigator.clipboard.writeText(JSON.stringify(run.result, null, 2));
			setCopiedRunId(run.id);
			window.setTimeout(() => {
				setCopiedRunId((currentRunId) =>
					currentRunId === run.id ? null : currentRunId,
				);
			}, 1600);
		} catch {
			setError("Unable to copy the decision response.");
		}
	}

	async function copyRunInput(run: DecisionRun) {
		try {
			await navigator.clipboard.writeText(run.input);
			setCopiedInputRunId(run.id);
			window.setTimeout(() => {
				setCopiedInputRunId((currentRunId) =>
					currentRunId === run.id ? null : currentRunId,
				);
			}, 1600);
		} catch {
			setError("Unable to copy the decision question.");
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<DecisionsChatSidebar
				conversations={conversations}
				activeConversationId={activeConversationId}
				historyLoaded={historyLoaded}
				collapsed={sidebarCollapsed}
				availableTags={chatTags}
				onCreate={startNewConversation}
				onSelect={selectConversation}
				onRename={renameConversation}
				onTogglePin={(conversation) => void toggleConversationPin(conversation)}
				onSaveTags={saveConversationTags}
				onDelete={deleteConversation}
			/>
			<header className="border-b border-border px-3 py-3 md:px-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="-ml-1 h-8 w-8"
							onClick={toggleSidebar}
							aria-label={
								sidebarState === "expanded"
										? "Collapse sidebar"
										: "Expand sidebar"
							}
						>
							{sidebarState === "expanded" ? (
								<PanelLeftClose className="h-4 w-4" />
							) : (
								<PanelLeftOpen className="h-4 w-4" />
							)}
						</Button>
						<RoomModelSelector
							models={roomModels}
							selectedModelIds={model ? [model] : []}
							onSelectModel={setModel}
							modelDisplayNameById={modelSettings.modelDisplayNameById}
							modelEnabledById={modelSettings.modelEnabledById}
							onOpenModelSettingsForModel={modelSettings.openModelSettingsForModel}
						/>
					</div>

					<div className="flex items-center gap-2">
						<RoomSdkExport />
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={startNewConversation}
									disabled={!historyLoaded}
									aria-label="New chat"
								>
									<SquarePen className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>New chat</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => modelSettings.openModelSettingsForModel(model)}
									aria-label="Open decision settings"
								>
									<Settings className="h-5 w-5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Settings</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</header>

			<main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 md:px-6">
				<div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-5">
					{activeRuns.length === 0 ? (
						<RoomEmptyState
							title="Decisions"
							description="Ask Jev to turn account state into a clear, typed decision."
							suggestions={[
								{
									label: "Check outreach readiness",
									prompt: "Is this account ready for outreach?",
								},
								{
									label: "Find a collaboration signal",
									prompt: "Does this account show a recent collaboration signal?",
								},
								{
									label: "Assess product adoption",
									prompt: "How strong is this account's product adoption?",
								},
							]}
							onSelectPrompt={(prompt) =>
								setDraft((currentDraft) => ({
									...currentDraft,
									prompt,
								}))
							}
						/>
					) : (
						<MessageScroller.Provider
							key={activeConversationId}
							autoScroll
							defaultScrollPosition="end"
							scrollEdgeThreshold={48}
							scrollMargin={24}
						>
							<MessageScroller.Root className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden overscroll-contain">
								<ScrollArea
									className="h-full min-w-0 w-full"
									viewportClassName="overscroll-contain pr-1"
									viewportRef={scrollViewportRef}
									viewportRender={
										<MessageScroller.Viewport
											aria-label="Decision messages"
											role="region"
										/>
									}
								>
									<MessageScroller.Content className="space-y-8 pb-2">
								{activeRuns.map((run) => {
									const sentAtLabel = formatDecisionTime(run.createdAt);
									const responseSentAtLabel = formatDecisionTime(
										run.completedAt ?? run.createdAt,
									);
									const responseMetadata = getDecisionResponseMetadata(run.result);
									const modelLogoId = run.model.split("/")[0] || "phaseo";
									const modelLink = getModelDetailsHref(modelLogoId, run.model);
									const modelLabel =
										modelSettings.modelDisplayNameById[run.model] ??
										catalogueModelNameById[run.model] ??
										run.model.split("/").pop() ??
										run.model;
									return (
										<MessageScroller.Item
											key={run.id}
											messageId={run.id}
											scrollAnchor
										>
										<section data-decision-run-id={run.id} className="space-y-5">
											<Message
												align="end"
												className="group/message min-w-0 max-w-full"
											>
												<MessageContent className="max-w-[min(100%,42rem)] items-end gap-2">
													<div
														data-slot="message-panel"
														className="min-w-0 max-w-full w-fit rounded-md px-4 py-3 text-sm leading-relaxed shadow-sm"
														style={{
															backgroundColor: DEFAULT_USER_MESSAGE_ACCENT_COLOR,
															color: "#ffffff",
														}}
													>
														{editingRunId === run.id ? (
															<div className="grid gap-3">
																<Textarea
																	autoFocus
																	value={editingValue}
																	onChange={(event) => setEditingValue(event.target.value)}
																	onKeyDown={(event) => {
																		if (event.key === "Escape") cancelEditingRun();
																	}}
																	rows={3}
																	className="min-h-[100px] resize-none"
																	aria-label="Edit decision question"
																/>
																<div className="flex items-center justify-end gap-2">
																	<Button size="sm" variant="ghost" onClick={cancelEditingRun}>
																		<X className="mr-1 h-4 w-4" />
																		Cancel
																	</Button>
																	<Button
																		size="sm"
																		onClick={() => saveEditedRun(run)}
																		disabled={!editingValue.trim() || isSubmitting}
																	>
																		<Save className="mr-1 h-4 w-4" />
																		Save
																	</Button>
																</div>
															</div>
														) : (
															<span className="whitespace-pre-wrap">{run.input}</span>
														)}
													</div>
													<UserMessageFooter
														copied={copiedInputRunId === run.id}
														sentAtLabel={sentAtLabel || null}
														onCopy={() => void copyRunInput(run)}
														onEdit={() => startEditingRun(run)}
													/>
												</MessageContent>
											</Message>

											<Message
												align="start"
												className="group/message min-w-0 max-w-full"
											>
												<MessageContent className="max-w-[min(100%,46rem)] items-start gap-2">
													<MessageHeader className="mb-0 flex-col items-start gap-0.5 px-0 text-xs text-muted-foreground">
														<Link
															href={modelLink ?? "#"}
															className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
														>
															<Logo
																id={modelLogoId}
																alt="TypeSafe"
																width={18}
																height={18}
																className="shrink-0 rounded-none"
															/>
															<span className="truncate">{modelLabel}</span>
														</Link>
													</MessageHeader>
													{run.isPending ? (
														<RoomWorkingIndicator
															label="Evaluating decision…"
															className="self-start justify-start py-1"
														/>
													) : run.error ? (
														<RoomErrorNotice error={run.error} />
													) : (
														<DecisionResponseCard result={run.result} />
													)}
													<AssistantMessageFooter
														activeVariantIndex={0}
														assistantCopied={copiedRunId === run.id}
														costLabel={responseMetadata.costLabel}
														endToEndDisplay={responseMetadata.endToEndDisplay}
														endToEndMs={responseMetadata.endToEndMs}
														generationMs={responseMetadata.generationMs}
														isPendingAssistant={run.isPending}
														latencyMs={responseMetadata.latencyMs}
														metadataOpen={metadataOpenRunId === run.id}
														metadataProviderId={responseMetadata.metadataProviderId}
														metadataProviderLabel={responseMetadata.metadataProviderLabel}
														metadataServiceTier={null}
														inputTokens={responseMetadata.inputTokens}
														outputSpeedTps={responseMetadata.outputSpeedTps}
														sentAtLabel={responseSentAtLabel || null}
														onBranch={() => branchRun(run)}
														onCopy={() => void copyRunResult(run)}
														onMetadataOpenChange={(open) =>
															setMetadataOpenRunId(open ? run.id : null)
														}
														onRetry={() => retryRun(run)}
														onSelectVariant={() => undefined}
														throughputTps={responseMetadata.throughputTps}
														outputTokens={responseMetadata.outputTokens}
														totalTokens={responseMetadata.totalTokens}
														variantCount={1}
													/>
												</MessageContent>
											</Message>
										</section>
										</MessageScroller.Item>
									);
								})}
									</MessageScroller.Content>
								</ScrollArea>
								<MessageScroller.Button
									aria-label="Scroll to latest decision"
									className="absolute bottom-4 left-1/2 z-20 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=false]:pointer-events-none data-[active=false]:opacity-0"
									direction="end"
								>
									<ArrowDown className="h-4 w-4" />
								</MessageScroller.Button>
							</MessageScroller.Root>
						</MessageScroller.Provider>
					)}
				</div>
			</main>

			<RoomComposerFooter>
				<div className="mx-auto w-full max-w-3xl">
					<RoomComposerSurface>
						<DecisionComposer
							draft={draft}
							error={error}
							historyLoaded={historyLoaded}
							isSubmitting={isSubmitting}
							onDraftChange={setDraft}
							onSubmit={submit}
						/>
					</RoomComposerSurface>
				</div>
			</RoomComposerFooter>
			{settingsProfile ? (
				<DecisionsModelSettingsDialog
					open={modelSettings.modelSettingsOpen}
					onOpenChange={modelSettings.handleModelSettingsOpenChange}
					settings={settingsProfile}
					modelChoices={modelSettings.modelSettingsChoices}
					selectedModelId={settingsModelId}
					onModelChange={modelSettings.handleModelSettingsModelChange}
					providerOptions={modelSettings.providerOptions}
					supportedProvidersForModel={modelSettings.supportedProvidersForModel}
					onUpdateBase={modelSettings.updateModelBaseSettings}
					onReset={modelSettings.resetModelSettings}
				/>
			) : null}
		</div>
	);
}
