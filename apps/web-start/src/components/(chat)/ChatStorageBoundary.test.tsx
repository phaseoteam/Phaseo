import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatStorageBoundary } from "./ChatStorageBoundary";
import { createClient } from "@/utils/supabase/client";
import { initializeChatStorage, observeChatStorageIdentity } from "@/lib/chat/userStorage";
import { hideDocumentForSessionReset } from "@/lib/query/historyPrivacy";
import { migrateLegacyChatHistory } from "@/lib/chat/legacyMigration";

jest.mock("react", () => ({ ...jest.requireActual("react"), useEffect: jest.fn(), useState: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/chat/userStorage", () => ({ assertChatStorageOwner: jest.fn(), initializeChatStorage: jest.fn(), observeChatStorageIdentity: jest.fn() }));
jest.mock("@/lib/chat/legacyMigration", () => ({ migrateLegacyChatHistory: jest.fn() }));
jest.mock("@/lib/query/historyPrivacy", () => ({ hideDocumentForSessionReset: jest.fn() }));

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const setState = jest.fn();
const reload = jest.fn();
const unsubscribe = jest.fn();
let emit: (event: string, session: { user: { id: string } } | null) => void;
let finish: (value: unknown) => void;
let cleanup: (() => void) | void;

beforeEach(() => {
	jest.clearAllMocks();
	Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { reload } } });
	jest.mocked(React.useState).mockImplementation((initial?: unknown) => [initial, setState] as never);
	jest.mocked(initializeChatStorage).mockReturnValue(true);
	jest.mocked(migrateLegacyChatHistory).mockResolvedValue(undefined);
	jest.mocked(createClient).mockReturnValue({ auth: {
		onAuthStateChange: (callback: typeof emit) => { emit = callback; return { data: { subscription: { unsubscribe } } }; },
		getSession: () => new Promise((resolve) => { finish = resolve; }),
	} } as never);
	cleanup = undefined;
});
afterEach(() => {
	cleanup?.();
	if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});
function mount() {
	const html = renderToStaticMarkup(<ChatStorageBoundary><p>private history</p></ChatStorageBoundary>);
	const effect = jest.mocked(React.useEffect).mock.calls[0][0];
	cleanup = effect() as (() => void) | undefined;
	return html;
}
it("does not mount history before the browser session resolves", async () => {
	expect(mount()).not.toContain("private history");
	expect(initializeChatStorage).not.toHaveBeenCalled();
	finish({ data: { session: { user: { id: "alice" } } }, error: null });
	await Promise.resolve();
	await Promise.resolve();
	expect(initializeChatStorage).toHaveBeenCalledWith("alice");
	expect(setState).toHaveBeenCalledWith(true);
});

it("waits for the automatic migration before mounting history", async () => {
	let migrated!: () => void;
	jest.mocked(migrateLegacyChatHistory).mockImplementation(() => new Promise((resolve) => { migrated = resolve; }));
	mount();
	emit("INITIAL_SESSION", { user: { id: "alice" } });
	expect(migrateLegacyChatHistory).toHaveBeenCalledWith("alice");
	expect(setState).not.toHaveBeenCalledWith(true);
	emit("TOKEN_REFRESHED", { user: { id: "alice" } });
	expect(migrateLegacyChatHistory).toHaveBeenCalledTimes(1);
	migrated();
	await Promise.resolve();
	expect(setState).toHaveBeenCalledWith(true);
});

it("never claims legacy data while signed out", () => {
	mount();
	emit("INITIAL_SESSION", null);
	expect(migrateLegacyChatHistory).not.toHaveBeenCalled();
	expect(setState).toHaveBeenCalledWith(true);
});
it("ignores an older getSession response after an auth event", async () => {
	mount();
	emit("INITIAL_SESSION", { user: { id: "bob" } });
	finish({ data: { session: { user: { id: "alice" } } }, error: null });
	await Promise.resolve();
	expect(initializeChatStorage).toHaveBeenCalledTimes(1);
	expect(initializeChatStorage).toHaveBeenCalledWith("bob");
});
it("hides the document and reloads after sign-out locks storage", () => {
	mount();
	emit("INITIAL_SESSION", { user: { id: "alice" } });
	jest.mocked(initializeChatStorage).mockReturnValue(false);
	emit("SIGNED_OUT", null);
	expect(observeChatStorageIdentity).toHaveBeenLastCalledWith(null, true);
	expect(setState).toHaveBeenLastCalledWith(false);
	expect(hideDocumentForSessionReset).toHaveBeenCalledTimes(1);
	expect(reload).toHaveBeenCalledTimes(1);
});
it("does not initialize storage on session errors or after unmount", async () => {
	mount();
	finish({ data: { session: null }, error: new Error("offline") });
	await Promise.resolve();
	expect(initializeChatStorage).not.toHaveBeenCalled();
	cleanup?.();
	emit("SIGNED_IN", { user: { id: "alice" } });
	expect(initializeChatStorage).not.toHaveBeenCalled();
	expect(unsubscribe).toHaveBeenCalled();
});
