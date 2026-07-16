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
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { finalizePostLogin } from "@/lib/auth/post-login";
import { passkeysAdminBetaFlag } from "@/lib/flags";
import {
	buildStartSsoRequest,
	mapSsoAuthErrorMessage,
	type StartSsoInput,
} from "@/lib/auth/sso";

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

function buildRedirect(pathname: string, params: Record<string, string | undefined>) {
	const url = new URL(pathname, "http://localhost");
	for (const [key, value] of Object.entries(params)) {
		if (value) url.searchParams.set(key, value);
	}
	return `${url.pathname}${url.search}`;
}

// react-doctor-disable-next-line
export async function handleOAuthRedirect(formData: FormData) {
	const supabase = await createClient();
	const rawProvider = String(formData.get("provider") ?? "google").toLowerCase();
	if (!(OAUTH_PROVIDERS as readonly string[]).includes(rawProvider)) {
		redirect("/error?message=Authentication failed");
	}
	const provider = rawProvider as OAuthProvider;
	const safeReturnUrl = await resolveSafeReturnUrl(formData);
	const redirectTo = await resolveAuthCallbackUrl(safeReturnUrl);

	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: provider as any,
		options: { redirectTo },
	});

	if (error || !data?.url) {
		redirect("/error?message=Authentication failed");
	}
	redirect(data.url as any);
}

// react-doctor-disable-next-line
export async function handlePasswordSignIn(formData: FormData) {
	const supabase = await createClient();
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const safeReturnUrl = await resolveSafeReturnUrl(formData);

	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) {
		redirect(
			buildRedirect("/sign-in", {
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
		redirectPath = result.redirectPath;
	} catch (postLoginError) {
		console.error("Failed to finalize post-login state after password sign-in", {
			error:
				postLoginError instanceof Error
					? postLoginError.message
					: String(postLoginError),
		});
		errorRedirectUrl = `/error?message=${encodeURIComponent(
			"Your account was authenticated, but we could not finish setting up your workspace. Please contact support.",
		)}`;
	}
	if (errorRedirectUrl) redirect(errorRedirectUrl);
	redirect(redirectPath);
}

/** Completes server-side provisioning after a browser passkey ceremony. */
export async function completePasskeySignIn(returnUrl?: string) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		throw new Error("Passkey sign-in did not create a session");
	}

	const [isAdmin, passkeysEnabledForAdmin] = await Promise.all([
		isAdminViewer(),
		passkeysAdminBetaFlag(),
	]);
	if (!isAdmin || !passkeysEnabledForAdmin) {
		await supabase.auth.signOut();
		throw new Error("passkey_disabled");
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

	return { redirectPath: result.redirectPath };
}

// react-doctor-disable-next-line
export async function startSsoSignIn(input: StartSsoInput) {
	const supabase = await createClient();
	const returnUrl = sanitizeReturnUrl(input.returnUrl, "/");
	const safeReturnUrl = returnUrl === "/" ? undefined : returnUrl;
	const redirectTo = await resolveAuthCallbackUrl(safeReturnUrl);
	let request: ReturnType<typeof buildStartSsoRequest> | null = null;
	let errorRedirectUrl: string | null = null;

	try {
		request = buildStartSsoRequest(input, redirectTo);
	} catch (error) {
		errorRedirectUrl = `/error?message=${encodeURIComponent(mapSsoAuthErrorMessage(error))}`;
	}
	if (errorRedirectUrl) redirect(errorRedirectUrl);
	if (!request) redirect("/error?message=Authentication failed");

	if (request.kind === "oauth") {
		const { provider } = request.params as Extract<
			ReturnType<typeof buildStartSsoRequest>,
			{ kind: "oauth" }
		>["params"];
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
				`/error?message=${encodeURIComponent(
					mapSsoAuthErrorMessage(error),
				)}`,
			);
		}
		if (error || !data?.url) {
			return redirect(
				`/error?message=${encodeURIComponent(
					mapSsoAuthErrorMessage(error),
				)}`,
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
			`/error?message=${encodeURIComponent(
				mapSsoAuthErrorMessage(error),
				)}`,
			);
	}
	if (error || !data?.url) {
		return redirect(
			`/error?message=${encodeURIComponent(
				mapSsoAuthErrorMessage(error),
			)}`,
		);
	}
	return redirect(data.url as any);
}

// react-doctor-disable-next-line
export async function handleEnterpriseSsoRedirect(formData: FormData) {
	const domain = String(formData.get("domain") ?? "").trim();
	const returnUrl = String(formData.get("returnUrl") ?? "").trim();
	return startSsoSignIn({
		mode: "saml",
		domain,
		returnUrl: returnUrl || undefined,
	});
}

// react-doctor-disable-next-line
export async function forgotPasswordAction(email: string) {
	const supabase = await createClient();
	const authOrigin = await resolveAuthOrigin();

	const { error } = await supabase.auth.resetPasswordForEmail(email, {
		redirectTo: `${authOrigin}/auth/reset-password`,
	});

	if (error) {
		throw new Error("Failed to send password reset email");
	}

	return { success: true };
}
