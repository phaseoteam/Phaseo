"use client";

import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import BYOKInputDialog from "@/components/(gateway)/settings/byok/BYOKInputDialog";
import DeleteKeyButton from "@/components/(gateway)/settings/byok/DeleteKeyButton";

type Entry = {
	id: string;
	providerId: string;
	name: string;
	prefix?: string;
	suffix?: string;
	enabled: boolean;
	alwaysUse: boolean;
};

type ByokProviderRowProps = {
	provider: {
		id: string;
		name: string;
		logoId: string;
	};
	entry: Entry | null;
};

function maskKey(prefix?: string, suffix?: string) {
	const p = prefix ?? "";
	const s = suffix ?? "";
	return `${p}${"*".repeat(6)}${s}`;
}

export default function ByokProviderRow({ provider, entry }: ByokProviderRowProps) {
	return (
		<BYOKInputDialog
			providerId={provider.id}
			providerName={provider.name}
			initial={
				entry
					? {
						id: entry.id,
						providerId: entry.providerId,
						name: entry.name,
						prefix: entry.prefix,
						suffix: entry.suffix,
						enabled: entry.enabled,
						always_use: entry.alwaysUse,
					}
					: null
			}
			trigger={
				<div
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							e.currentTarget.click();
						}
					}}
					className="grid grid-cols-1 gap-1.5 px-3 py-2 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,3fr)] sm:items-center"
				>
					<div className="flex min-w-0 items-center gap-2">
						<Logo
							id={provider.logoId}
							alt={provider.name}
							width={24}
							height={24}
							className="h-6 w-6 object-contain"
						/>
						<div className="min-w-0 truncate text-sm font-medium">{provider.name}</div>
					</div>

					<div className="min-w-0 font-mono text-xs text-zinc-600 truncate dark:text-zinc-300 leading-none">
						{entry ? maskKey(entry.prefix, entry.suffix) : null}
					</div>

					<div className={`flex flex-wrap items-center gap-2 sm:flex-nowrap ${entry ? "sm:justify-start" : "sm:justify-end"}`}>
						{entry ? (
							<>
								<Badge variant="outline">
									{entry.alwaysUse ? "BYOK only" : "Fallback allowed"}
								</Badge>
								{!entry.enabled ? <Badge variant="secondary">Disabled</Badge> : null}
								<div
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => e.stopPropagation()}
								>
									<DeleteKeyButton id={entry.id} />
								</div>
							</>
						) : (
							<div className="flex items-center gap-1.5 text-sm font-medium text-primary">
								<Plus className="h-4 w-4" />
								<span>Add API Key</span>
							</div>
						)}
					</div>
				</div>
			}
		/>
	);
}
