import { afterEach, describe, expect, it } from "vitest";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";
import {
	MANAGED_PAYMENT_COOLDOWN_MS,
	canUseManagedCredential,
	filterCandidatesByCredential,
	managedCredentialState,
	managedCredentialUnavailableResponse,
	recordManagedPaymentRequired,
	resetManagedCredentialStateForTests,
} from "./managedCredentials";
import { buildCredentialAttemptPlan } from "./index";

function candidate(providerId: string, extra: Record<string, unknown> = {}) {
	return { providerId, byokMeta: [], ...extra } as any;
}

function byokKey(id: string, routingMode: "priority" | "balanced" | "fallback") {
	return { id, providerId: "canopy-wave", fingerprintSha256: id, keyVersion: "1", routingMode, key: `secret-${id}` };
}

afterEach(() => {
	resetManagedCredentialStateForTests();
	teardownTestRuntime();
});

describe("managed credential availability", () => {
	it("reports an OpenAI-compatible text provider without its Worker secret as missing", () => {
		setupRuntimeFromEnv({ TENSORIX_API_KEY: "tx-key" } as any);
		expect(managedCredentialState("canopy-wave", "text.generate")).toBe("missing");
		expect(managedCredentialState("tensorix", "text.generate")).toBe("available");
	});

	it("follows the alternative env names the key resolver reads", () => {
		// Meta reads MODEL_API_KEY or META_MODEL_API_KEY; BytePlus has several names too.
		setupRuntimeFromEnv({ META_MODEL_API_KEY: "meta-key" } as any);
		expect(managedCredentialState("meta", "text.generate")).toBe("available");
	});

	it("reports a provider whose base URL binding is missing as missing, whatever its key", () => {
		// Cloudflare builds its base URL from CLOUDFLARE_ACCOUNT_ID (or a gateway URL) before
		// it reads CLOUDFLARE_API_TOKEN; the executor fails either way without them.
		const stateWith = (env: Record<string, string>) => {
			setupRuntimeFromEnv(env as any);
			try {
				return managedCredentialState("cloudflare", "text.generate");
			} finally {
				teardownTestRuntime();
			}
		};
		expect(stateWith({})).toBe("missing");
		expect(stateWith({ CLOUDFLARE_API_TOKEN: "cf-token" })).toBe("missing");
		expect(stateWith({ CLOUDFLARE_ACCOUNT_ID: "acct" })).toBe("missing");
		expect(stateWith({ CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "cf-token" })).toBe("available");
	});

	it("never judges providers whose credentials this check cannot see", () => {
		setupRuntimeFromEnv({});
		// Own executors: SDK keys, SigV4, Google OAuth, Azure deployments.
		for (const providerId of ["openai", "anthropic", "amazon-bedrock", "google-vertex", "google-ai-studio", "azure", "x-ai"]) {
			expect(managedCredentialState(providerId, "text.generate")).toBe("available");
		}
		// Non-text capabilities use other executors and env vars.
		expect(managedCredentialState("ovhcloud", "image.generate")).toBe("available");
	});

	it("drops a provider with no managed key unless the request carries a BYOK key for it", () => {
		setupRuntimeFromEnv({ BASETEN_API_KEY: "bt-key" } as any);
		const managedOnly = candidate("canopy-wave");
		const withByok = candidate("canopy-wave", { byokMeta: [byokKey("k1", "fallback")] });
		const byokOnlyRoute = candidate("canopy-wave", { credentialMode: "byok_only" });
		const privateRoute = candidate("canopy-wave", { privateEndpoint: { baseUrl: "https://x", supportsResponses: false } });
		const baseten = candidate("baseten");

		const result = filterCandidatesByCredential([managedOnly, baseten, withByok, byokOnlyRoute, privateRoute], "text.generate");
		expect(result.candidates).toEqual([baseten, withByok, byokOnlyRoute, privateRoute]);
		expect(result.skipped).toEqual([{ providerId: "canopy-wave", reason: "missing" }]);
	});

	it("leaves out the managed attempt for a BYOK candidate whose managed key is missing", () => {
		setupRuntimeFromEnv({});
		const routed = { candidate: candidate("canopy-wave", { byokMeta: [byokKey("k1", "fallback")] }) };
		const plan = buildCredentialAttemptPlan([routed], {
			includeFallbackByok: true,
			canUseManagedCredential: (entry) => canUseManagedCredential(entry, "text.generate"),
		});
		expect(plan.map((attempt) => attempt.phase)).toEqual(["fallback_byok"]);
		// Without the check the plan led with a managed attempt that could only fail.
		expect(buildCredentialAttemptPlan([routed], { includeFallbackByok: true }).map((attempt) => attempt.phase))
			.toEqual(["gateway", "fallback_byok"]);
	});

	it("cools a provider down for managed traffic after a 402 on the gateway key", () => {
		setupRuntimeFromEnv({ ATLAS_CLOUD_API_KEY: "atlas-key" } as any);
		const now = 1_000_000;
		expect(managedCredentialState("atlascloud", "text.generate", now)).toBe("available");
		recordManagedPaymentRequired("atlascloud", now);
		expect(managedCredentialState("atlascloud", "text.generate", now + 1)).toBe("payment_required");
		// Account-wide: every capability on the provider.
		expect(managedCredentialState("atlascloud", "video.generate", now + 1)).toBe("payment_required");

		const managedOnly = candidate("atlascloud");
		const withByok = candidate("atlascloud", { byokMeta: [byokKey("k1", "priority")] });
		const result = filterCandidatesByCredential([managedOnly, withByok], "text.generate", now + 1);
		expect(result.candidates).toEqual([withByok]);
		expect(result.skipped).toEqual([{ providerId: "atlascloud", reason: "payment_required" }]);

		expect(managedCredentialState("atlascloud", "text.generate", now + MANAGED_PAYMENT_COOLDOWN_MS + 1)).toBe("available");
	});
});

describe("managedCredentialUnavailableResponse", () => {
	const ctx = { model: "deepseek/deepseek-v4-flash", endpoint: "chat.completions", requestId: "req_1" };

	it("keeps the key-missing shape a late failure produced", async () => {
		const response = managedCredentialUnavailableResponse(ctx, [{ providerId: "canopy-wave", reason: "missing" }]);
		expect(response.status).toBe(502);
		const body = await response.json() as any;
		expect(body).toMatchObject({
			error: "upstream_error",
			reason: "canopy-wave_key_missing",
			attempt_count: 0,
			skipped_providers: ["canopy-wave"],
			provider_failure_diagnostics: { category: "credentials_not_configured", provider: "canopy-wave" },
		});
	});

	it("reports an unpaid managed account as provider_payment_required", async () => {
		const response = managedCredentialUnavailableResponse(ctx, [
			{ providerId: "canopy-wave", reason: "missing" },
			{ providerId: "atlascloud", reason: "payment_required" },
		]);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "provider_payment_required",
			reason: "upstream_provider_payment_required",
			provider_payment_required_provider: "atlascloud",
		});
	});

	it("does not name providers for stealth models", async () => {
		const response = managedCredentialUnavailableResponse(
			{ ...ctx, model: "stealth/sonic" },
			[{ providerId: "canopy-wave", reason: "missing" }],
		);
		const text = await response.text();
		expect(response.status).toBe(502);
		expect(text).not.toContain("canopy-wave");
	});
});
