import type { PublicLocale } from "@/i18n/routing";
import { localizeAuthPath } from "@/lib/auth/localized-paths";

export const DEFAULT_AUTH_ERROR_MESSAGE =
	"We could not complete the sign-in flow. Please try again.";

export const AUTH_ERROR_CODES = [
	"default",
	"expired-link",
	"sso-not-configured",
	"sso-disabled",
	"sso-managed",
	"cancelled",
	"workspace-setup",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
	default: DEFAULT_AUTH_ERROR_MESSAGE,
	"expired-link": "Your sign-in link has expired. Please try signing in again.",
	"sso-not-configured":
		"Enterprise SSO is not configured for your organization yet.",
	"sso-disabled": "Enterprise SSO is configured but currently disabled.",
	"sso-managed":
		"This account is managed by SSO. Please use Enterprise SSO to sign in.",
	cancelled: "Sign-in was cancelled or denied. Please try again.",
	"workspace-setup":
		"Your account was authenticated, but we could not finish setting up your workspace. Please contact support.",
};

export function normalizeAuthErrorCode(
	value: string | null | undefined,
): AuthErrorCode {
	return (AUTH_ERROR_CODES as readonly string[]).includes(value ?? "")
		? (value as AuthErrorCode)
		: "default";
}

export function normalizeAuthErrorMessage(
	message: string | null | undefined,
): string {
	const trimmed = String(message ?? "").trim();
	if (!trimmed) return DEFAULT_AUTH_ERROR_MESSAGE;
	return trimmed.slice(0, 240);
}

export function buildAuthErrorRedirectUrl(
	requestUrl: string,
	message?: string | null,
): URL {
	const url = new URL("/error", requestUrl);
	url.searchParams.set("message", normalizeAuthErrorMessage(message));
	return url;
}

export function buildAuthErrorCodeRedirectUrl(
	requestUrl: string,
	code: AuthErrorCode,
	locale: PublicLocale,
): URL {
	const url = new URL(localizeAuthPath(locale, "/error"), requestUrl);
	url.searchParams.set("code", code);
	return url;
}

function mapKnownAuthErrorCode(params: URLSearchParams): AuthErrorCode | null {
	const errorCode = params.get("error_code");
	if (errorCode === "otp_expired") {
		return "expired-link";
	}
	if (
		errorCode === "sso_provider_not_found" ||
		errorCode === "saml_idp_not_found" ||
		errorCode === "saml_relay_state_not_found" ||
		errorCode === "saml_relay_state_expired"
	) {
		return "sso-not-configured";
	}
	if (errorCode === "saml_provider_disabled") {
		return "sso-disabled";
	}
	if (errorCode === "user_sso_managed") {
		return "sso-managed";
	}

	const error = params.get("error");
	if (error === "access_denied") {
		return "cancelled";
	}

	const errorDescription = params.get("error_description");
	if (errorDescription || error || errorCode) {
		return "default";
	}

	return null;
}

export function resolveCallbackErrorCode(url: URL): AuthErrorCode | null {
	return mapKnownAuthErrorCode(url.searchParams);
}

export function resolveHashAuthErrorCode(hash: string): AuthErrorCode | null {
	const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
	if (!normalizedHash) return null;
	return mapKnownAuthErrorCode(new URLSearchParams(normalizedHash));
}

export function resolveCallbackErrorMessage(url: URL): string | null {
	const code = resolveCallbackErrorCode(url);
	return code ? AUTH_ERROR_MESSAGES[code] : null;
}

export function resolveHashAuthErrorMessage(hash: string): string | null {
	const code = resolveHashAuthErrorCode(hash);
	return code ? AUTH_ERROR_MESSAGES[code] : null;
}
