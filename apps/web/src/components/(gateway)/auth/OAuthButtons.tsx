import Image from "@/components/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { handleOAuthRedirect } from "@/features/sign-in/actions";
import { Logo } from "@/components/Logo";
import { defaultLocale, type PublicLocale } from "@/i18n/routing";

export type SocialProviderId = "google" | "github" | "gitlab";
type LastAuthProvider = SocialProviderId | "email";

const SOCIAL_PROVIDER_IDS: SocialProviderId[] = ["google", "github", "gitlab"];
const LAST_AUTH_PROVIDER_STORAGE_KEY = "phaseo:last-auth-provider";
/** After this long without leaving the page, say so and offer to start again. */
export const OAUTH_SLOW_AFTER_MS = 6000;

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

type Redirect = { provider: SocialProviderId; slow: boolean };

function ProviderLogo({ meta }: { meta: ProviderMeta }) {
	const t = useTranslations("Auth.shared");
	if (meta.logoId) {
		return <Logo id={meta.logoId} width={18} height={18} className="h-[18px] w-[18px] shrink-0" />;
	}
	return (
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
	);
}

/**
 * Google / GitHub / GitLab, for both sign-in and sign-up. Once one is clicked the
 * page waits for the provider's page to load, which can take a while:
 * - the clicked button shows a spinner and the others are disabled;
 * - `onRedirectingChange` lets the parent lock its other options (email, passkey, SSO);
 * - a status line says "Opening Google…", and after OAUTH_SLOW_AFTER_MS "Still waiting
 *   for Google…" with "Try again", which cancels the attempt and unlocks everything;
 * - coming back with the browser's Back button (page restored from the back/forward
 *   cache) unlocks everything too, so nobody returns to a spinner that never stops.
 */
export default function OAuthButtons({
	returnUrl,
	locale = defaultLocale,
	flow = "signin",
	onStart,
	onRedirectingChange,
}: {
	returnUrl?: string;
	locale?: PublicLocale;
	flow?: "signin" | "signup";
	/** Called when a provider is chosen (sign-up records an analytics event). */
	onStart?: (provider: SocialProviderId) => void;
	/** True from the click until the attempt is cancelled or the page comes back. */
	onRedirectingChange?: (redirecting: boolean) => void;
}) {
	const t = useTranslations("Auth.shared");
	const [lastUsedProvider, setLastUsedProvider] = useState<LastAuthProvider | null>(null);
	const [redirect, setRedirect] = useState<Redirect | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const redirecting = redirect !== null;

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(LAST_AUTH_PROVIDER_STORAGE_KEY);
			if (stored === "google" || stored === "github" || stored === "gitlab" || stored === "email") {
				setLastUsedProvider(stored);
			}
		} catch {
			setLastUsedProvider(null);
		}
	}, []);

	useEffect(() => {
		onRedirectingChange?.(redirecting);
	}, [redirecting, onRedirectingChange]);

	const cancel = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setRedirect(null);
	}, []);

	// Slow: the provider's page hasn't loaded yet.
	useEffect(() => {
		if (!redirect || redirect.slow) return;
		const timer = window.setTimeout(
			() => setRedirect((current) => (current ? { ...current, slow: true } : current)),
			OAUTH_SLOW_AFTER_MS,
		);
		return () => window.clearTimeout(timer);
	}, [redirect]);

	// Back from the provider: the browser may restore this page as it was left, mid-redirect.
	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) cancel();
		};
		window.addEventListener("pageshow", onPageShow);
		return () => window.removeEventListener("pageshow", onPageShow);
	}, [cancel]);

	useEffect(() => () => abortRef.current?.abort(), []);

	const start = (event: FormEvent<HTMLFormElement>, provider: SocialProviderId) => {
		// Called directly rather than as a form action: a form action that never settles
		// (the page is unloading) would queue a second attempt behind it after "Try again".
		event.preventDefault();
		if (redirecting) return;
		try {
			window.localStorage.setItem(LAST_AUTH_PROVIDER_STORAGE_KEY, provider);
		} catch {
			// Ignore storage failures; auth still proceeds.
		}
		onStart?.(provider);
		const controller = new AbortController();
		abortRef.current = controller;
		setRedirect({ provider, slow: false });
		handleOAuthRedirect({ data: new FormData(event.currentTarget), signal: controller.signal }).catch(() => {
			// Couldn't reach the server (offline, request failed): offer to start again now.
			if (!controller.signal.aborted) setRedirect((current) => (current ? { ...current, slow: true } : current));
		});
	};

	const retry = () => {
		// The browser may already be loading the provider's page: stop that too.
		window.stop();
		cancel();
	};

	const activeLabel = redirect ? META[redirect.provider].label : "";

	return (
		<div className="flex flex-col">
			<div className="grid grid-cols-3 gap-2.5">
				{SOCIAL_PROVIDER_IDS.map((id) => {
					const meta = META[id];
					const active = redirect?.provider === id;
					return (
						<form key={id} onSubmit={(event) => start(event, id)}>
							<input type="hidden" name="authFlow" value={flow} />
							<input type="hidden" name="provider" value={id} />
							<input type="hidden" name="locale" value={locale} />
							{returnUrl ? <input type="hidden" name="returnUrl" value={returnUrl} /> : null}
							<Button
								type="submit"
								variant="outline"
								aria-label={t("providerContinue", { provider: meta.label })}
								className="relative h-12 w-full justify-center gap-2 px-2 aria-disabled:cursor-default"
								// The clicked button keeps focus (and full colour); the others are disabled.
								disabled={redirecting && !active}
								aria-disabled={active || undefined}
							>
								{lastUsedProvider === id && !redirecting ? (
									<span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground shadow-sm">
										{t("lastUsed")}
									</span>
								) : null}
								<span className="flex items-center justify-center">
									{active ? <Spinner aria-hidden className="h-[18px] w-[18px]" /> : <ProviderLogo meta={meta} />}
								</span>
								<span className="hidden text-sm min-[360px]:inline">{meta.label}</span>
							</Button>
						</form>
					);
				})}
			</div>

			{/* Grows in under the buttons; a live region, so screen readers hear each change. */}
			<div
				className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${redirecting ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
			>
				<div className="overflow-hidden">
					<p
						role="status"
						aria-live="polite"
						className="flex min-h-5 items-center justify-center gap-1.5 pt-2.5 text-center text-sm text-muted-foreground"
					>
						{redirect?.slow ? (
							<>
								<span>{t("providerSlow", { provider: activeLabel })}</span>
								<button
									type="button"
									onClick={retry}
									className="font-medium text-foreground underline underline-offset-4"
								>
									{t("providerRetry")}
								</button>
							</>
						) : redirect ? (
							<span>{t("providerOpening", { provider: activeLabel })}…</span>
						) : null}
					</p>
				</div>
			</div>
		</div>
	);
}
