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
    | "music.generate"
    | "audio.speech";

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
const DB_VERSION = 1;
const STORE_NAME = "chats";

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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => resolve(request.result);
    });
}

export async function getAllChats(): Promise<ChatThread[]> {
    const result = await withStore<ChatThread[]>("readonly", (store) => store.getAll());
    return Array.isArray(result) ? result : [];
}

export async function getChat(id: string): Promise<ChatThread | null> {
    const result = await withStore<ChatThread | undefined>("readonly", (store) =>
        store.get(id)
    );
    return result ?? null;
}

export async function upsertChat(chat: ChatThread): Promise<void> {
    await withStore("readwrite", (store) => store.put(chat));
}

export async function deleteChat(id: string): Promise<void> {
    await withStore("readwrite", (store) => store.delete(id));
}
