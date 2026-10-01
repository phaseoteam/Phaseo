import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import {
	fetchAndValidateProviderCatalog,
	normalizeProviderCatalog,
	type ProviderCatalogPreview,
	validateProviderCatalogPricingMeters,
} from "./provider-catalog";
import { reconcileProviderCatalogClaims } from "./provider-catalog-reconciliation";

export type ProviderCatalogSyncTrigger = "webhook" | "poll" | "manual";

type ProviderCatalogSource = {
	provider_slug: string;
	catalog_url: string | null;
	management_mode: "remote" | "managed";
	managed_catalog: unknown;
	status: string;
	poll_interval_seconds: number;
	consecutive_failures: number;
	webhook_secret_ciphertext: string | null;
	webhook_secret_iv: string | null;
	webhook_secret_hash: string | null;
	etag: string | null;
	last_modified: string | null;
	refresh_requested: boolean;
};

const SOURCE_SELECT = "provider_slug,catalog_url,management_mode,managed_catalog,status,poll_interval_seconds,consecutive_failures,webhook_secret_ciphertext,webhook_secret_iv,webhook_secret_hash,etag,last_modified,refresh_requested";
const MAX_WEBHOOK_SKEW_SECONDS = 300;

function bytes(value: Uint8Array): ArrayBuffer {
	return Uint8Array.from(value).buffer;
}

function base64(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hex(value: Uint8Array): string {
	return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string): Promise<string> {
	return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function fromHex(value: string): Uint8Array | null {
	if (!/^[a-f0-9]{64}$/i.test(value)) return null;
	const output = new Uint8Array(32);
	for (let index = 0; index < output.length; index += 1) output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
	return output;
}

function secretMaterial(env: Env): string {
	const value = env.ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY?.trim() ?? env.WEBHOOK_SECRET_ENCRYPTION_KEY?.trim() ?? env.KEY_PEPPER_ACTIVE?.trim();
	if (!value) throw new Error("Webhook secret encryption key is missing");
	return value;
}

async function encryptionKey(env: Env, usage: KeyUsage[]): Promise<CryptoKey> {
	const material = new TextEncoder().encode(secretMaterial(env));
	const digest = await crypto.subtle.digest("SHA-256", material);
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usage);
}

export function generateProviderCatalogWebhookSecret(): string {
	return `whsec_${base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

export async function encryptProviderCatalogWebhookSecret(env: Env, secret: string) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytes(iv) }, await encryptionKey(env, ["encrypt"]), new TextEncoder().encode(secret));
	const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretMaterial(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const hash = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(secret));
	return { webhook_secret_ciphertext: base64(new Uint8Array(ciphertext)), webhook_secret_iv: base64(iv), webhook_secret_hash: hex(new Uint8Array(hash)) };
}

export async function decryptProviderCatalogWebhookSecret(env: Env, source: Pick<ProviderCatalogSource, "webhook_secret_ciphertext" | "webhook_secret_iv">): Promise<string> {
	if (!source.webhook_secret_ciphertext || !source.webhook_secret_iv) throw new Error("Provider webhook secret is not configured");
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(fromBase64(source.webhook_secret_iv)) }, await encryptionKey(env, ["decrypt"]), bytes(fromBase64(source.webhook_secret_ciphertext)));
	return new TextDecoder().decode(plaintext);
}

export async function signProviderCatalogWebhook(secret: string, timestamp: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`))));
}

export async function verifyProviderCatalogWebhookSignature(args: { secret: string; timestamp: string | null; signature: string | null; body: string; nowSeconds?: number }): Promise<boolean> {
	if (!args.timestamp || !args.signature) return false;
	const timestampSeconds = Number(args.timestamp);
	if (!Number.isInteger(timestampSeconds) || Math.abs((args.nowSeconds ?? Math.floor(Date.now() / 1000)) - timestampSeconds) > MAX_WEBHOOK_SKEW_SECONDS) return false;
	const expected = fromHex(args.signature.startsWith("v1=") ? args.signature.slice(3) : args.signature);
	if (!expected) return false;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(args.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
	return crypto.subtle.verify("HMAC", key, bytes(expected), new TextEncoder().encode(`${args.timestamp}.${args.body}`));
}

function nextPollAt(intervalSeconds: number, failures: number): string {
	const backoff = Math.min(86_400, intervalSeconds * 2 ** Math.min(failures, 6));
	return new Date(Date.now() + backoff * 1000).toISOString();
}

function publicPreview(preview: ProviderCatalogPreview) {
	return { valid: preview.valid, modelCount: preview.modelCount, truncated: preview.truncated, issues: preview.issues, models: preview.models };
}

async function notifyProviderOwners(client: any, providerSlug: string, runId: string, title: string, message: string) {
	const links = await client.from("provider_account_links").select("workspace_id").eq("provider_slug", providerSlug).in("status", ["pending", "active"]);
	if (links.error || !links.data?.length) return;
	await client.from("provider_catalog_events").insert(links.data.map((row: any) => ({ provider_slug: providerSlug, run_id: runId, workspace_id: row.workspace_id, event_type: "catalog_needs_changes", title, message })));
}

export async function syncProviderCatalog(env: Env, providerSlug: string, trigger: ProviderCatalogSyncTrigger, externalEventId?: string): Promise<{ status: string; runId?: string; modelCount?: number }> {
	const client = getDataClient(env);
	const sourceResult = await client.from("provider_catalog_sources").select(SOURCE_SELECT).eq("provider_slug", providerSlug).maybeSingle();
	if (sourceResult.error) throw sourceResult.error;
	let source = sourceResult.data as ProviderCatalogSource | null;
	if (!source) throw new Error("Provider catalog source not found");
	if (source.status !== "active") return { status: "paused" };
	const leaseToken = crypto.randomUUID();
	const lease = await client.rpc("claim_provider_catalog_sync", { p_provider_slug: providerSlug, p_lease_token: leaseToken, p_lease_seconds: 300 });
	if (lease.error) throw lease.error;
	if (lease.data !== true) {
		await client.from("provider_catalog_sources").update({ refresh_requested: true, next_poll_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("provider_slug", providerSlug);
		return { status: "busy" };
	}
	let lastLeaseRenewal = Date.now();
	const renewLease = async (force = false) => {
		if (!force && Date.now() - lastLeaseRenewal < 60_000) return;
		const renewed = await client.rpc("renew_provider_catalog_sync", { p_provider_slug: providerSlug, p_lease_token: leaseToken, p_lease_seconds: 300 });
		if (renewed.error) throw renewed.error;
		if (renewed.data !== true) throw new Error("provider_catalog_sync_lease_lost");
		lastLeaseRenewal = Date.now();
	};

	try {
	const runResult = await client.from("provider_catalog_sync_runs").insert({
		provider_slug: providerSlug,
		trigger,
		external_event_id: externalEventId ?? null,
		status: "processing",
		catalog_url: source.catalog_url,
	}).select("id").single();
	if (runResult.error) {
		if (externalEventId && runResult.error.code === "23505") return { status: "duplicate" };
		throw runResult.error;
	}
	const runId = String(runResult.data.id);

	try {
		// Consume before reading the document, under the sync lease. Edits arriving
		// after this point retain their refresh flag for the next pass.
		const started = await client.rpc("begin_provider_catalog_refresh", { p_provider_slug: providerSlug });
		if (started.error) throw started.error;
		const fresh = await client.from("provider_catalog_sources").select(SOURCE_SELECT).eq("provider_slug", providerSlug).single();
		if (fresh.error) throw fresh.error;
		source = fresh.data as ProviderCatalogSource;
		const catalog = source.management_mode === "managed"
			? {
				preview: normalizeProviderCatalog(source.managed_catalog ?? {}),
				sha256: await sha256Text(JSON.stringify(source.managed_catalog ?? {})),
				etag: null,
				lastModified: null,
				notModified: false as const,
			}
			: await fetchAndValidateProviderCatalog(source.catalog_url ?? "", fetch, trigger === "poll" ? { etag: source.etag, lastModified: source.last_modified } : undefined);
		if (!("preview" in catalog)) {
			const now = new Date().toISOString();
			const refresh = await client.rpc("consume_provider_catalog_refresh", { p_provider_slug: providerSlug });
			await client.from("provider_catalog_sync_runs").update({ status: "not_modified", completed_at: now }).eq("id", runId);
			await client.from("provider_catalog_sources").update({ last_polled_at: now, consecutive_failures: 0, next_poll_at: refresh.data === true ? now : nextPollAt(source.poll_interval_seconds, 0), etag: catalog.etag, last_modified: catalog.lastModified, updated_at: now }).eq("provider_slug", providerSlug);
			return { status: "not_modified", runId };
		}
		await renewLease(true);
		const preview = await validateProviderCatalogPricingMeters(client, catalog.preview);
		if (!preview.valid) {
			await renewLease(true);
			await client.from("provider_catalog_sync_runs").update({ status: "rejected", review_status: "needs_changes", model_count: preview.modelCount, model_preview: publicPreview(preview), validation_summary: { valid: false, issues: preview.issues }, completed_at: new Date().toISOString(), error_message: "Catalog validation failed." }).eq("id", runId);
			await client.from("provider_catalog_sources").update({ last_error: "Catalog validation failed.", consecutive_failures: source.consecutive_failures + 1, next_poll_at: nextPollAt(source.poll_interval_seconds, source.consecutive_failures + 1), updated_at: new Date().toISOString() }).eq("provider_slug", providerSlug);
			await notifyProviderOwners(client, providerSlug, runId, "Catalog needs changes", preview.issues[0]?.message ?? "Catalog validation failed.");
			return { status: "rejected", runId, modelCount: preview.modelCount };
		}

		const applied = await client.rpc("apply_provider_catalog_snapshot", { p_provider_slug: providerSlug, p_run_id: runId, p_models: preview.allModels });
		if (applied.error) throw applied.error;
		await renewLease(true);
		await reconcileProviderCatalogClaims(client, { providerSlug, runId, models: preview.allModels, renewLease });
		await renewLease(true);
		const now = new Date().toISOString();
		await client.from("provider_catalog_sync_runs").update({ status: "applied", catalog_sha256: catalog.sha256, model_count: preview.modelCount, model_preview: publicPreview(preview), validation_summary: { valid: true, issues: [], checked_at: now }, completed_at: now }).eq("id", runId);
		await client.from("provider_catalog_sources").update({ last_success_at: now, last_polled_at: trigger === "poll" ? now : undefined, last_catalog_sha256: catalog.sha256, etag: catalog.etag, last_modified: catalog.lastModified, consecutive_failures: 0, last_error: null, updated_at: now }).eq("provider_slug", providerSlug);
		if (source.management_mode === "remote") await client.from("provider_catalog_sources").update({ next_poll_at: nextPollAt(source.poll_interval_seconds, 0) }).eq("provider_slug", providerSlug).eq("refresh_requested", false);
		return { status: "applied", runId, modelCount: Number(applied.data ?? preview.modelCount) };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Provider catalog sync failed.";
		await renewLease(true);
		await client.from("provider_catalog_sync_runs").update({ status: "failed", review_status: "needs_changes", error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).eq("id", runId);
		await client.from("provider_catalog_sources").update({ refresh_requested: true, last_error: message.slice(0, 500), consecutive_failures: source.consecutive_failures + 1, next_poll_at: nextPollAt(source.poll_interval_seconds, source.consecutive_failures + 1), updated_at: new Date().toISOString() }).eq("provider_slug", providerSlug);
		await notifyProviderOwners(client, providerSlug, runId, "Catalog sync failed", message.slice(0, 500));
		throw error;
	}
	} finally {
		await client.rpc("release_provider_catalog_sync", { p_provider_slug: providerSlug, p_lease_token: leaseToken });
	}
}

export async function runProviderCatalogPollingJob(env: Env, limit = 20): Promise<{ attempted: number; applied: number; failed: number }> {
	const client = getDataClient(env);
	const now = new Date().toISOString();
	const sources = await client.from("provider_catalog_sources").select("provider_slug").eq("status", "active").or(`next_poll_at.lte.${now},and(refresh_requested.eq.true,next_poll_at.is.null)`).or("management_mode.eq.remote,refresh_requested.eq.true").order("next_poll_at", { ascending: true, nullsFirst: true }).limit(limit);
	if (sources.error) throw sources.error;
	let applied = 0;
	let failed = 0;
	for (const source of sources.data ?? []) {
		try {
			const result = await syncProviderCatalog(env, String(source.provider_slug), "poll");
			if (result.status === "applied") applied += 1;
		} catch {
			failed += 1;
		}
	}
	return { attempted: sources.data?.length ?? 0, applied, failed };
}

export async function activateDueProviderCatalogReleases(env: Env): Promise<number> {
	const result = await getDataClient(env).rpc("activate_due_provider_catalog_releases");
	if (result.error) throw result.error;
	return Number(result.data ?? 0);
}
