"use client";

import Image from "next/image";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { handleOAuthRedirect } from "@/app/(auth)/sign-in/actions";
import { Logo } from "@/components/Logo";

type Provider = "google" | "github" | "gitlab";

const PROVIDERS: Provider[] = ["google", "github", "gitlab"];

type ProviderMeta = {
	label: string;
	logoId?: string;
	light?: string;
	dark?: string;
};

const META: Record<Provider, ProviderMeta> = {
	google: { label: "Google", logoId: "google" },
	github: {
		label: "GitHub",
		light: "/social/github_light.svg",
		dark: "/social/github_dark.svg",
	},
	gitlab: { label: "GitLab", light: "/social/gitlab.svg" },
};

function OAuthSubmitButton({ meta }: { meta: ProviderMeta }) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant="outline"
			aria-label={`Continue with ${meta.label}`}
			className="w-full h-10 flex items-center justify-center relative"
			disabled={pending}
		>
			<div className="absolute left-3 flex items-center">
				{meta.logoId ? (
					<Logo
						id={meta.logoId}
						width={16}
						height={16}
						className="h-4 w-4 shrink-0"
					/>
				) : (
					<>
						{meta.light ? (
							<Image
								src={meta.light}
								alt={`${meta.label} logo`}
								width={16}
								height={16}
								className="h-4 w-4 shrink-0 dark:hidden"
							/>
						) : null}
						{(meta.dark ?? meta.light) ? (
							<Image
								src={meta.dark ?? meta.light!}
								alt={`${meta.label} logo`}
								width={16}
								height={16}
								className="hidden h-4 w-4 shrink-0 dark:block"
							/>
						) : null}
					</>
				)}
			</div>

			<span className="text-center">
				{pending ? `Continuing with ${meta.label}...` : `Continue with ${meta.label}`}
			</span>
		</Button>
	);
}

export default function OAuthButtons({ returnUrl }: { returnUrl?: string }) {
	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<span className="px-2 text-sm font-medium">Quick sign-in</span>
				<div className="flex-1 border-t border-border" />
			</div>

			<div className="flex flex-col gap-3">
				{PROVIDERS.map((id) => {
					const meta = META[id];
					return (
						<form action={handleOAuthRedirect} key={id}>
							<input type="hidden" name="provider" value={id} />
							{returnUrl ? (
								<input type="hidden" name="returnUrl" value={returnUrl} />
							) : null}
							<OAuthSubmitButton meta={meta} />
						</form>
					);
				})}
			</div>
		</div>
	);
}
