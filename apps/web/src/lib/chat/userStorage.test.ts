import type * as StorageModule from "./userStorage";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const values = new Map<string, string>();
function newDocument(): typeof StorageModule {
	jest.resetModules();
	return jest.requireActual<typeof StorageModule>("./userStorage");
}
beforeEach(() => {
	values.clear();
	Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
	} } });
});
afterEach(() => {
	if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

it("does not read or write before session initialization", () => {
	const storage = newDocument();
	values.set("notes", "legacy private notes");
	expect(storage.chatLocalStorage.getItem("notes")).toBeNull();
	storage.chatLocalStorage.setItem("notes", "early write");
	expect(values.get("notes")).toBe("legacy private notes");
	expect(() => storage.chatStorageKey("phaseo-chat")).toThrow();
});

it("isolates two users and restores only their own data on a later visit", () => {
	const alice = newDocument();
	alice.initializeChatStorage("alice");
	alice.chatLocalStorage.setItem("notes", "Alice's notes");
	const aliceDb = alice.chatStorageKey("phaseo-chat");
	alice.observeChatStorageIdentity(null, true);
	expect(alice.chatLocalStorage.getItem("notes")).toBeNull();
	expect(alice.initializeChatStorage("bob")).toBe(false);
	// A delayed callback cannot write into Bob's scope after sign-out.
	alice.chatLocalStorage.setItem("notes", "late callback");
	expect(() => alice.chatStorageKey("phaseo-chat")).toThrow();
	const bob = newDocument();
	bob.initializeChatStorage("bob");
	expect(bob.chatLocalStorage.getItem("notes")).toBeNull();
	expect(bob.chatStorageKey("phaseo-chat")).not.toBe(aliceDb);
	bob.chatLocalStorage.setItem("notes", "Bob's notes");
	const aliceAgain = newDocument();
	aliceAgain.initializeChatStorage("alice");
	expect(aliceAgain.chatLocalStorage.getItem("notes")).toBe("Alice's notes");
	expect(aliceAgain.chatStorageKey("phaseo-chat")).toBe(aliceDb);
});

it("locks on direct account switches but not same-user token refreshes", () => {
	const storage = newDocument();
	storage.initializeChatStorage("alice");
	storage.observeChatStorageIdentity("alice");
	expect(storage.initializeChatStorage("alice")).toBe(true);
	storage.observeChatStorageIdentity("bob");
	expect(() => storage.chatStorageKey("phaseo-chat")).toThrow();
	expect(storage.initializeChatStorage("bob")).toBe(false);
});

it("never assigns unowned legacy data or guest history to a signed-in user", () => {
	values.set("notes", "unowned history");
	const guest = newDocument();
	guest.initializeChatStorage(null);
	guest.chatLocalStorage.setItem("notes", "guest notes");
	const guestDb = guest.chatStorageKey("phaseo-chat");
	const secondGuest = newDocument();
	secondGuest.initializeChatStorage(null);
	expect(secondGuest.chatStorageKey("phaseo-chat")).not.toBe(guestDb);
	const alice = newDocument();
	alice.initializeChatStorage("alice");
	expect(alice.chatLocalStorage.getItem("notes")).toBeNull();
	expect(values.get("notes")).toBe("unowned history");
});
