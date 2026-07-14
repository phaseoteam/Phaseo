import type { ChatRoomId } from "@/lib/chat/rooms";

export type NonTextRoomId = Exclude<ChatRoomId, "text">;

export type RoomHistoryRecord<TPayload = Record<string, unknown>> = {
	id: string;
	roomId: NonTextRoomId;
	createdAt: string;
	updatedAt: string;
	payload: TPayload;
};

const DB_NAME = "phaseo-chat-room-history";
const LEGACY_DB_NAME = "ai-stats-chat-room-history";
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
		request.onsuccess = async () => {
			const db = request.result;
			await migrateLegacyChatRoomHistoryDb(db).catch(() => undefined);
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

async function migrateLegacyChatRoomHistoryDb(targetDb: IDBDatabase): Promise<void> {
	const migrationKey = "phaseo:indexeddb:migrated:chat-room-history";
	if (window.localStorage.getItem(migrationKey) === "1") return;
	const legacyDb = await openLegacyDb();
	if (!legacyDb) {
		window.localStorage.setItem(migrationKey, "1");
		return;
	}
	try {
		if ((await countStoreRecords(targetDb, STORE_NAME)) === 0) {
			const rows = await readAllFromStore(legacyDb, STORE_NAME);
			await writeAllToStore(targetDb, STORE_NAME, rows);
		}
		window.localStorage.setItem(migrationKey, "1");
	} finally {
		legacyDb.close();
	}
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
