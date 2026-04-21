import Link from "next/link";
import type { Metadata } from "next";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { handleEnterpriseSsoRedirect } from "@/app/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EnterpriseSignInPageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
	title: "Enterprise Login",
	description:
		"Sign in with your organization's enterprise identity provider.",
};

export default async function EnterpriseSignInPage({
	searchParams,
}: EnterpriseSignInPageProps) {
	const params = (await searchParams) ?? {};
	const returnUrlParam = Array.isArray(params.returnUrl)
		? params.returnUrl[0]
		: params.returnUrl;
	const sanitizedReturnUrl = sanitizeReturnUrl(
		typeof returnUrlParam === "string" ? returnUrlParam : null,
		"/",
	);
	const returnUrl = sanitizedReturnUrl === "/" ? undefined : sanitizedReturnUrl;

	return (
		<div className="grid min-h-svh place-items-center p-6 md:p-10">
			<div className="w-full max-w-sm space-y-6">
				<div className="space-y-2 text-center">
					<h1 className="text-2xl font-bold">Enterprise Login</h1>
					<p className="text-sm text-muted-foreground">
						Use your work email domain to continue with your organization's
						enterprise sign-in.
					</p>
				</div>

				<form action={handleEnterpriseSsoRedirect} className="grid gap-4">
					{returnUrl ? (
						<input type="hidden" name="returnUrl" value={returnUrl} />
					) : null}
					<div className="grid gap-2">
						<Label htmlFor="domain">Work Email Or Domain</Label>
						<Input
							id="domain"
							name="domain"
							type="text"
							placeholder="you@company.com or company.com"
							required
						/>
					</div>

					<Button type="submit" className="w-full">
						Continue with Enterprise SSO
					</Button>
				</form>

				<div className="text-center text-sm">
					<Link
						href={
							returnUrl
								? `/sign-in?returnUrl=${encodeURIComponent(returnUrl)}`
								: "/sign-in"
						}
						className="underline underline-offset-4"
					>
						Back to standard sign in
					</Link>
				</div>
			</div>
		</div>
	);
}
