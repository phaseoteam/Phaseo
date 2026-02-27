// components/(gateway)/auth/Login.tsx
import { cookies } from "next/headers";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { KeyRound } from "lucide-react";

const OAUTH = ["google", "github", "gitlab"] as const;
type OAuthProvider = (typeof OAUTH)[number];
type Provider = OAuthProvider | "email";
type SignupNotice = "exists" | "check-email" | null;

function normalizeAuthError(message: string | null): string | null {
	if (!message) return null;
	const lower = message.toLowerCase();
	if (lower.includes("invalid login credentials")) {
		return "Invalid email or password. Please try again.";
	}
	if (lower.includes("email not confirmed")) {
		return "Please verify your email before signing in.";
	}
	return message;
}

export async function Login({
	signupNotice = null,
	authError = null,
}: {
	signupNotice?: SignupNotice;
	authError?: string | null;
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
		signupNotice === "exists"
			? "That email is already registered. Sign in below or reset your password."
			: signupNotice === "check-email"
				? "Account created. Check your email to verify, then sign in."
				: null;
	const authErrorText = normalizeAuthError(authError);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Welcome back</h1>
				<p className="text-sm text-muted-foreground">
					Sign in or sign up to access the AI Stats Gateway and
					start exploring the insights you need.
				</p>
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

			<OAuthButtons />
			<EmailPassword />
		</div>
	);
}
