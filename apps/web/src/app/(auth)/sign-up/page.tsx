import { Suspense } from "react";
import type { Metadata } from "next";
import { SignUp } from "@/components/(gateway)/auth/sign-up/SignUp";
import { AuthWordmark } from "@/components/(gateway)/auth/AuthWordmark";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";

type SignUpPageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
	title: "Sign Up",
	description:
		"Create an AI Stats account to access the Gateway, configure model routing, review performance analytics, and manage billing across personal and team workspaces.",
};

export default async function Page({ searchParams }: SignUpPageProps) {
	const params = (await searchParams) ?? {};
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
							<SignUp returnUrl={returnUrl} />
						</Suspense>
					</div>
				</div>
			</div>
		</div>
	);
}
