"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

type Sdk = {
	name: string;
	packageName: string;
	installCommand: string;
	logoId: string;
	docsLink: string;
	managerLink: string;
	supported: boolean;
	stage?: "alpha";
};

type SdkCardProps = {
	sdk: Sdk;
};

export function SdkCard({ sdk }: SdkCardProps) {
	const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
	const isAlpha = sdk.stage === "alpha";
	const canOpenPackage = sdk.supported || isAlpha;

	const copyToClipboard = async (command: string) => {
		try {
			await navigator.clipboard.writeText(command);
			setCopiedCommand(command);
			setTimeout(() => setCopiedCommand(null), 2000);
		} catch (err) {
			console.error("Failed to copy: ", err);
		}
	};

	return (
		<Card className="w-full">
			<CardContent className="px-3 py-2">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 items-center gap-3">
						<Logo id={sdk.logoId} className="h-7 w-7 shrink-0" width={28} height={28} />

						<div className="min-w-0 space-y-0.5">
							<div className="flex items-center gap-2">
								<h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
									{sdk.name}
								</h3>
								{isAlpha ? (
									<Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase tracking-wide">
										Alpha
									</Badge>
								) : !sdk.supported ? (
									<Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase tracking-wide">
										Soon
									</Badge>
								) : null}
							</div>

							<code className="block truncate text-[11px] text-muted-foreground">
								{sdk.packageName}
							</code>

							{sdk.supported ? (
								<div className="flex items-center gap-1.5">
									<code className="max-w-[min(56vw,520px)] truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
										{sdk.installCommand}
									</code>
									<button
										onClick={() => copyToClipboard(sdk.installCommand)}
										className="p-0.5 text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
										title="Copy to clipboard"
									>
										{copiedCommand === sdk.installCommand ? (
											<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
											</svg>
										) : (
											<svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
												/>
											</svg>
										)}
									</button>
								</div>
							) : (
								<p className="text-[11px] text-muted-foreground">Not published yet.</p>
							)}
						</div>
					</div>

					<div className="flex items-center gap-1.5 sm:shrink-0">
						<Link
							href={sdk.docsLink}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
						>
							<BookOpen className="h-3.5 w-3.5" />
							Docs
						</Link>

						<Link
							href={sdk.managerLink}
							target="_blank"
							rel="noreferrer"
							className={
								canOpenPackage
									? "inline-flex h-8 items-center gap-1 rounded-md border border-indigo-600 px-2 text-xs font-medium text-indigo-600 hover:border-indigo-500 hover:text-indigo-500 dark:border-indigo-400 dark:text-indigo-400 dark:hover:border-indigo-300 dark:hover:text-indigo-300"
									: "inline-flex h-8 items-center gap-1 rounded-md border border-indigo-600 px-2 text-xs font-medium text-indigo-600 opacity-50 pointer-events-none dark:border-indigo-400 dark:text-indigo-400"
							}
						>
							<ExternalLink className="h-3.5 w-3.5" />
							Package
						</Link>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
