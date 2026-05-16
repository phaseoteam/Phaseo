// components/(gateway)/auth/Login.tsx
import { cookies } from "next/headers";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";

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

			<OAuthButtons
				returnUrl={returnUrl}
				lastUsedProvider={
					lastProvider && lastProvider !== "email" ? lastProvider : null
				}
			/>
			<EmailPassword returnUrl={returnUrl} />
		</div>
	);
}
