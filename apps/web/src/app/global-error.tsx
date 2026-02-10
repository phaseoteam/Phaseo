// app/global-error.tsx
"use client";

/**
 * Global error boundary for the App Router.
 * Renders when the root layout fails, so we can't rely on providers or layout styles.
 * Tailwind still works, but we avoid CSS vars that might be defined in the layout.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
	AlertTriangle,
	RotateCcw,
	Home,
	Copy,
	RefreshCcw,
	Github,
} from "lucide-react";
import { reportClientError } from "@/lib/clientErrorReporting";

// If your global styles are only imported in layout.tsx, uncomment the next line:
// import "./globals.css";

type GlobalErrorProps = {
	error: Error & { digest?: string };
	reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [copied, setCopied] = useState(false);
	const [nowIso, setNowIso] = useState("");
	const [showDetails, setShowDetails] = useState(
		process.env.NODE_ENV !== "production"
	);

	// Best-effort dark mode so it still looks right without the root layout
	useEffect(() => {
		try {
			const prefersDark = window.matchMedia?.(
				"(prefers-color-scheme: dark)"
			).matches;
			document.documentElement.classList.toggle("dark", prefersDark);
		} catch {}
	}, []);

	// Log to console (or swap for Sentry if you have it)
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.error("[global-error]", error);
		reportClientError({
			source: "global-error-boundary",
			message: error?.message ?? "Unknown global error",
			stack: error?.stack ?? null,
			fatal: true,
			handled: true,
			context: {
				digest: error?.digest ?? null,
			},
		});
	}, [error]);

	useEffect(() => {
		setNowIso(new Date().toISOString());
	}, []);
	const pathWithQuery = useMemo(() => {
		const q = searchParams?.toString();
		return q ? `${pathname}?${q}` : pathname || "/";
	}, [pathname, searchParams]);

	const details = useMemo(() => {
		const base = {
			message: error?.message ?? "Unknown error",
			digest: error?.digest ?? null,
			path: pathWithQuery,
			time: nowIso,
			userAgent:
				typeof navigator !== "undefined"
					? navigator.userAgent
					: "server",
			nodeEnv: process.env.NODE_ENV,
		};
		const stack = error?.stack ?? "";
		return `${JSON.stringify(base, null, 2)}\n\n${stack}`;
	}, [error, nowIso, pathWithQuery]);

	const issueUrl = useMemo(() => {
		const title = encodeURIComponent(
			`Global Error: ${error?.message ?? "Unknown"} (${
				error?.digest ?? "no-digest"
			})`
		);
		const body = encodeURIComponent(
			[
				"### What happened?",
				"",
				"_Add any context, steps to reproduce, or screenshots here._",
				"",
				"### Automatic details",
				"```json",
				details,
				"```",
			].join("\n")
		);
		// Change to your repo URL
		return `https://github.com/AI-Stats/AI-Stats/issues/new?title=${title}&body=${body}`;
	}, [details, error?.digest, error?.message]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(details);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {}
	};

	return (
		<html lang="en" className="h-full">
			<body className="h-full bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
				<main className="min-h-full grid place-items-center p-6">
					<div className="w-full max-w-xl rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
						<div className="flex items-start gap-3">
							<div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent text-amber-600 dark:text-amber-400 bg-amber-500/10">
								<AlertTriangle className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h1 className="text-lg font-semibold">
									Something went wrong
								</h1>
								<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
									We hit an unexpected error while loading
									this page. You can try again or head back
									home.
								</p>

								<div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
									<div className="flex flex-wrap gap-x-3 gap-y-1">
										<span>
											<span className="text-zinc-500">
												Path:
											</span>{" "}
											<code className="font-mono">
												{pathWithQuery}
											</code>
										</span>
										{error?.digest && (
											<span>
												<span className="text-zinc-500">
													Ref:
												</span>{" "}
												<code className="font-mono">
													{error.digest}
												</code>
											</span>
										)}
										<span>
											<span className="text-zinc-500">
												Time:
											</span>{" "}
											<code className="font-mono">
												{nowIso}
											</code>
										</span>
									</div>
								</div>

								{/* Actions */}
								<div className="mt-4 flex flex-wrap items-center gap-2">
									<button
										onClick={reset}
										className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-zinc-900/70 dark:focus-visible:ring-zinc-600/50"
									>
										<RotateCcw className="h-4 w-4" />
										Try again
									</button>

									<button
										onClick={() => location.reload()}
										className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-zinc-900/70 dark:focus-visible:ring-zinc-600/50"
									>
										<RefreshCcw className="h-4 w-4" />
										Reload
									</button>

									<Link
										href="/"
										className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-zinc-900/70 dark:focus-visible:ring-zinc-600/50"
									>
										<Home className="h-4 w-4" />
										Home
									</Link>

									<a
										href={issueUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-zinc-900/70 dark:focus-visible:ring-zinc-600/50"
									>
										<Github className="h-4 w-4" />
										Report issue
									</a>

									<button
										onClick={copy}
										className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-zinc-900/70 dark:focus-visible:ring-zinc-600/50"
									>
										<Copy className="h-4 w-4" />
										{copied ? "Copied" : "Copy details"}
									</button>
								</div>

								{/* Collapsible details */}
								<div className="mt-3">
									<button
										onClick={() =>
											setShowDetails((s) => !s)
										}
										className="text-sm text-zinc-600 underline decoration-dotted underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
									>
										{showDetails
											? "Hide technical details"
											: "Show technical details"}
									</button>
									{showDetails && (
										<pre className="mt-2 max-h-[320px] overflow-auto rounded-lg border border-zinc-200/80 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
											{details}
										</pre>
									)}
								</div>
							</div>
						</div>
					</div>
				</main>
			</body>
		</html>
	);
}
