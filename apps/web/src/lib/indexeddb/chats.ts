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

export type UnifiedChatEndpoint =
    | "responses"
    | "images.generations"
    | "video.generation"
    | "audio.speech"
    | "audio.transcription"
    | "audio.translation"
    | "moderations"
    | "embeddings";

export type ChatServerToolAdvisor = {
    name: string;
    model?: string;
    instructions?: string;
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
    reasoningEnabled?: boolean;
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
    endpoint?: UnifiedChatEndpoint;
    webSearchEnabled?: boolean;
    serverToolWebSearchEngine?: string;
    serverToolWebSearchContextSize?: "low" | "medium" | "high";
    serverToolWebSearchMaxResults?: number | null;
    serverToolWebSearchMaxTotalResults?: number | null;
    serverToolWebSearchMaxCharacters?: number | null;
    serverToolWebSearchAllowedDomains?: string;
    serverToolWebSearchBlockedDomains?: string;
    apiServerToolsEnabled?: boolean;
    serverToolTimezone?: string;
    serverToolWebFetchEnabled?: boolean;
    serverToolWebFetchEngine?: string;
    serverToolWebFetchMaxContentTokens?: number | null;
    serverToolWebFetchAllowedDomains?: string;
    serverToolWebFetchBlockedDomains?: string;
    serverToolAdvisorEnabled?: boolean;
    serverToolAdvisors?: ChatServerToolAdvisor[];
    serverToolImageGenerationEnabled?: boolean;
    serverToolImageGenerationModel?: string;
    serverToolImageGenerationQuality?: string;
    serverToolImageGenerationAspectRatio?: string;
    serverToolImageGenerationSize?: string;
    serverToolImageGenerationBackground?: string;
    serverToolImageGenerationOutputFormat?: string;
    serverToolImageGenerationOutputCompression?: number | null;
    serverToolImageGenerationModeration?: string;
    serverToolSubagentEnabled?: boolean;
    serverToolSubagentModel?: string;
    serverToolSubagentInstructions?: string;
    serverToolSubagentMaxUses?: number | null;
    serverToolFusionEnabled?: boolean;
    serverToolFusionAnalysisModels?: string[];
    serverToolFusionJudgeModel?: string;
    serverToolFusionMaxUses?: number | null;
    imageOutputEnabled?: boolean;
    enabled?: boolean;
    displayName?: string;
};

export type ChatSettings = ChatModelSettings & {
    compareMode?: boolean;
    compareModelIds?: string[];
    modelOverridesById?: Record<string, Partial<ChatModelSettings>>;
    contextMessageLimit?: number | "all";
};

export type ChatTag = {
    id: string;
    name: string;
    color: string;
};

export type ChatThread = {
    id: string;
    title: string;
    titleLocked?: boolean;
    pinned?: boolean;
    tags?: ChatTag[];
    modelId: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
    settings: ChatSettings;
};

const DB_NAME = "ai-stats-chat";
const DB_VERSION = 4;
const LEGACY_TEXT_STORE_NAME = "chats";
const TAG_STORE_NAME = "chat-tags";
const UPDATED_AT_INDEX = "updatedAt";
const ROOM_STORE_NAMES: Record<ChatRoomId, string> = {
    text: LEGACY_TEXT_STORE_NAME,
    image: "chats-image",
    video: "chats-video",
    audio: "chats-audio",
    moderation: "chats-moderation",
    embeddings: "chats-embeddings",
};

function getStoreName(roomId: ChatRoomId): string {
    return ROOM_STORE_NAMES[roomId];
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(new Error("IndexedDB is only available in the browser."));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const storeName of Object.values(ROOM_STORE_NAMES)) {
                let store: IDBObjectStore;
                if (!db.objectStoreNames.contains(storeName)) {
                    store = db.createObjectStore(storeName, { keyPath: "id" });
                } else {
                    store = request.transaction!.objectStore(storeName);
                }
                if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
                    store.createIndex(UPDATED_AT_INDEX, "updatedAt", { unique: false });
                }
            }
            if (!db.objectStoreNames.contains(TAG_STORE_NAME)) {
                db.createObjectStore(TAG_STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

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
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => resolve(request.result);
    });
}

export async function getAllChats(roomId: ChatRoomId = "text"): Promise<ChatThread[]> {
    const result = await withStore<ChatThread[]>(
        "readonly",
        (store) => store.getAll(),
        roomId,
    );
    return Array.isArray(result) ? result : [];
}

export async function getChatsPage(
    roomId: ChatRoomId = "text",
    options: { limit?: number; offset?: number } = {},
): Promise<{ chats: ChatThread[]; hasMore: boolean }> {
    const limit = Math.max(1, Math.floor(options.limit ?? 50));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const db = await openDb();
    const storeName = getStoreName(roomId);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const source: IDBIndex | IDBObjectStore = store.indexNames.contains(UPDATED_AT_INDEX)
            ? store.index(UPDATED_AT_INDEX)
            : store;
        const request = source.openCursor(null, "prev");
        const chats: ChatThread[] = [];
        let skipped = 0;
        let settled = false;

        const finish = (hasMore: boolean) => {
            if (settled) return;
            settled = true;
            resolve({ chats, hasMore });
        };

        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                finish(false);
                return;
            }
            if (skipped < offset) {
                skipped += 1;
                cursor.continue();
                return;
            }
            if (chats.length >= limit) {
                finish(true);
                return;
            }
            chats.push(cursor.value as ChatThread);
            cursor.continue();
        };
    });
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
    return result ?? null;
}

export async function upsertChat(
    chat: ChatThread,
    roomId: ChatRoomId = "text",
): Promise<void> {
    await withStore("readwrite", (store) => store.put(chat), roomId);
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
            resolve(Array.isArray(result) ? result as ChatTag[] : []);
        };
    });
}

export async function upsertChatTags(tags: ChatTag[]): Promise<void> {
    if (tags.length === 0) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TAG_STORE_NAME, "readwrite");
        const store = tx.objectStore(TAG_STORE_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB error"));
        for (const tag of tags) {
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
