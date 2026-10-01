import { assertChatStorageOwner, chatStorageKey } from "./userStorage";
import { openChatDatabase } from "@/lib/indexeddb/chats";
import { openChatRoomHistoryDatabase } from "@/lib/indexeddb/chatRoomHistory";
import { openCouncilDatabase } from "@/lib/indexeddb/experimentsCouncil";

type Row = Record<string, unknown> & { id: string | number };
type Claim = { userId: string; complete: boolean };
const CLAIM_DB = "phaseo-chat-legacy-migration-v1";
const IMPORT_KEY = "_phaseoLegacyImportV1";

function openClaimDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(CLAIM_DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore("migration");
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
}

// Read/claim in one transaction: two tabs/accounts cannot both win.
async function claimMigration(userId: string, complete = false): Promise<boolean> {
	const db = await openClaimDatabase();
	try {
		return await new Promise<boolean>((resolve, reject) => {
			const tx = db.transaction("migration", "readwrite");
			let allowed = false;
			const store = tx.objectStore("migration");
			const request = store.get("owner");
			request.onsuccess = () => {
				try {
					assertChatStorageOwner(userId);
					const claim = request.result as Claim | undefined;
					if (claim && (claim.userId !== userId || claim.complete)) return;
					store.put({ userId, complete } satisfies Claim, "owner");
					allowed = true;
				} catch { tx.abort(); }
			};
			tx.oncomplete = () => resolve(allowed);
			tx.onabort = () => reject(tx.error ?? new Error("Migration interrupted"));
		});
	} finally { db.close(); }
}

function readLegacyDatabase(name: string): Promise<Record<string, Row[]>> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name);
		let missing = false;
		// Never create or upgrade legacy databases just to check for old history.
		request.onupgradeneeded = () => { missing = true; request.transaction!.abort(); };
		request.onerror = () => missing ? resolve({}) : reject(request.error);
		request.onsuccess = () => {
			const db = request.result;
			const stores = Array.from(db.objectStoreNames);
			if (!stores.length) { db.close(); resolve({}); return; }
			const result: Record<string, Row[]> = {};
			const tx = db.transaction(stores, "readonly");
			for (const store of stores) {
				const read = tx.objectStore(store).getAll();
				read.onsuccess = () => { result[store] = read.result; };
			}
			tx.oncomplete = () => { db.close(); resolve(result); };
			tx.onabort = () => { db.close(); reject(tx.error); };
		};
	});
}

/** Preserve newer scoped records; stable import IDs make interrupted copies idempotent. */
export function planLegacyRows(store: string, source: Row[], existing: Row[], database: string, presetIds: Map<unknown, unknown>) {
	const ids = new Set(existing.map((row) => row.id));
	const imported = new Map(existing.map((row) => [row[IMPORT_KEY], row]));
	const presetKeys = new Map(existing.map((row) => [row.key, row]));
	let nextId = Math.max(0, ...[...existing, ...source].map((row) => typeof row.id === "number" ? row.id : 0)) + 1;
	const writes: Row[] = [];
	for (const row of source) {
		if (!row || (typeof row.id !== "string" && typeof row.id !== "number")) throw new Error("Invalid legacy history record");
		const importKey = JSON.stringify([database, store, row.id]);
		const previous = imported.get(importKey) ?? (store === "presets" && typeof row.key === "string" ? presetKeys.get(row.key) : undefined);
		if (previous) {
			if (store === "presets") presetIds.set(row.id, previous.id);
			continue;
		}
		let id = row.id;
		if (ids.has(id)) id = typeof id === "number" ? nextId++ : `legacy-${crypto.randomUUID()}`;
		ids.add(id);
		const copy: Row = { ...row, id, [IMPORT_KEY]: importKey };
		if (store === "presets") { presetIds.set(row.id, id); presetKeys.set(row.key, copy); }
		if (store === "runs" && presetIds.has(row.presetId)) copy.presetId = presetIds.get(row.presetId);
		writes.push(copy);
	}
	return writes;
}

async function copyDatabase(userId: string, name: string, openTarget: () => Promise<IDBDatabase>) {
	const primary = await readLegacyDatabase(name);
	const older = await readLegacyDatabase(name.replace(/^phaseo-/, "ai-stats-"));
	assertChatStorageOwner(userId);
	const db = await openTarget();
	try {
		const stores = Array.from(db.objectStoreNames).sort((a, b) => Number(b === "presets") - Number(a === "presets"));
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(stores, "readwrite");
			const current: Record<string, Row[]> = {};
			let remaining = stores.length;
			for (const store of stores) {
				const read = tx.objectStore(store).getAll();
				read.onsuccess = () => {
					current[store] = read.result;
					if (--remaining) return;
					try {
						assertChatStorageOwner(userId);
						const presetIds = new Map<unknown, unknown>();
						for (const targetStore of stores) {
							// Phaseo's newer copy wins over the old ai-stats copy of the same ID.
							const merged = new Map([...(older[targetStore] ?? []), ...(primary[targetStore] ?? [])].map((row) => [row.id, row]));
							for (const row of planLegacyRows(targetStore, [...merged.values()], current[targetStore], name, presetIds)) tx.objectStore(targetStore).add(row);
						}
					} catch { tx.abort(); }
				};
			}
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(tx.error ?? new Error("Migration interrupted"));
		});
	} finally { db.close(); }
}

export async function migrateLegacyChatHistory(userId: string): Promise<void> {
	assertChatStorageOwner(userId);
	if (!(await claimMigration(userId))) return;
	await copyDatabase(userId, "phaseo-chat", openChatDatabase);
	await copyDatabase(userId, "phaseo-chat-room-history", openChatRoomHistoryDatabase);
	await copyDatabase(userId, "phaseo-experiments-council", openCouncilDatabase);
	assertChatStorageOwner(userId);
	// Only personalisation text/preferences. Never credentials, auth drafts or endpoint config.
	for (const suffix of ["personal-name", "personal-role", "personal-notes", "personal-accent"]) {
		const key = `phaseo-chat-text-${suffix}`;
		const target = chatStorageKey(key);
		const value = localStorage.getItem(key);
		if (value !== null && localStorage.getItem(target) === null) localStorage.setItem(target, value);
	}
	await claimMigration(userId, true);
}
