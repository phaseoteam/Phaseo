import type { Metadata } from "next";
import { Suspense } from "react";
import { Login } from "@/components/(gateway)/auth/Login";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { AuthSuspenseFallback } from "../AuthSuspenseFallback";

type SignInPageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
	title: "Sign In",
	description:
		"Sign in to AI Stats to access the Gateway, manage teams, monitor usage, and continue with provider routing, model analytics, and account-level billing controls.",
};

export default function Page({ searchParams }: SignInPageProps) {
	return (
		<Suspense fallback={<AuthSuspenseFallback />}>
			<SignInPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function SignInPageContent({ searchParams }: SignInPageProps) {
	const params = (await searchParams) ?? {};
	const signup = Array.isArray(params.signup) ? params.signup[0] : params.signup;
	const signupNotice =
		signup === "exists" || signup === "check-email" ? "check-email" : null;
	const authErrorParam = Array.isArray(params.error)
		? params.error[0]
		: params.error;
	const authError = authErrorParam === "auth-failed" ? "auth-failed" : null;
	const returnUrlParam = Array.isArray(params.returnUrl)
		? params.returnUrl[0]
		: params.returnUrl;
	const sanitizedReturnUrl = sanitizeReturnUrl(
		typeof returnUrlParam === "string" ? returnUrlParam : null,
		"/",
	);
	const returnUrl = sanitizedReturnUrl === "/" ? undefined : sanitizedReturnUrl;

	return (
		<div className="min-h-svh">
			<div className="relative grid min-h-svh place-items-center p-6 md:p-10">
				<div className="absolute left-6 top-6 md:left-10 md:top-10">
					<AuthWordmark />
				</div>
				<div className="mx-auto w-full max-w-sm">
					<Login
						signupNotice={signupNotice}
						authError={authError}
						returnUrl={returnUrl}
					/>
				</div>
			</div>
		</div>
	);
}
