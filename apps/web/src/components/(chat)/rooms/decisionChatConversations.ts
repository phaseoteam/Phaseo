import type { DecisionDraft } from "@/components/(chat)/DecisionComposer";
import {
	buildDefaultSystemPrompt,
	DEFAULT_SETTINGS,
} from "@/components/(chat)/playground/chat-playground-core";
import type { ChatThread } from "@/lib/indexeddb/chats";

export type DecisionRequest = {
	model: string;
	state: Record<string, unknown>;
	questions: Record<string, unknown>;
};

export type DecisionRun = {
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

export type DecisionHistoryPayload = Omit<DecisionRun, "isPending">;
export type DecisionConversation = ChatThread;

export function createConversationId(): string {
	return `decisions-${crypto.randomUUID()}`;
}

export function truncateConversationTitle(value: string, max = 72): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

export function createDecisionConversation(
	modelId: string,
	options: {
		id?: string;
		title?: string;
		createdAt?: string;
		updatedAt?: string;
		titleLocked?: boolean;
	} = {},
): DecisionConversation {
	const now = new Date().toISOString();
	const normalizedModelId = modelId || "typesafe/jev-1.13.0";
	return {
		id: options.id ?? createConversationId(),
		title: options.title ?? "New chat",
		titleLocked: options.titleLocked ?? false,
		pinned: false,
		modelId: normalizedModelId,
		createdAt: options.createdAt ?? now,
		updatedAt: options.updatedAt ?? now,
		messages: [],
		settings: {
			...DEFAULT_SETTINGS,
			serverTools: [...(DEFAULT_SETTINGS.serverTools ?? [])],
			serverToolConfigs: { ...DEFAULT_SETTINGS.serverToolConfigs },
			systemPrompt: buildDefaultSystemPrompt(normalizedModelId),
		},
		tags: [],
	};
}

export function sortDecisionConversations(
	conversations: DecisionConversation[],
): DecisionConversation[] {
	return [...conversations].sort((left, right) => {
		if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
		return right.updatedAt.localeCompare(left.updatedAt);
	});
}

export function buildDecisionConversations(
	runs: DecisionRun[],
	storedConversations: DecisionConversation[],
	defaultModelId: string,
): DecisionConversation[] {
	const conversations = new Map(
		storedConversations.map((conversation) => [conversation.id, conversation]),
	);
	const runsByConversation = new Map<string, DecisionRun[]>();
	for (const run of runs) {
		const conversationRuns = runsByConversation.get(run.conversationId) ?? [];
		conversationRuns.push(run);
		runsByConversation.set(run.conversationId, conversationRuns);
	}

	for (const [conversationId, conversationRuns] of runsByConversation) {
		conversationRuns.sort((left, right) =>
			left.createdAt.localeCompare(right.createdAt),
		);
		const latestRun = conversationRuns.reduce((latest, run) => {
			const latestAt = latest.completedAt ?? latest.createdAt;
			const runAt = run.completedAt ?? run.createdAt;
			return runAt > latestAt ? run : latest;
		});
		const latestAt = latestRun.completedAt ?? latestRun.createdAt;
		const existing = conversations.get(conversationId);
		if (existing) {
			conversations.set(conversationId, {
				...existing,
				title:
					existing.titleLocked || conversationRuns.length === 0
						? existing.title
						: conversationRuns[0].conversationTitle,
				updatedAt:
					latestAt > existing.updatedAt ? latestAt : existing.updatedAt,
			});
			continue;
		}

		const firstRun = conversationRuns[0];
		conversations.set(
			conversationId,
			createDecisionConversation(firstRun.model || defaultModelId, {
				id: conversationId,
				title: firstRun.conversationTitle,
				createdAt: firstRun.createdAt,
				updatedAt: latestAt,
				titleLocked: true,
			}),
		);
	}

	return sortDecisionConversations(Array.from(conversations.values()));
}

export function toStoredDecisionRun(run: DecisionRun): DecisionHistoryPayload {
	const { isPending: _isPending, ...payload } = run;
	return payload;
}

export function fromStoredDecisionRun(
	payload: DecisionHistoryPayload,
): DecisionRun {
	return { ...payload, isPending: false };
}
