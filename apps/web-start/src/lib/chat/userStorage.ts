// A document keeps one owner for its lifetime. Auth changes lock it until reload,
// so delayed callbacks from the old account can never write into the next one.
let owner: string | undefined;
let namespace: string | undefined;
let locked = false;

export function initializeChatStorage(userId: string | null): boolean {
	const nextOwner = userId ?? "guest";
	if (locked || (owner !== undefined && owner !== nextOwner)) return false;
	owner = nextOwner;
	namespace ??= userId
		? `user:${encodeURIComponent(userId)}`
		: `guest:${crypto.randomUUID()}`;
	return true;
}

export function observeChatStorageIdentity(userId: string | null, signedOut = false) {
	if (owner !== undefined && (signedOut || owner !== (userId ?? "guest"))) locked = true;
}

export function chatStorageKey(key: string): string {
	if (!namespace || locked) throw new Error("Chat storage is unavailable until the session is ready.");
	return `${key}:account-v1:${namespace}`;
}

export function assertChatStorageOwner(userId: string) {
	if (!userId || owner !== userId || locked) throw new Error("Chat storage owner changed.");
}

// Never fall back to unscoped keys: old history has no provable account owner.
// Legacy reads happen only in the one-time, exclusively claimed migration.
export const chatLocalStorage = {
	getItem(key: string): string | null {
		if (!namespace || locked || typeof window === "undefined") return null;
		return window.localStorage.getItem(chatStorageKey(key));
	},
	setItem(key: string, value: string): void {
		if (!namespace || locked || typeof window === "undefined") return;
		window.localStorage.setItem(chatStorageKey(key), value);
	},
	removeItem(key: string): void {
		if (!namespace || locked || typeof window === "undefined") return;
		window.localStorage.removeItem(chatStorageKey(key));
	},
};
