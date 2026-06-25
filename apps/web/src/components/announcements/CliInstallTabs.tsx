"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

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
		<div className="my-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
			<div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
						{title ?? (mode === "install" ? "Install the CLI" : "Update the CLI")}
					</p>
					<p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
						Choose your package manager, then copy the command.
					</p>
				</div>
				<div className="w-full sm:w-44">
					<Select value={packageManager} onValueChange={(value) => setPackageManager(value as PackageManager)}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Package manager" />
						</SelectTrigger>
						<SelectContent>
							{PACKAGE_MANAGERS.map((entry) => (
								<SelectItem key={entry} value={entry}>
									{entry}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex items-start justify-between gap-3 bg-zinc-950 px-4 py-4 text-sm text-zinc-100">
				<code className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono">
					{command}
				</code>
				<CopyButton
					content={command}
					variant="outline"
					className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
					aria-label={`Copy ${packageManager} ${mode} command`}
				/>
			</div>
		</div>
	);
}
