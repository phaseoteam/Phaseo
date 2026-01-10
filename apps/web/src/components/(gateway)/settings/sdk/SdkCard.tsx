"use client";

import Link from "next/link";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

type Sdk = {
	name: string;
	packageName: string;
	installCommand: string;
	logoId: string;
	managerLink: string;
	supported: boolean;
};

type SdkCardProps = {
	sdk: Sdk;
};

export function SdkCard({ sdk }: SdkCardProps) {
	const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

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
			<CardContent className="p-4">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
						<Logo
							id={sdk.logoId}
							className="h-10 w-10"
							width={40}
							height={40}
						/>
						<div>
							<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
								{sdk.name}
							</h3>
							{sdk.supported ? (
								<div className="mt-1 flex flex-wrap items-center gap-2">
									<code className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded text-sm font-mono break-all">
										{sdk.installCommand}
									</code>
									<button
										onClick={() =>
											copyToClipboard(sdk.installCommand)
										}
										className="p-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
										title="Copy to clipboard"
									>
										{copiedCommand ===
										sdk.installCommand ? (
											<svg
												className="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										) : (
											<svg
												className="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
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
								<p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
									{sdk.installCommand}
								</p>
							)}
						</div>
					</div>
					<Link
						href={sdk.managerLink}
						target="_blank"
						rel="noreferrer"
						className={`px-4 py-2 text-sm font-semibold rounded-md ${
							sdk.supported
								? "text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 border border-indigo-600 hover:border-indigo-500 dark:border-indigo-400 dark:hover:border-indigo-300"
								: "text-indigo-600 dark:text-indigo-400 border border-indigo-600 dark:border-indigo-400 pointer-events-none opacity-50"
						}`}
					>
						View library page
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
