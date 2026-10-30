import { normalizeAuthErrorMessage } from "@/lib/auth/errorMessage";

export type StartSsoInput =
	| {
			mode: "saml";
			domain?: string;
			providerId?: string;
			returnUrl?: string;
	  }
	| {
			mode: "custom_oidc";
			provider: `custom:${string}`;
			returnUrl?: string;
	  };

export type StartSsoRequest =
	| {
			kind: "sso";
			params:
				| {
						providerId: string;
						options: { redirectTo: string };
				  }
				| {
						domain: string;
						options: { redirectTo: string };
				  };
	  }
	| {
			kind: "oauth";
			params: {
				provider: `custom:${string}`;
				options: { redirectTo: string };
			};
	  };

function normalizeProviderId(value: unknown): string | null {
	const providerId = String(value ?? "").trim();
	return providerId.length > 0 ? providerId : null;
}

export function normalizeSsoDomain(value: unknown): string | null {
	const raw = String(value ?? "").trim().toLowerCase();
	if (!raw) return null;

	const withoutScheme = raw.replace(/^https?:\/\//, "");
	const withoutPath = withoutScheme.split("/")[0] ?? "";
	const candidate = withoutPath.includes("@")
		? withoutPath.split("@").at(-1) ?? ""
		: withoutPath;

	const normalized = candidate.replace(/^\.+|\.+$/g, "");
	if (!normalized) return null;
	if (!/^[a-z0-9.-]+$/.test(normalized)) return null;
	if (!normalized.includes(".")) return null;
	return normalized;
}

export function buildStartSsoRequest(
	input: StartSsoInput,
	redirectTo: string,
): StartSsoRequest {
	if (input.mode === "custom_oidc") {
		const provider = String(input.provider ?? "").trim() as `custom:${string}`;
		if (!provider.startsWith("custom:")) {
			throw new Error("Custom OIDC provider must start with `custom:`.");
		}
		return {
			kind: "oauth",
			params: {
				provider,
				options: { redirectTo },
			},
		};
	}

	const providerId = normalizeProviderId(input.providerId);
	if (providerId) {
		return {
			kind: "sso",
			params: {
				providerId,
				options: { redirectTo },
			},
		};
	}

	const domain = normalizeSsoDomain(input.domain);
	if (!domain) {
		throw new Error("Enter your work email domain to continue with Enterprise SSO.");
	}

	return {
		kind: "sso",
		params: {
			domain,
			options: { redirectTo },
		},
	};
}

export function mapSsoAuthErrorMessage(error: unknown): string {
	const code = String((error as { code?: unknown })?.code ?? "")
		.trim()
		.toLowerCase();
	const message = String((error as { message?: unknown })?.message ?? "");

	if (
		code === "sso_provider_not_found" ||
		code === "saml_idp_not_found" ||
		code === "saml_relay_state_not_found" ||
		code === "saml_relay_state_expired"
	) {
		return "Enterprise SSO is not configured for your organization yet.";
	}

	if (code === "saml_provider_disabled") {
		return "Enterprise SSO is configured but currently disabled.";
	}

	if (code === "user_sso_managed") {
		return "This account is managed by SSO. Please use Enterprise SSO to sign in.";
	}

	return normalizeAuthErrorMessage(message);
}

export function deriveDomainFromWorkEmailOrDomain(value: string): string | null {
	return normalizeSsoDomain(value);
}
