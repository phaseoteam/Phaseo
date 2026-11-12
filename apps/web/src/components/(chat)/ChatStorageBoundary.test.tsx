import { it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatStorageBoundary } from "./ChatStorageBoundary";
import { createClient } from "@/utils/supabase/client";
import { initializeChatStorage, observeChatStorageIdentity } from "@/lib/chat/userStorage";
import { hideDocumentForSessionReset } from "@/lib/query/historyPrivacy";
import { migrateLegacyChatHistory } from "@/lib/chat/legacyMigration";

vi.mock("react", async () => {
	const actual = await vi.importActual<typeof import("react")>("react");
	const hooks = { useEffect: vi.fn(), useState: vi.fn() };
	// The test reads `React.useState` through the default import.
	return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/chat/userStorage", () => ({ assertChatStorageOwner: vi.fn(), initializeChatStorage: vi.fn(), observeChatStorageIdentity: vi.fn() }));
vi.mock("@/lib/chat/legacyMigration", () => ({ migrateLegacyChatHistory: vi.fn() }));
vi.mock("@/lib/query/historyPrivacy", () => ({ hideDocumentForSessionReset: vi.fn() }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => key }));

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const setState = vi.fn();
const reload = vi.fn();
const unsubscribe = vi.fn();
let emit: (event: string, session: { user: { id: string } } | null) => void;
let finish: (value: unknown) => void;
let cleanup: (() => void) | void;

beforeEach(() => {
	vi.clearAllMocks();
	Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { reload } } });
	vi.mocked(React.useState).mockImplementation((initial?: unknown) => [initial, setState] as never);
	vi.mocked(initializeChatStorage).mockReturnValue(true);
	vi.mocked(migrateLegacyChatHistory).mockResolvedValue(undefined);
	vi.mocked(createClient).mockReturnValue({ auth: {
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
	const effect = vi.mocked(React.useEffect).mock.calls[0][0];
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
	vi.mocked(migrateLegacyChatHistory).mockImplementation(() => new Promise((resolve) => { migrated = resolve; }));
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
	vi.mocked(initializeChatStorage).mockReturnValue(false);
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
