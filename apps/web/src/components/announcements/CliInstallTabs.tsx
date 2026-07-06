"use client";

import { useMemo, useState } from "react";
import { SquareTerminal } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
type CommandMode = "install" | "update";

const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

function commandFor(packageName: string, packageManager: PackageManager, mode: CommandMode): string {
	const suffix = mode === "update" ? "@latest" : "";
	if (packageManager === "pnpm") return `pnpm add -g ${packageName}${suffix}`;
	if (packageManager === "yarn") return `yarn global add ${packageName}${suffix}`;
	if (packageManager === "bun") return `bun add -g ${packageName}${suffix}`;
	return `npm install -g ${packageName}${suffix}`;
}

export default function CliInstallTabs({
	packageName = "@ai-stats/cli",
	mode = "install",
	title,
}: {
	packageName?: string;
	mode?: CommandMode;
	title?: string;
}) {
	const [packageManager, setPackageManager] = useState<PackageManager>("npm");
	const command = useMemo(
		() => commandFor(packageName, packageManager, mode),
		[mode, packageManager, packageName],
	);

	return (
		<div className="my-6">
			<div className="mb-3">
				<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
					{title ?? (mode === "install" ? "Install the CLI" : "Update the CLI")}
				</p>
				<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
					Choose your package manager, then copy the command.
				</p>
			</div>
			<div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-950 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100">
				<div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
							<SquareTerminal className="size-3.5" aria-hidden="true" />
						</span>
						<div className="flex min-w-0 items-center gap-1">
							{PACKAGE_MANAGERS.map((entry) => (
								<button
									key={entry}
									type="button"
									className={cn(
										"rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
										entry === packageManager &&
											"bg-white text-zinc-950 shadow-xs ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-50 dark:ring-zinc-700"
									)}
									onClick={() => setPackageManager(entry)}
								>
									{entry}
								</button>
							))}
						</div>
					</div>
					<CopyButton
						content={command}
						variant="ghost"
						className="text-zinc-500 hover:bg-zinc-200 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
						aria-label={`Copy ${packageManager} ${mode} command`}
					/>
				</div>
				<code className="block min-w-0 overflow-x-auto whitespace-pre-wrap break-all px-4 py-4 font-mono">
					{command}
				</code>
			</div>
		</div>
	);
}
