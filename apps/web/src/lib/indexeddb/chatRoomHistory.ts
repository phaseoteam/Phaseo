import type { ChatRoomId } from "@/lib/chat/rooms";

export type NonTextRoomId = Exclude<ChatRoomId, "text">;

export type RoomHistoryRecord<TPayload = Record<string, unknown>> = {
	id: string;
	roomId: NonTextRoomId;
	createdAt: string;
	updatedAt: string;
	payload: TPayload;
};

const DB_NAME = "ai-stats-chat-room-history";
const DB_VERSION = 1;
const STORE_NAME = "records";
const ROOM_ID_INDEX = "roomId";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			reject(new Error("IndexedDB is only available in the browser."));
			return;
		}

		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB error"));
		request.onupgradeneeded = () => {
			const db = request.result;
			const store = db.objectStoreNames.contains(STORE_NAME)
				? request.transaction?.objectStore(STORE_NAME)
				: db.createObjectStore(STORE_NAME, { keyPath: "id" });
			if (!store) return;
			if (!store.indexNames.contains(ROOM_ID_INDEX)) {
				store.createIndex(ROOM_ID_INDEX, "roomId", { unique: false });
			}
		};
		request.onsuccess = () => resolve(request.result);
	});
}

export async function listRoomHistory<TPayload = Record<string, unknown>>(
	roomId: NonTextRoomId,
): Promise<Array<RoomHistoryRecord<TPayload>>> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const index = store.index(ROOM_ID_INDEX);
		const request = index.getAll(IDBKeyRange.only(roomId));
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB error"));
		request.onsuccess = () => {
			const records =
				(Array.isArray(request.result)
					? request.result
					: []) as Array<RoomHistoryRecord<TPayload>>;
			records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			resolve(records);
		};
	});
}

export async function upsertRoomHistory<TPayload = Record<string, unknown>>(
	record: RoomHistoryRecord<TPayload>,
): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const request = store.put(record);
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB error"));
		request.onsuccess = () => resolve();
	});
}

export async function deleteRoomHistory(id: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const request = store.delete(id);
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB error"));
		request.onsuccess = () => resolve();
	});
}
