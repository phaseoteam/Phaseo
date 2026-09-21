"use client";

import { createPortal } from "react-dom";
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
	Trash2,
	X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { filterModelsForRoom } from "@/lib/chat/rooms";
import { fetchChatWebApi } from "@/lib/web-api/client";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { APP_HEADERS } from "@/components/(chat)/playground/chat-playground-core";
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
import { DecisionsModelSettingsDialog } from "@/components/(chat)/rooms/settings/DecisionsModelSettingsDialog";
import { useRoomModelSettings } from "@/components/(chat)/rooms/useRoomModelSettings";
import { ROOM_SIDEBAR_SLOT_ID } from "@/components/(chat)/RoomScaffold";
import {
	CHAT_SIDEBAR_ACTIONS_CLASS,
	CHAT_SIDEBAR_HISTORY_GROUP_CLASS,
} from "@/components/(chat)/chatSidebarStyles";
import {
	deleteRoomHistory,
	listRoomHistory,
	upsertRoomHistory,
} from "@/lib/indexeddb/chatRoomHistory";
import { Button } from "@/components/ui/button";
import {
	Message,
	MessageContent,
	MessageHeader,
} from "@/components/ui/message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULT_MODEL_ID = "typesafe/jev-1.13.0";

type DecisionRequest = {
	model: string;
	state: Record<string, unknown>;
	questions: Record<string, unknown>;
};

type DecisionRun = {
	id: string;
	conversationId: string;
	conversationTitle: string;
	input: string;
	model: string;
	request: Omit<DecisionRequest, "model">;
	draft: DecisionDraft;
	result: unknown;
	createdAt: string;
	completedAt?: string;
	isPending: boolean;
	error?: string;
};

type DecisionHistoryPayload = Omit<DecisionRun, "isPending">;

type DecisionConversation = {
	id: string;
	title: string;
	updatedAt: string;
};

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

function createConversationId(): string {
	return `decisions-${crypto.randomUUID()}`;
}

function truncateConversationTitle(value: string, max = 72): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function buildDecisionConversations(runs: DecisionRun[]): DecisionConversation[] {
	const conversations = new Map<string, DecisionConversation>();
	for (const run of runs) {
		const updatedAt = run.completedAt ?? run.createdAt;
		const existing = conversations.get(run.conversationId);
		if (!existing || updatedAt > existing.updatedAt) {
			conversations.set(run.conversationId, {
				id: run.conversationId,
				title: run.conversationTitle,
				updatedAt,
			});
		}
	}
	return Array.from(conversations.values()).sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

function toStoredDecisionRun(run: DecisionRun): DecisionHistoryPayload {
	const { isPending: _isPending, ...payload } = run;
	return payload;
}

function fromStoredDecisionRun(payload: DecisionHistoryPayload): DecisionRun {
	return { ...payload, isPending: false };
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
	const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
	const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(null);
	const [historyLoaded, setHistoryLoaded] = useState(false);
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
	const conversations = useMemo(() => buildDecisionConversations(runs), [runs]);
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
		const frame = window.requestAnimationFrame(() => {
			setSidebarSlotEl(document.getElementById(ROOM_SIDEBAR_SLOT_ID));
		});
		return () => window.cancelAnimationFrame(frame);
	}, []);

	useEffect(() => {
		let mounted = true;
		void listRoomHistory<DecisionHistoryPayload>("decisions")
			.then((records) => {
				if (!mounted) return;
				const storedRuns = records.map((record) =>
					fromStoredDecisionRun(record.payload),
				);
				const storedConversations = buildDecisionConversations(storedRuns);
				setRuns(storedRuns);
				setActiveConversationId(
					storedConversations[0]?.id ?? createConversationId(),
				);
				setHistoryLoaded(true);
			})
			.catch(() => {
				if (!mounted) return;
				setActiveConversationId(createConversationId());
				setHistoryLoaded(true);
				setError("Local chat history could not be loaded.");
			});
		return () => {
			mounted = false;
		};
	}, []);

	function startNewConversation() {
		setDraft(createDefaultDecisionDraft());
		setActiveConversationId(createConversationId());
		setCopiedRunId(null);
		setCopiedInputRunId(null);
		setMetadataOpenRunId(null);
		setEditingRunId(null);
		setEditingValue("");
		setError(null);
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

	async function deleteConversation(conversation: DecisionConversation) {
		const confirmed = window.confirm(`Delete "${conversation.title}"?`);
		if (!confirmed) return;
		const conversationRuns = runs.filter(
			(run) => run.conversationId === conversation.id,
		);
		await Promise.all(
			conversationRuns.map((run) => deleteRoomHistory(run.id)),
		);
		const nextRuns = runs.filter(
			(run) => run.conversationId !== conversation.id,
		);
		setRuns(nextRuns);
		if (activeConversationId === conversation.id) {
			const nextConversations = buildDecisionConversations(nextRuns);
			setActiveConversationId(
				nextConversations[0]?.id ?? createConversationId(),
			);
		}
	}

	async function submit() {
		if (isSubmitting) return;
		setError(null);
		if (modelSettings.selectedProfile?.enabled === false) {
			setError("Enable this model in settings before sending a decision.");
			return;
		}
		const draftError = validateDecisionDraft(draft);
		if (draftError) {
			setError(draftError);
			return;
		}

		const { state, questions } = serializeDecisionDraft(draft);
		const submittedDraft = cloneDraft(draft);
		const prompt = draft.prompt.trim();
		const runId = `decision-${crypto.randomUUID()}`;
		const runModel = model || DEFAULT_MODEL_ID;
		const conversationId = activeConversationId ?? createConversationId();
		const conversationTitle =
			activeConversation?.title ?? truncateConversationTitle(prompt);
		if (!activeConversationId) setActiveConversationId(conversationId);
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
			createdAt: new Date().toISOString(),
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
		await evaluateRun(runId, {
			model: runModel,
			state,
			questions,
		}, pendingRun);
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

	function branchRun(run: DecisionRun) {
		setActiveConversationId(createConversationId());
		setDraft(cloneDraft(run.draft));
		setError(null);
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

	const sidebarHistory = sidebarSlotEl
		? createPortal(
				<>
					<div
						data-chat-sidebar-actions="true"
						className={CHAT_SIDEBAR_ACTIONS_CLASS}
					>
						<Button
							type="button"
							variant="ghost"
							className="h-8 min-w-0 w-full justify-start gap-2 px-2 text-sm font-medium"
							onClick={startNewConversation}
							aria-label="New Chat"
						>
							<SquarePen className="h-4 w-4 shrink-0" />
							{sidebarCollapsed ? null : (
								<span className="truncate text-left">New Chat</span>
							)}
						</Button>
					</div>
					<ScrollArea className="min-h-0 flex-1">
						<SidebarGroup className={CHAT_SIDEBAR_HISTORY_GROUP_CLASS}>
							<SidebarGroupLabel>Chats</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{conversations.map((conversation) => (
										<SidebarMenuItem
											key={conversation.id}
											className="mb-1 w-full overflow-hidden last:mb-0"
										>
											<SidebarMenuButton
												className="rounded-md"
												isActive={activeConversationId === conversation.id}
												onClick={() => {
													setActiveConversationId(conversation.id);
													setError(null);
												}}
											>
												<span className="w-0 grow overflow-hidden text-ellipsis whitespace-nowrap">
													{conversation.title}
												</span>
											</SidebarMenuButton>
											<SidebarMenuAction
												showOnHover
												onClick={() => void deleteConversation(conversation)}
												aria-label={`Delete ${conversation.title}`}
											>
												<Trash2 className="h-4 w-4" />
											</SidebarMenuAction>
										</SidebarMenuItem>
									))}
									{historyLoaded && conversations.length === 0 ? (
										<p className="px-2 py-3 text-xs text-muted-foreground">
											No chats yet.
										</p>
									) : null}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</ScrollArea>
				</>,
				sidebarSlotEl,
			)
		: null;

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			{sidebarHistory}
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
													<div className="min-w-0 max-w-full rounded-md bg-foreground px-4 py-3 text-sm leading-relaxed text-background shadow-sm">
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
							isSubmitting={isSubmitting}
							onDraftChange={setDraft}
							onSubmit={() => void submit()}
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
