import type { Env } from "@/env";
import { decryptBroadcastConfig, encryptBroadcastConfig } from "@/routes/account/broadcast-config-crypto";
import type { GithubRepoRow, WorkItemRow } from "./types";

// Creating GitHub issues for work items with the repository's stored fine-grained token.
//
// The token is encrypted with the same AES-GCM helpers as broadcast destination credentials
// (ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY, with key versions). work_github_repos has a single text
// column, so the ciphertext, IV and key version are stored together as a small JSON envelope.
//
// Privacy: the issue body is built only from the item's title, the triage summary (which never
// contains contact details) or, for items people created by hand, their description, plus a link
// back to Phaseo. Customer requests and customer records are never read here.

export const WORK_WEB_ORIGIN = "https://phaseo.app";
const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 15_000;
const MAX_ISSUE_BODY_CHARS = 60_000;

type TokenEnvelope = { v: 1; c: string; iv: string; k: string };

export async function encryptGithubToken(env: Env, token: string): Promise<string> {
	const encrypted = await encryptBroadcastConfig(env, { token });
	return JSON.stringify({ v: 1, c: encrypted.ciphertext, iv: encrypted.iv, k: encrypted.keyVersion } satisfies TokenEnvelope);
}

export async function decryptGithubToken(env: Env, stored: string | null | undefined): Promise<string | null> {
	if (!stored) return null;
	let envelope: TokenEnvelope;
	try {
		envelope = JSON.parse(stored) as TokenEnvelope;
	} catch {
		return null;
	}
	if (!envelope?.c || !envelope.iv) return null;
	const config = await decryptBroadcastConfig(env, {
		destination_config_ciphertext: envelope.c,
		destination_config_iv: envelope.iv,
		destination_config_key_version: envelope.k,
	});
	return typeof config.token === "string" && config.token ? config.token : null;
}

export function workItemUrl(number: number, origin = WORK_WEB_ORIGIN): string {
	return `${origin.replace(/\/+$/, "")}/work/${number}`;
}

/**
 * The GitHub issue body: the title, the triage summary (or the description for items created by
 * hand) and a link back to the item. Never customer requests.
 */
export function buildGithubIssueBody(item: Pick<WorkItemRow, "number" | "title" | "description" | "source" | "triage_summary">, origin = WORK_WEB_ORIGIN): string {
	const summary = item.triage_summary?.trim() ?? "";
	// Only a hand-written description is safe to copy; asks, errors and other sources may carry
	// text from outside, so they rely on the triage summary alone.
	const detail = item.source === "manual" ? (item.description?.trim() || summary) : summary;
	const parts = [`## ${item.title.trim()}`];
	if (detail) parts.push(detail.length > MAX_ISSUE_BODY_CHARS ? `${detail.slice(0, MAX_ISSUE_BODY_CHARS)}\n\n[truncated]` : detail);
	parts.push("---", `Tracked in Phaseo: ${workItemUrl(item.number, origin)}`);
	return parts.join("\n\n");
}

export type GithubIssueResult =
	| { ok: true; number: number; url: string }
	| { ok: false; status: 409 | 502; code: "github_token_missing" | "github_token_unreadable" | "github_request_failed" | "triage_required"; message: string };

/** Creates the issue in the repository with its stored token. */
export async function createGithubIssue(env: Env, repo: Pick<GithubRepoRow, "repo" | "github_token_ciphertext">, item: Pick<WorkItemRow, "number" | "title" | "description" | "source" | "triage_summary">): Promise<GithubIssueResult> {
	// Items from outside (asks, errors, synced sources) carry outside text in their title until triage
	// has given them a neutral one, so they go to GitHub only after triage.
	if (item.source !== "manual" && !item.triage_summary?.trim()) return { ok: false, status: 409, code: "triage_required", message: "Triage this item before creating a GitHub issue" };
	if (!repo.github_token_ciphertext) return { ok: false, status: 409, code: "github_token_missing", message: "Add a GitHub token to this repository to create issues from Phaseo" };
	let token: string | null;
	try {
		token = await decryptGithubToken(env, repo.github_token_ciphertext);
	} catch {
		token = null;
	}
	if (!token) return { ok: false, status: 409, code: "github_token_unreadable", message: "The stored GitHub token could not be read; add it again" };
	let response: Response;
	try {
		response = await fetch(`${GITHUB_API}/repos/${repo.repo}/issues`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"Content-Type": "application/json",
				"User-Agent": "phaseo-work",
			},
			body: JSON.stringify({ title: item.title.trim().slice(0, 256), body: buildGithubIssueBody(item) }),
			signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
		});
	} catch {
		return { ok: false, status: 502, code: "github_request_failed", message: "GitHub did not answer in time" };
	}
	const payload = await response.json().catch(() => null) as { number?: unknown; html_url?: unknown; message?: unknown } | null;
	if (!response.ok || typeof payload?.number !== "number" || typeof payload.html_url !== "string") {
		const detail = typeof payload?.message === "string" ? `: ${payload.message.slice(0, 200)}` : "";
		return { ok: false, status: 502, code: "github_request_failed", message: `GitHub returned ${response.status}${detail}` };
	}
	return { ok: true, number: payload.number, url: payload.html_url };
}
