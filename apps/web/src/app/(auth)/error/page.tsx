import Link from "next/link";

export default function AuthErrorPage() {
	return (
		<main className="min-h-screen flex items-center justify-center px-4">
			<div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
				<h1 className="text-lg font-semibold">Authentication failed</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					We could not complete the sign-in flow. Please try again.
				</p>
				<div className="mt-4">
					<Link className="text-sm underline underline-offset-4" href="/sign-in">
						Back to sign in
					</Link>
				</div>
			</div>
		</main>
	);
}
