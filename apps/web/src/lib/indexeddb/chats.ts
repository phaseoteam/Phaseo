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
    | "phaseo:apply_patch";

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

const DB_NAME = "phaseo-chat";
const LEGACY_DB_NAME = "ai-stats-chat";
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
        request.onsuccess = async () => {
            const db = request.result;
            await migrateLegacyChatDb(db).catch(() => undefined);
            resolve(db);
        };
    });
}

async function databaseExists(name: string): Promise<boolean> {
    const factory = window.indexedDB as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string | null }>>;
    };
    if (!factory.databases) return true;
    const databases = await factory.databases();
    return databases.some((database) => database.name === name);
}

function openLegacyDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        void (async () => {
            if (!(await databaseExists(LEGACY_DB_NAME).catch(() => true))) {
                resolve(null);
                return;
            }
            const request = window.indexedDB.open(LEGACY_DB_NAME, DB_VERSION);
            request.onerror = () => resolve(null);
            request.onsuccess = () => resolve(request.result);
        })();
    });
}

function readAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
    return new Promise((resolve) => {
        if (!db.objectStoreNames.contains(storeName)) {
            resolve([]);
            return;
        }
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onerror = () => resolve([]);
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    });
}

function countStoreRecords(db: IDBDatabase, storeName: string): Promise<number> {
    return new Promise((resolve) => {
        if (!db.objectStoreNames.contains(storeName)) {
            resolve(0);
            return;
        }
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).count();
        request.onerror = () => resolve(0);
        request.onsuccess = () => resolve(Number(request.result ?? 0));
    });
}

function writeAllToStore(db: IDBDatabase, storeName: string, rows: unknown[]): Promise<void> {
    return new Promise((resolve) => {
        if (!rows.length || !db.objectStoreNames.contains(storeName)) {
            resolve();
            return;
        }
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        for (const row of rows) {
            store.put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
    });
}

async function migrateLegacyChatDb(targetDb: IDBDatabase): Promise<void> {
    const migrationKey = "phaseo:indexeddb:migrated:chat";
    if (window.localStorage.getItem(migrationKey) === "1") return;
    const legacyDb = await openLegacyDb();
    if (!legacyDb) {
        window.localStorage.setItem(migrationKey, "1");
        return;
    }
    try {
        const storeNames = Array.from(
            new Set([...Object.values(ROOM_STORE_NAMES), TAG_STORE_NAME])
        );
        for (const storeName of storeNames) {
            if ((await countStoreRecords(targetDb, storeName)) > 0) continue;
            const rows = await readAllFromStore(legacyDb, storeName);
            await writeAllToStore(targetDb, storeName, rows);
        }
        window.localStorage.setItem(migrationKey, "1");
    } finally {
        legacyDb.close();
    }
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

export async function getAllChatTags(): Promise<ChatTag[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(TAG_STORE_NAME, "readonly");
        const store = tx.objectStore(TAG_STORE_NAME);
        const request = store.getAll();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
        request.onsuccess = () => {
            const result = request.result;
            resolve(Array.isArray(result) ? (result as ChatTag[]) : []);
        };
    });
}

export async function upsertChatTags(tags: ChatTag[]): Promise<void> {
    if (tags.length === 0) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TAG_STORE_NAME, "readwrite");
        const store = tx.objectStore(TAG_STORE_NAME);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB error"));
        tx.oncomplete = () => resolve();
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
