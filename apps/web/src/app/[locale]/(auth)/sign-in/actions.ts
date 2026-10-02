// app/(auth)/sign-in/actions.ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
	configuredAuthOriginsFromEnv,
	resolveAuthCallbackUrl,
	resolveAuthOrigin,
	resolveLocalDevAuthOrigin,
	stripTrailingSlash,
} from "@/lib/auth/authOrigin";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { finalizePostLogin } from "@/lib/auth/post-login";
import {
	buildStartSsoRequest,
	mapSsoAuthErrorMessage,
	type StartSsoInput,
} from "@/lib/auth/sso";
import { samlSsoFlag } from "@/lib/flags";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";
import type { AuthErrorCode } from "@/lib/auth/errorMessage";
import {
	buildLocalizedAuthPath,
	readAuthLocale,
	resolveAuthLocale,
	withAuthLocale,
} from "@/lib/auth/localized-paths";

const OAUTH_PROVIDERS = ["google", "github", "gitlab"] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export type { StartSsoInput } from "@/lib/auth/sso";

async function resolveSafeReturnUrl(formData: FormData): Promise<string | undefined> {
	const fromForm = sanitizeReturnUrl(formData.get("returnUrl"), "/");
	if (fromForm !== "/") return fromForm;

	const headerStore = await headers();
	const referer = headerStore.get("referer");
	if (!referer) return undefined;

	try {
		const refererUrl = new URL(referer);
		const refererOrigin = stripTrailingSlash(refererUrl.origin);
		const configuredOrigins = configuredAuthOriginsFromEnv();
		const isAllowedRefererOrigin =
			configuredOrigins.length > 0
				? configuredOrigins.includes(refererOrigin)
				: process.env.NODE_ENV !== "production" &&
					refererOrigin ===
						resolveLocalDevAuthOrigin({
							originHeader: headerStore.get("origin"),
							hostHeader:
								headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
						});
		if (!isAllowedRefererOrigin) return undefined;

		const fromReferer = sanitizeReturnUrl(refererUrl.searchParams.get("returnUrl"), "/");
		return fromReferer === "/" ? undefined : fromReferer;
	} catch {
		return undefined;
	}
}

function buildAuthErrorRedirect(
	locale: PublicLocale,
	code: AuthErrorCode = "default",
) {
	return buildLocalizedAuthPath(locale, "/error", { code });
}

function preserveLocaleForTechnicalAuthPath(
	pathname: string,
	locale: PublicLocale,
): string {
	return pathname.startsWith("/auth/verify-mfa")
		? withAuthLocale(pathname, locale)
		: pathname;
}

function mapSsoAuthErrorCode(error: unknown): AuthErrorCode {
	const message = mapSsoAuthErrorMessage(error);
	if (message.includes("not configured")) return "sso-not-configured";
	if (message.includes("currently disabled")) return "sso-disabled";
	if (message.includes("managed by SSO")) return "sso-managed";
	return "default";
}

// react-doctor-disable-next-line
export async function handleOAuthRedirect(formData: FormData) {
	const locale = readAuthLocale(formData);
	const supabase = await createClient();
	const rawProvider = String(formData.get("provider") ?? "google").toLowerCase();
	if (!(OAUTH_PROVIDERS as readonly string[]).includes(rawProvider)) {
		redirect(buildAuthErrorRedirect(locale));
	}
	const provider = rawProvider as OAuthProvider;
	const safeReturnUrl = await resolveSafeReturnUrl(formData);
	const redirectTo = await resolveAuthCallbackUrl(safeReturnUrl, locale);

	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: provider as any,
		options: { redirectTo },
	});

	if (error || !data?.url) {
		redirect(buildAuthErrorRedirect(locale));
	}
	redirect(data.url as any);
}

// react-doctor-disable-next-line
export async function handlePasswordSignIn(formData: FormData) {
	const locale = readAuthLocale(formData);
	const supabase = await createClient();
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const safeReturnUrl = await resolveSafeReturnUrl(formData);

	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) {
		redirect(
			buildLocalizedAuthPath(locale, "/sign-in", {
				error: "auth-failed",
				returnUrl: safeReturnUrl,
			}),
		);
	}

	let redirectPath = safeReturnUrl ?? "/";
	let errorRedirectUrl: string | null = null;
	try {
		const result = await finalizePostLogin({
			supabaseUser: supabase,
			user: data.user,
			session: data.session,
			returnUrl: safeReturnUrl ?? "/",
			source: "server_action",
		});
		redirectPath = preserveLocaleForTechnicalAuthPath(
			result.redirectPath,
			locale,
		);
	} catch (postLoginError) {
		console.error("Failed to finalize post-login state after password sign-in", {
			error:
				postLoginError instanceof Error
					? postLoginError.message
					: String(postLoginError),
		});
		errorRedirectUrl = buildAuthErrorRedirect(locale, "workspace-setup");
	}
	if (errorRedirectUrl) redirect(errorRedirectUrl);
	redirect(redirectPath);
}

/** Completes server-side provisioning after a browser passkey ceremony. */
export async function completePasskeySignIn(
	returnUrl?: string,
	localeInput: string = defaultLocale,
) {
	const locale = resolveAuthLocale(localeInput);
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		throw new Error("Passkey sign-in did not create a session");
	}

	const {
		data: { session },
	} = await supabase.auth.getSession();
	const result = await finalizePostLogin({
		supabaseUser: supabase,
		user,
		session,
		returnUrl: sanitizeReturnUrl(returnUrl, "/"),
		source: "server_action",
	});

	return {
		redirectPath: preserveLocaleForTechnicalAuthPath(
			result.redirectPath,
			locale,
		),
	};
}

// react-doctor-disable-next-line
export async function startSsoSignIn(
	input: StartSsoInput,
	localeInput: string = defaultLocale,
) {
	const locale = resolveAuthLocale(localeInput);
	if (!(await samlSsoFlag())) {
		redirect(buildAuthErrorRedirect(locale));
	}
	const supabase = await createClient();
	const returnUrl = sanitizeReturnUrl(input.returnUrl, "/");
	const safeReturnUrl = returnUrl === "/" ? undefined : returnUrl;
	const redirectTo = await resolveAuthCallbackUrl(safeReturnUrl, locale);
	let request: ReturnType<typeof buildStartSsoRequest> | null = null;
	let errorRedirectUrl: string | null = null;

	try {
		request = buildStartSsoRequest(input, redirectTo);
	} catch (error) {
		errorRedirectUrl = buildAuthErrorRedirect(
			locale,
			mapSsoAuthErrorCode(error),
		);
	}
	if (errorRedirectUrl) redirect(errorRedirectUrl);
	if (!request) redirect(buildAuthErrorRedirect(locale));

	if (request.kind === "oauth") {
		let data:
			| Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>["data"]
			| undefined;
		let error:
			| Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>["error"]
			| undefined;
		try {
			({ data, error } = await supabase.auth.signInWithOAuth(
				request.params as any,
			));
		} catch (error) {
			return redirect(
				buildAuthErrorRedirect(locale, mapSsoAuthErrorCode(error)),
			);
		}
		if (error || !data?.url) {
			return redirect(
				buildAuthErrorRedirect(locale, mapSsoAuthErrorCode(error)),
			);
		}
		return redirect(data.url as any);
	}

	let data:
		| Awaited<ReturnType<typeof supabase.auth.signInWithSSO>>["data"]
		| undefined;
	let error:
		| Awaited<ReturnType<typeof supabase.auth.signInWithSSO>>["error"]
		| undefined;
	try {
		({ data, error } = await supabase.auth.signInWithSSO(
			request.params as any,
		));
	} catch (error) {
		return redirect(
			buildAuthErrorRedirect(locale, mapSsoAuthErrorCode(error)),
		);
	}
	if (error || !data?.url) {
		return redirect(
			buildAuthErrorRedirect(locale, mapSsoAuthErrorCode(error)),
		);
	}
	return redirect(data.url as any);
}

// react-doctor-disable-next-line
export async function handleEnterpriseSsoRedirect(formData: FormData) {
	const domain = String(formData.get("domain") ?? "").trim();
	const returnUrl = String(formData.get("returnUrl") ?? "").trim();
	const locale = readAuthLocale(formData);
	return startSsoSignIn(
		{
			mode: "saml",
			domain,
			returnUrl: returnUrl || undefined,
		},
		locale,
	);
}

// react-doctor-disable-next-line
export async function forgotPasswordAction(
	email: string,
	localeInput: string = defaultLocale,
) {
	const locale = resolveAuthLocale(localeInput);
	const supabase = await createClient();
	const authOrigin = await resolveAuthOrigin();
	const resetPasswordUrl = new URL("/auth/reset-password", authOrigin);
	resetPasswordUrl.searchParams.set("locale", locale);

	const { error } = await supabase.auth.resetPasswordForEmail(email, {
		redirectTo: resetPasswordUrl.toString(),
	});

	if (error) {
		throw new Error("Failed to send password reset email");
	}

	return { success: true };
}
