// app/(auth)/sign-in/page.tsx
import Link from "next/link";
import ProviderLogos from "@/components/(gateway)/auth/providers";
import SupportedModelsStats from "@/components/landingPage/Auth/SupportedModelsStats";
import KeyModels from "@/components/landingPage/Auth/KeyModels";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Login } from "@/components/(gateway)/auth/Login";

export const metadata: Metadata = {
	title: "Sign In",
	description:
		"Sign in or sign up to unlock the AI Stats Gateway and start exploring insights.",
};

export default function Page() {
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
							<Login />
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
