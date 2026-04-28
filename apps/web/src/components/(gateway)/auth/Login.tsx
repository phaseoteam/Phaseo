// components/(gateway)/auth/Login.tsx
import { cookies } from "next/headers";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Building2, KeyRound } from "lucide-react";

const OAUTH = ["google", "github", "gitlab"] as const;
type OAuthProvider = (typeof OAUTH)[number];
type Provider = OAuthProvider | "email";
type SignupNotice = "check-email" | null;

export async function Login({
	signupNotice = null,
	authError = null,
	returnUrl,
}: {
	signupNotice?: SignupNotice;
	authError?: "auth-failed" | null;
	returnUrl?: string;
}) {
	let lastProvider: Provider | null = null;
	try {
		const c = await cookies();
		lastProvider = (c.get("auth_provider")?.value?.toLowerCase() ??
			null) as Provider | null;
	} catch {
		lastProvider = null;
	}

	const providerLabel = lastProvider
		? lastProvider === "email"
			? "Email"
			: lastProvider[0].toUpperCase() + lastProvider.slice(1)
		: null;

	const signupNoticeText =
		signupNotice === "check-email"
			? "If an account exists for that email, check your inbox for next steps."
			: null;
	const authErrorText = authError === "auth-failed" ? "Invalid email or password. Please try again." : null;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Welcome back</h1>
			</div>

			{signupNoticeText ? (
				<p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
					{signupNoticeText}
				</p>
			) : null}
			{authErrorText ? (
				<p
					className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
					role="alert"
					aria-live="polite"
				>
					{authErrorText}
				</p>
			) : null}

			{lastProvider ? (
				<Item variant="outline" size="sm">
					<ItemMedia>
						<KeyRound className="size-4" />
					</ItemMedia>
					<ItemContent className="flex items-center justify-center">
						<ItemTitle className="text-center">
							You last signed in with {providerLabel}.
						</ItemTitle>
					</ItemContent>
				</Item>
			) : null}

			<OAuthButtons returnUrl={returnUrl} />
			<Button
				type="button"
				variant="outline"
				className="relative h-10 w-full justify-center"
				disabled
				aria-disabled="true"
			>
				<span className="absolute left-3 flex items-center">
					<Building2 className="h-4 w-4" aria-hidden="true" />
				</span>
				Enterprise Login
			</Button>
			<EmailPassword returnUrl={returnUrl} />
		</div>
	);
}
