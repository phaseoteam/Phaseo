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
    | "ai-stats:web_search"
    | "ai-stats:web_fetch"
    | "ai-stats:advisor"
    | "ai-stats:image_generation"
    | "ai-stats:apply_patch";

export type ChatAdvisorServerToolConfig = {
    name?: string;
    model?: string;
    instructions?: string;
    forwardTranscript?: boolean;
    maxUses?: number | null;
    maxCompletionTokens?: number | null;
    temperature?: number | null;
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
};

export type ChatServerToolConfigs = {
    advisor?: ChatAdvisorServerToolConfig;
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
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
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

const DEFAULT_CHAT_TAG_COLOR = "#737373";
const DB_NAME = "ai-stats-chat";
const DB_VERSION = 7;
const LEGACY_TEXT_STORE_NAME = "chats";
const TAG_STORE_NAME = "chat-tags";
const ROOM_STORE_NAMES: Record<ChatRoomId, string> = {
    text: LEGACY_TEXT_STORE_NAME,
    image: "chats-image",
    video: "chats-video",
    audio: "chats-audio",
    speech: "chats-speech",
    "speech-to-text": "chats-speech-to-text",
    music: "chats-music",
    realtime: "chats-realtime",
    moderation: "chats-moderation",
    embeddings: "chats-embeddings",
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
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: "id" });
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
