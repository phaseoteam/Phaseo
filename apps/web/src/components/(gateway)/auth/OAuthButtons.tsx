"use client";

import Image from "next/image";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { handleOAuthRedirect } from "@/app/(auth)/sign-in/actions";
import { Logo } from "@/components/Logo";

type SocialProviderId = "google" | "github" | "gitlab";

const SOCIAL_PROVIDER_IDS: SocialProviderId[] = ["google", "github", "gitlab"];

type ProviderMeta = {
	label: string;
	logoId?: string;
	light?: string;
	dark?: string;
};

const META: Record<SocialProviderId, ProviderMeta> = {
	google: { label: "Google", logoId: "google" },
	github: {
		label: "GitHub",
		light: "/social/github_light.svg",
		dark: "/social/github_dark.svg",
	},
	gitlab: { label: "GitLab", light: "/social/gitlab.svg" },
};

function OAuthSubmitButton({
	meta,
	isLastUsed = false,
}: {
	meta: ProviderMeta;
	isLastUsed?: boolean;
}) {
	const { pending } = useFormStatus();
	return (
		<Button
			type="submit"
			variant="outline"
			aria-label={`Continue with ${meta.label}`}
			className="relative h-12 w-full justify-center"
			disabled={pending}
		>
			{isLastUsed ? (
				<span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
					Last Used
				</span>
			) : null}
			<span className="flex items-center justify-center">
				{meta.logoId ? (
					<Logo
						id={meta.logoId}
						width={18}
						height={18}
						className="h-[18px] w-[18px] shrink-0"
					/>
				) : (
					<>
						{meta.light ? (
							<Image
								src={meta.light}
								alt={`${meta.label} logo`}
								width={18}
								height={18}
								className="h-[18px] w-[18px] shrink-0 dark:hidden"
							/>
						) : null}
						{(meta.dark ?? meta.light) ? (
							<Image
								src={meta.dark ?? meta.light!}
								alt={`${meta.label} logo`}
								width={18}
								height={18}
								className="hidden h-[18px] w-[18px] shrink-0 dark:block"
							/>
						) : null}
					</>
				)}
			</span>
			<span className="sr-only">
				{pending ? `Continuing with ${meta.label}...` : `Continue with ${meta.label}`}
			</span>
		</Button>
	);
}

export default function OAuthButtons({
	returnUrl,
	lastUsedProvider,
}: {
	returnUrl?: string;
	lastUsedProvider?: SocialProviderId | null;
}) {
	return (
		<div className="grid gap-5">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<span className="px-2 text-sm font-medium">Quick sign-in</span>
				<div className="flex-1 border-t border-border" />
			</div>

			<div className="grid grid-cols-3 gap-3">
				{SOCIAL_PROVIDER_IDS.map((id) => {
					const meta = META[id];
					return (
						<form action={handleOAuthRedirect} key={id}>
							<input type="hidden" name="authFlow" value="signin" />
							<input type="hidden" name="provider" value={id} />
							{returnUrl ? (
								<input type="hidden" name="returnUrl" value={returnUrl} />
							) : null}
							<OAuthSubmitButton
								meta={meta}
								isLastUsed={lastUsedProvider === id}
							/>
						</form>
					);
				})}
			</div>
		</div>
	);
}
