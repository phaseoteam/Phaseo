import { Suspense } from "react";
import type { Metadata } from "next";
import { Login } from "@/components/(gateway)/auth/Login";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";

type SignInPageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
	title: "Sign In",
	description:
		"Sign in to AI Stats to access the Gateway, manage teams, monitor usage, and continue with provider routing, model analytics, and account-level billing controls.",
};

export default async function Page({ searchParams }: SignInPageProps) {
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
			<div className="flex min-h-svh flex-col p-6 md:p-10">
				<div className="shrink-0">
					<AuthWordmark />
				</div>
				<div className="flex flex-1 items-start justify-center pt-8 md:items-center md:pt-0">
					<div className="mx-auto w-full max-w-sm">
						<Suspense fallback={<div>Loading...</div>}>
							<Login
								signupNotice={signupNotice}
								authError={authError}
								returnUrl={returnUrl}
							/>
						</Suspense>
					</div>
				</div>
			</div>
		</div>
	);
}
