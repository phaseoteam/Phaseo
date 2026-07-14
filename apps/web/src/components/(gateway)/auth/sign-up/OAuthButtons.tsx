"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { handleOAuthRedirect } from "@/app/(auth)/sign-in/actions";
import { Logo } from "@/components/Logo";
import { captureProductEvent } from "@/lib/productAnalytics";

type SocialProviderId = "google" | "github" | "gitlab";

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

export default function OAuthButtons({
	returnUrl,
}: {
	returnUrl?: string;
}) {
	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-2">
				<div className="flex-1 border-t border-border" />
				<span className="px-2 text-sm font-medium">Quick sign-up</span>
				<div className="flex-1 border-t border-border" />
			</div>

			<div className="grid grid-cols-3 gap-3">
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
								captureProductEvent("account_signup_started", {
									method: id,
								});
							}}
						>
							<input type="hidden" name="authFlow" value="signup" />
							<input type="hidden" name="provider" value={id} />
							{returnUrl ? (
								<input type="hidden" name="returnUrl" value={returnUrl} />
							) : null}
							<Button
								type="submit"
								variant="outline"
								aria-label={`Continue with ${meta.label}`}
								className="h-12 w-full justify-center"
							>
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
													src={
														meta.dark ?? meta.light!
													}
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
									Continue with {meta.label}
								</span>
							</Button>
						</form>
					);
				})}
			</div>
		</div>
	);
}
