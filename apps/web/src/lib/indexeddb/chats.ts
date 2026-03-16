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
};

const DB_NAME = "ai-stats-chat";
const DB_VERSION = 2;
const LEGACY_TEXT_STORE_NAME = "chats";
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
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: "id" });
                }
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
