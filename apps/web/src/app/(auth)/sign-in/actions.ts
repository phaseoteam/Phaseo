// app/(auth)/sign-in/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
	resolveAuthCallbackUrl,
	resolveAuthOrigin,
} from "@/lib/auth/authOrigin";
import {
	buildStartSsoRequest,
	mapSsoAuthErrorMessage,
	type StartSsoInput,
} from "@/lib/auth/sso";

const cookieOpts = {
	path: "/",
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	maxAge: 60 * 60 * 24 * 180, // 6 months
};

export type { StartSsoInput } from "@/lib/auth/sso";

async function setAuthProviderCookie(provider: string): Promise<void> {
	await (await cookies()).set("auth_provider", provider, cookieOpts);
}

export async function handleOAuthRedirect(formData: FormData) {
	const supabase = await createClient();
	const provider = String(formData.get("provider") ?? "google").toLowerCase();
	const redirectTo = await resolveAuthCallbackUrl(formData.get("returnUrl"));

	await setAuthProviderCookie(provider);

	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: provider as any,
		options: { redirectTo },
	});

	if (error || !data?.url) {
		redirect("/error?message=Authentication failed");
	}
	redirect(data.url as any);
}

export async function handlePasswordSignIn(formData: FormData) {
	const supabase = await createClient();
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");

	const { error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) {
		const message = error.message || "Authentication failed";
		redirect(`/sign-in?error=${encodeURIComponent(message)}`);
	}

	await setAuthProviderCookie("email");

	const callbackUrl = new URL(
		await resolveAuthCallbackUrl(formData.get("returnUrl")),
	);
	callbackUrl.searchParams.set("type", "email");
	redirect(callbackUrl.toString());
}

export async function startSsoSignIn(input: StartSsoInput) {
	const supabase = await createClient();
	const redirectTo = await resolveAuthCallbackUrl(input.returnUrl);

	try {
		const request = buildStartSsoRequest(input, redirectTo);

		if (request.kind === "oauth") {
			await setAuthProviderCookie(request.params.provider);
			const { data, error } = await supabase.auth.signInWithOAuth(
				request.params as any,
			);
			if (error || !data?.url) {
				redirect(
					`/error?message=${encodeURIComponent(
						mapSsoAuthErrorMessage(error),
					)}`,
				);
			}
			redirect(data.url as any);
		}

		await setAuthProviderCookie("sso");
		const { data, error } = await supabase.auth.signInWithSSO(
			request.params as any,
		);
		if (error || !data?.url) {
			redirect(
				`/error?message=${encodeURIComponent(
					mapSsoAuthErrorMessage(error),
				)}`,
			);
		}
		redirect(data.url as any);
	} catch (error) {
		redirect(
			`/error?message=${encodeURIComponent(mapSsoAuthErrorMessage(error))}`,
		);
	}
}

export async function handleEnterpriseSsoRedirect(formData: FormData) {
	const domain = String(formData.get("domain") ?? "").trim();
	const returnUrl = String(formData.get("returnUrl") ?? "").trim();
	return startSsoSignIn({
		mode: "saml",
		domain,
		returnUrl: returnUrl || undefined,
	});
}

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
