// app/(auth)/sign-up/page.tsx
import Link from "next/link";
import ProviderLogos from "@/components/(gateway)/auth/providers";
import SupportedModelsStats from "@/components/landingPage/Auth/SupportedModelsStats";
import KeyModels from "@/components/landingPage/Auth/KeyModels";
import { Suspense } from "react";
import type { Metadata } from "next";
import { SignUp } from "@/components/(gateway)/auth/sign-up/SignUp";
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
		"/"
	);
	const returnUrl = sanitizedReturnUrl.startsWith("/oauth/consent?")
		? sanitizedReturnUrl
		: undefined;
	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			{/* LEFT COL */}
			<div className="relative flex flex-col p-6 md:p-10">
				{/* Brand link overlayed top-left; doesn’t push content down */}
				<Link
					href="/"
					className="absolute left-6 top-6 md:left-10 md:top-10 z-10 inline-flex items-center gap-2 font-medium"
					aria-label="AI Stats home"
				>
					<span className="inline text-2xl font-semibold tracking-tight select-none">
						AI Stats
					</span>
				</Link>

				{/* Centre the login card */}
				<div className="flex flex-1 items-center justify-center">
					<div className="mx-auto w-full max-w-xs">
						<Suspense fallback={<div>Loading…</div>}>
							<SignUp returnUrl={returnUrl} />
						</Suspense>
					</div>
				</div>
			</div>

			{/* RIGHT COL */}
			<div className="hidden lg:flex mx-8 flex-col h-full relative">
				{/* Background provider logos - full bleed animated diagonal */}
				<div className="absolute inset-0 z-0">
					<ProviderLogos />
				</div>

				<div className="flex flex-col h-full w-full z-10 my-8 justify-between">
					<div className="flex items-center justify-center rounded-lg p-4 shadow-sm bg-white/60 dark:bg-black/40">
						<div className="w-full">
							<SupportedModelsStats />
						</div>
					</div>

					<div className="flex items-stretch justify-center rounded-lg p-4 shadow-sm bg-white/60 dark:bg-black/40 overflow-auto">
						<div className="w-full">
							<KeyModels />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
