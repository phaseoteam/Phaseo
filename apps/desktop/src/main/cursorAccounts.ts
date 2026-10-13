import { AuthenticationError, Cursor } from "@cursor/sdk";
import type { AccountStatus, ModelOption } from "../shared/workspace";
import { assertCursorBackend, bounded, cursorModelDescriptors } from "./cursorAdapter";

export async function cursorModels(apiKey: string): Promise<ModelOption[]> {
	assertCursorBackend();
	return (await bounded(Cursor.models.list({ apiKey }))).map(model => { const options = cursorModelDescriptors(model); return { id: model.id, name: model.displayName, description: model.description, ...(options.length ? { options } : {}) }; });
}
export async function cursorAccountStatus(apiKey?: string): Promise<AccountStatus> {
	const checkedAt = new Date().toISOString(); if (!apiKey) return { checkedAt, authenticated: false };
	assertCursorBackend(); try { const user = await bounded(Cursor.me({ apiKey })); return { checkedAt, authenticated: true, method: "Cursor SDK user key", identity: user.userEmail ?? user.apiKeyName }; } catch (error) { if (error instanceof AuthenticationError) return { checkedAt, authenticated: false }; throw error; }
}
export async function cursorSignIn(open: (url: string) => Promise<void>, signal: AbortSignal) {
	assertCursorBackend(); const result = await Cursor.auth.login({ backendUrl: "https://api2.cursor.sh", websiteUrl: "https://cursor.com", store: null, apiKeyName: "Phaseo desktop", signal, openBrowser: async url => { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.hostname !== "cursor.com" || parsed.username || parsed.password) throw new Error("Cursor returned an unexpected sign-in URL."); await open(parsed.href); } });
	if (signal.aborted) throw new Error("Sign-in cancelled."); return result;
}
