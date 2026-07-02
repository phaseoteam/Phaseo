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
			<div className="relative grid min-h-svh place-items-center p-6 md:p-10">
				<div className="absolute left-6 top-6 md:left-10 md:top-10">
					<AuthWordmark />
				</div>
				<div className="mx-auto w-full max-w-sm">
					<SignUp returnUrl={returnUrl} />
				</div>
			</div>
		</div>
	);
}
