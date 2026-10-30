"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { handleOAuthRedirect } from "@/app/(auth)/sign-in/actions";
import { Logo } from "@/components/Logo";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";

type SocialProviderId = "google" | "github" | "gitlab";
type LastAuthProvider = SocialProviderId | "email";

const SOCIAL_PROVIDER_IDS: SocialProviderId[] = ["google", "github", "gitlab"];
const LAST_AUTH_PROVIDER_STORAGE_KEY = "phaseo:last-auth-provider";

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
	const t = useTranslations("Auth.shared");

	return (
		<Button
			type="submit"
			variant="outline"
			aria-label={t("providerContinue", { provider: meta.label })}
			className="relative h-12 w-full justify-center gap-2 px-2"
			disabled={pending}
		>
			{isLastUsed ? (
				<span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
					{t("lastUsed")}
				</span>
			) : null}
			<span className="flex items-center justify-center">
				{pending ? (
					<Spinner
						aria-label={t("providerOpening", { provider: meta.label })}
					/>
				) : meta.logoId ? (
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
								alt={t("providerLogoAlt", { provider: meta.label })}
								width={18}
								height={18}
								className="h-[18px] w-[18px] shrink-0 dark:hidden"
							/>
						) : null}
						{(meta.dark ?? meta.light) ? (
							<Image
								src={meta.dark ?? meta.light!}
								alt={t("providerLogoAlt", { provider: meta.label })}
								width={18}
								height={18}
								className="hidden h-[18px] w-[18px] shrink-0 dark:block"
							/>
						) : null}
					</>
				)}
			</span>
			<span className="hidden text-sm min-[360px]:inline">
				{meta.label}
			</span>
		</Button>
	);
}

export default function OAuthButtons({
	returnUrl,
	locale = defaultLocale,
}: {
	returnUrl?: string;
	locale?: PublicLocale;
}) {
	const [lastUsedProvider, setLastUsedProvider] =
		useState<LastAuthProvider | null>(null);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(LAST_AUTH_PROVIDER_STORAGE_KEY);
			if (
				stored === "google" ||
				stored === "github" ||
				stored === "gitlab" ||
				stored === "email"
			) {
				setLastUsedProvider(stored);
			}
		} catch {
			setLastUsedProvider(null);
		}
	}, []);

	return (
		<div className="grid grid-cols-3 gap-2.5">
				{SOCIAL_PROVIDER_IDS.map((id) => {
					const meta = META[id];
					return (
						<form
							action={handleOAuthRedirect}
							key={id}
							onSubmit={() => {
								try {
									window.localStorage.setItem(
										LAST_AUTH_PROVIDER_STORAGE_KEY,
										id
									);
								} catch {
									// Ignore storage failures; auth still proceeds.
								}
							}}
						>
							<input type="hidden" name="authFlow" value="signin" />
							<input type="hidden" name="provider" value={id} />
							<input type="hidden" name="locale" value={locale} />
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
	);
}
