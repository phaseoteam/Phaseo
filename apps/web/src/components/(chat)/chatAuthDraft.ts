const CHAT_AUTH_DRAFT_KEY = "phaseo:chat:auth-draft:v1";
const CHAT_AUTH_DRAFT_VERSION = 1;
const CHAT_AUTH_DRAFT_TTL_MS = 30 * 60 * 1000;
const CHAT_AUTH_DRAFT_MAX_LENGTH = 100_000;

type ChatAuthDraft = {
	version: typeof CHAT_AUTH_DRAFT_VERSION;
	content: string;
	createdAt: number;
};

function resolveStorage(storage?: Storage): Storage | null {
	if (storage) return storage;
	if (typeof window === "undefined") return null;
	try {
		// Only the explicit sign-in draft crosses anonymous -> signed-in state,
		// and only within this tab. Never consume old browser-wide drafts.
		return window.sessionStorage;
	} catch {
		return null;
	}
}

export function saveChatAuthDraft(
	content: string,
	options: { storage?: Storage; now?: number } = {},
) {
	const storage = resolveStorage(options.storage);
	if (!storage) return;
	try {
		if (!content.trim() || content.length > CHAT_AUTH_DRAFT_MAX_LENGTH) {
			storage.removeItem(CHAT_AUTH_DRAFT_KEY);
			return;
		}
		const draft: ChatAuthDraft = {
			version: CHAT_AUTH_DRAFT_VERSION,
			content,
			createdAt: options.now ?? Date.now(),
		};
		storage.setItem(CHAT_AUTH_DRAFT_KEY, JSON.stringify(draft));
	} catch {
		// Storage can be unavailable without blocking authentication.
	}
}

export function readChatAuthDraft(
	options: { storage?: Storage; now?: number } = {},
): string | null {
	const storage = resolveStorage(options.storage);
	if (!storage) return null;
	try {
		const rawDraft = storage.getItem(CHAT_AUTH_DRAFT_KEY);
		if (!rawDraft) return null;
		const draft = JSON.parse(rawDraft) as Partial<ChatAuthDraft>;
		const now = options.now ?? Date.now();
		if (
			draft.version !== CHAT_AUTH_DRAFT_VERSION ||
			typeof draft.content !== "string" ||
			!draft.content.trim() ||
			draft.content.length > CHAT_AUTH_DRAFT_MAX_LENGTH ||
			typeof draft.createdAt !== "number" ||
			now - draft.createdAt > CHAT_AUTH_DRAFT_TTL_MS ||
			draft.createdAt > now
		) {
			return null;
		}
		return draft.content;
	} catch {
		return null;
	}
}

export function clearChatAuthDraft(storage?: Storage) {
	const resolvedStorage = resolveStorage(storage);
	try {
		resolvedStorage?.removeItem(CHAT_AUTH_DRAFT_KEY);
	} catch {
		// Storage can be unavailable without blocking authentication.
	}
}

export function consumeChatAuthDraft(
	options: { storage?: Storage; now?: number } = {},
): string | null {
	const draft = readChatAuthDraft(options);
	clearChatAuthDraft(options.storage);
	return draft;
}
