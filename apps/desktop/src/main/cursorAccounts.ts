// Loaded on first use: the SDK took ~115 ms of every launch, before the window opened, for people who never use Cursor.
const cursorSdk = () => import("@cursor/sdk");
import type { AccountStatus, ModelOption } from "../shared/workspace";
import { assertCursorBackend, bounded, cursorModelDescriptors } from "./cursorAdapter";

export async function cursorModels(apiKey: string): Promise<ModelOption[]> {
	assertCursorBackend();
	const { Cursor } = await cursorSdk();
	return (await bounded(Cursor.models.list({ apiKey }))).map(model => { const options = cursorModelDescriptors(model); return { id: model.id, name: model.displayName, description: model.description, ...(options.length ? { options } : {}) }; });
}
export async function cursorAccountStatus(apiKey?: string): Promise<AccountStatus> {
	const checkedAt = new Date().toISOString(); if (!apiKey) return { checkedAt, authenticated: false };
	assertCursorBackend(); const { AuthenticationError, Cursor } = await cursorSdk(); try { const user = await bounded(Cursor.me({ apiKey })); return { checkedAt, authenticated: true, method: "Cursor SDK user key", identity: user.userEmail ?? user.apiKeyName }; } catch (error) { if (error instanceof AuthenticationError) return { checkedAt, authenticated: false }; throw error; }
}
export async function cursorSignIn(open: (url: string) => Promise<void>, signal: AbortSignal) {
	assertCursorBackend(); const { Cursor } = await cursorSdk(); const result = await Cursor.auth.login({ backendUrl: "https://api2.cursor.sh", websiteUrl: "https://cursor.com", store: null, apiKeyName: "Phaseo desktop", signal, openBrowser: async url => { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.hostname !== "cursor.com" || parsed.username || parsed.password) throw new Error("Cursor returned an unexpected sign-in URL."); await open(parsed.href); } });
	if (signal.aborted) throw new Error("Sign-in cancelled."); return result;
}
