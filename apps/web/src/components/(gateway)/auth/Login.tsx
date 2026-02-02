// components/(gateway)/auth/Login.tsx
import { cookies } from "next/headers";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { KeyRound } from "lucide-react";

const OAUTH = ["google", "github", "gitlab"] as const;
type OAuthProvider = (typeof OAUTH)[number];
type Provider = OAuthProvider | "email";

export async function Login() {
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

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Welcome back</h1>
				<p className="text-sm text-muted-foreground">
					Sign in or sign up to access the AI Stats Gateway and
					start exploring the insights you need.
				</p>
			</div>

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
