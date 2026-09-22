import { chatStorageKey } from "@/lib/chat/userStorage";
import type { ChatRoomId } from "@/lib/chat/rooms";

export type ChatMessageVariant = {
    id: string;
    content: string;
    createdAt: string;
    usage?: Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
};

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    modelId?: string;
    providerId?: string;
    providerName?: string | null;
    variants?: ChatMessageVariant[];
    activeVariantIndex?: number;
    usage?: Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
};

export type ChatTag = {
    id: string;
    name: string;
    color: string;
};

export type UnifiedChatEndpoint =
    | "responses"
    | "images.generations"
    | "video.generation"
    | "audio.speech"
    | "audio.transcription"
    | "audio.translation"
    | "moderations"
    | "embeddings";

export type ChatServerToolType =
	| "gateway:datetime"
	| "phaseo:web_search"
	| "phaseo:web_fetch"
	| "phaseo:advisor"
	| "phaseo:image_generation"
	| "phaseo:apply_patch"
	| "phaseo:fusion"
	| "phaseo:subagent";

export type ChatReasoningEffort =
	| "none"
	| "instant"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

export type ChatAdvisorServerToolConfig = {
    name?: string;
    model?: string;
    instructions?: string;
    forwardTranscript?: boolean;
    maxUses?: number | null;
    maxCompletionTokens?: number | null;
    temperature?: number | null;
	reasoningEffort?: ChatReasoningEffort;
};

export type ChatSubagentServerToolConfig = {
    model?: string;
    instructions?: string;
    maxUses?: number | null;
    maxCompletionTokens?: number | null;
    temperature?: number | null;
	reasoningEffort?: ChatReasoningEffort;
};

export type ChatFusionServerToolConfig = {
    models?: string[];
    judgeModel?: string;
    maxUses?: number | null;
};

export type ChatDatetimeServerToolConfig = {
    timezone?: string;
};

export type ChatWebSearchServerToolConfig = {
    engine?: "auto" | "native" | "exa" | "parallel" | "firecrawl" | "perplexity";
    searchContextSize?: "low" | "medium" | "high";
    maxResults?: number | null;
    maxTotalResults?: number | null;
    maxCharacters?: number | null;
    allowedDomains?: string;
    excludedDomains?: string;
    includeHighlights?: boolean;
    includeText?: boolean;
};

export type ChatWebFetchServerToolConfig = {
    engine?: "auto" | "native" | "direct" | "exa" | "parallel" | "firecrawl";
    maxChars?: number | null;
    allowedDomains?: string;
    blockedDomains?: string;
};

export type ChatImageGenerationServerToolConfig = {
    model?: string;
    quality?: "auto" | "low" | "medium" | "high";
    size?: string;
    aspectRatio?: string;
    background?: "auto" | "transparent" | "opaque";
    outputFormat?: "auto" | "png" | "jpeg" | "webp";
    outputCompression?: number | null;
    moderation?: "auto" | "low" | "standard";
};

export type ChatServerToolConfigs = {
    datetime?: ChatDatetimeServerToolConfig;
    webSearch?: ChatWebSearchServerToolConfig;
    webFetch?: ChatWebFetchServerToolConfig;
    advisor?: ChatAdvisorServerToolConfig;
    advisors?: ChatAdvisorServerToolConfig[];
    imageGeneration?: ChatImageGenerationServerToolConfig;
    fusion?: ChatFusionServerToolConfig;
    subagent?: ChatSubagentServerToolConfig;
};

export type ChatModelSettings = {
    temperature: number | null;
    maxOutputTokens: number | null;
    topP?: number | null;
    topK?: number | null;
    minP?: number | null;
    topA?: number | null;
    presencePenalty?: number | null;
    frequencyPenalty?: number | null;
    repetitionPenalty?: number | null;
    seed?: number | null;
    systemPrompt?: string;
    stream: boolean;
    providerId?: string;
    serviceTier?: "standard" | "priority" | "flex";
    reasoningEnabled?: boolean;
	reasoningEffort?: ChatReasoningEffort;
    endpoint?: UnifiedChatEndpoint;
    webSearchEnabled?: boolean;
    apiServerToolsEnabled?: boolean;
    serverTools?: ChatServerToolType[];
    serverToolConfigs?: ChatServerToolConfigs;
    imageOutputEnabled?: boolean;
    enabled?: boolean;
    displayName?: string;
};

export type ChatSettings = ChatModelSettings & {
    compareMode?: boolean;
    compareModelIds?: string[];
    modelOverridesById?: Record<string, Partial<ChatModelSettings>>;
};

export type ChatThread = {
    id: string;
    /** Stable request correlation ID. Existing chats use their persisted thread ID. */
    sessionId?: string;
    title: string;
    titleLocked?: boolean;
    pinned?: boolean;
    modelId: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
    settings: ChatSettings;
    tags?: ChatTag[];
};

const DB_NAME = "phaseo-chat";
const DEFAULT_CHAT_TAG_COLOR = "#737373";
const DB_VERSION = 9;
const LEGACY_TEXT_STORE_NAME = "chats";
const TAG_STORE_NAME = "chat-tags";
const ROOM_STORE_NAMES: Record<ChatRoomId, string> = {
    text: LEGACY_TEXT_STORE_NAME,
    fusion: "chats-fusion",
    image: "chats-image",
    video: "chats-video",
    audio: "chats-audio",
    speech: "chats-speech",
    "speech-to-text": "chats-speech-to-text",
    music: "chats-music",
    realtime: "chats-realtime",
    moderation: "chats-moderation",
    embeddings: "chats-embeddings",
    ocr: "chats-ocr",
    rerank: "chats-rerank",
    decisions: "chats-decisions",
};

function getStoreName(roomId: ChatRoomId): string {
    return ROOM_STORE_NAMES[roomId];
}

export function normalizeChatTags(value: unknown): ChatTag[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const byId = new Map<string, ChatTag>();
    for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
        }

        const candidate = item as Partial<Record<keyof ChatTag, unknown>>;
        const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
        const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
        const color =
            typeof candidate.color === "string" && candidate.color.trim()
                ? candidate.color.trim()
                : DEFAULT_CHAT_TAG_COLOR;

        if (!id || !name) {
            continue;
        }

        byId.set(id, { id, name, color });
    }

    return Array.from(byId.values());
}

export function normalizeChatThread(chat: ChatThread): ChatThread {
    return {
        ...chat,
        tags: normalizeChatTags((chat as { tags?: unknown }).tags),
    };
}

export function getChatThreadSessionId(
    thread: Pick<ChatThread, "id" | "sessionId">,
): string {
    const sessionId = typeof thread.sessionId === "string" ? thread.sessionId.trim() : "";
    return sessionId || thread.id;
}

export function openChatDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("IndexedDB is only available in the browser."));
            return;
        }

        const request = window.indexedDB.open(chatStorageKey(DB_NAME), DB_VERSION);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const storeName of Object.values(ROOM_STORE_NAMES)) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: "id" });
                }
            }
            if (!db.objectStoreNames.contains(TAG_STORE_NAME)) {
                db.createObjectStore(TAG_STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            try {
                chatStorageKey(DB_NAME); // Reject opens completed after an identity change.
                resolve(db);
            } catch (error) { db.close(); reject(error); }
        };
    });
}

const openDb = openChatDatabase;

async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
    roomId: ChatRoomId = "text",
): Promise<T> {
    const db = await openDb();
    const storeName = getStoreName(roomId);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        let result: T | undefined;
        let hasResult = false;
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => {
            result = request.result;
            hasResult = true;
        };
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB error"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
        tx.oncomplete = () => {
            if (!hasResult) {
                reject(new Error("IndexedDB request completed without a result."));
                return;
            }
            resolve(result as T);
        };
    });
}

export async function getAllChats(roomId: ChatRoomId = "text"): Promise<ChatThread[]> {
    const result = await withStore<ChatThread[]>(
        "readonly",
        (store) => store.getAll(),
        roomId,
    );
    return Array.isArray(result) ? result.map(normalizeChatThread) : [];
}

export async function getChat(
    id: string,
    roomId: ChatRoomId = "text",
): Promise<ChatThread | null> {
    const result = await withStore<ChatThread | undefined>(
        "readonly",
        (store) => store.get(id),
        roomId,
    );
    return result ? normalizeChatThread(result) : null;
}

export async function upsertChat(
    chat: ChatThread,
    roomId: ChatRoomId = "text",
): Promise<void> {
    await withStore(
        "readwrite",
        (store) => store.put(normalizeChatThread(chat)),
        roomId,
    );
}

export async function deleteChat(
    id: string,
    roomId: ChatRoomId = "text",
): Promise<void> {
    await withStore("readwrite", (store) => store.delete(id), roomId);
}

export async function getAllChatTags(): Promise<ChatTag[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TAG_STORE_NAME, "readonly");
        const store = tx.objectStore(TAG_STORE_NAME);
        const request = store.getAll();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => {
            const result = request.result;
            resolve(normalizeChatTags(result));
        };
    });
}

export async function upsertChatTags(tags: ChatTag[]): Promise<void> {
    const normalizedTags = normalizeChatTags(tags);
    if (normalizedTags.length === 0) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TAG_STORE_NAME, "readwrite");
        const store = tx.objectStore(TAG_STORE_NAME);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB error"));
        tx.oncomplete = () => resolve();
        for (const tag of normalizedTags) {
            store.put(tag);
        }
    });
}

export async function clearChatTags(): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TAG_STORE_NAME, "readwrite");
        const store = tx.objectStore(TAG_STORE_NAME);
        const request = store.clear();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => resolve();
    });
}
