"use client";

import * as React from "react";
import { useTranslations } from "@/i18n/react";
import { ChevronsUpDown, KeyRound, Laptop, MapPin, Server, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
	KEY_STORAGE_CATEGORIES,
	KEY_STORAGE_LOCATIONS,
	MAX_KEY_STORAGE_LOCATIONS,
	keyStorageLocation,
} from "./keyStorageLocations";
import { KEY_STORAGE_LOGOS } from "./keyStorageLogos";

const GENERIC_ICONS: Record<string, typeof KeyRound> = {
	"local-machine": Laptop,
	"own-server": Server,
	other: MapPin,
};

/** A location's mark in its brand colour, or the text colour where the brand colour wouldn't show up. */
export function KeyStorageLogo({ id, className }: { id: string; className?: string }) {
	const logo = KEY_STORAGE_LOGOS[id];
	if (logo) {
		const url = `url(/logos/key-storage/${id}.svg)`;
		if (logo.original) {
			return (
				<span
					aria-hidden="true"
					className={cn("inline-block size-4 shrink-0 bg-contain bg-center bg-no-repeat", className)}
					style={{ backgroundImage: url }}
				/>
			);
		}
		return (
			<span
				aria-hidden="true"
				className={cn(
					"inline-block size-4 shrink-0",
					!logo.color ? "bg-current" : logo.light === false ? "bg-current dark:bg-(--logo)" : logo.dark === false ? "bg-(--logo) dark:bg-current" : "bg-(--logo)",
					className,
				)}
				style={{ "--logo": logo.color, maskImage: url, WebkitMaskImage: url, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" } as React.CSSProperties}
			/>
		);
	}
	const Icon = GENERIC_ICONS[id] ?? KeyRound;
	return <Icon aria-hidden="true" className={cn("size-4 shrink-0", className)} />;
}

/** The display name of a location id; brand names stay as they are. */
export function useKeyStorageLocationName() {
	const t = useTranslations("SettingsUI");
	return React.useCallback((id: string) => {
		if (id in GENERIC_ICONS) return t(`keyStorage.locations.${id}` as never);
		return keyStorageLocation(id)?.name ?? id;
	}, [t]);
}

export function KeyStorageLocationPicker({
	id,
	value,
	onChange,
	disabled = false,
}: {
	id?: string;
	value: string[];
	onChange: (value: string[]) => void;
	disabled?: boolean;
}) {
	const t = useTranslations("SettingsUI");
	const nameOf = useKeyStorageLocationName();
	const [open, setOpen] = React.useState(false);
	const selected = new Set(value);
	const full = value.length >= MAX_KEY_STORAGE_LOCATIONS;

	function toggle(locationId: string) {
		const next = selected.has(locationId)
			? value.filter((entry) => entry !== locationId)
			: [...value, locationId];
		// Keep catalogue order so saved lists compare equal however they were picked.
		onChange(KEY_STORAGE_LOCATIONS.filter((location) => next.includes(location.id)).map((location) => location.id));
	}

	return (
		<div className="space-y-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						id={id}
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						disabled={disabled}
						className="h-10 w-full justify-between rounded-md px-3 font-normal"
					>
						<span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
							{value.length === 0
								? t("keyStorage.choose")
								: t("keyStorage.selectedCount", { count: value.length })}
						</span>
						<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[var(--anchor-width)] min-w-72 gap-0 rounded-md p-1">
					<Command>
						<CommandInput placeholder={t("keyStorage.search")} wrapperClassName="pb-1" />
						<ScrollArea className="h-72" viewportClassName="overscroll-contain">
							<CommandList className="max-h-none overflow-visible">
								<CommandEmpty>{t("keyStorage.noResults")}</CommandEmpty>
								{KEY_STORAGE_CATEGORIES.map((category) => {
									const locations = KEY_STORAGE_LOCATIONS.filter((location) => location.category === category && (!location.retired || selected.has(location.id)));
									if (locations.length === 0) return null;
									return (
										<CommandGroup key={category} heading={t(`keyStorage.categories.${category}` as never)}>
											{locations.map((location) => {
												const checked = selected.has(location.id);
												return (
													<CommandItem
														key={location.id}
														value={`${nameOf(location.id)} ${location.name} ${location.id}`}
														data-checked={checked}
														aria-checked={checked}
														disabled={!checked && full}
														onSelect={() => toggle(location.id)}
													>
														<KeyStorageLogo id={location.id} />
														<span className="min-w-0 flex-1 truncate">{nameOf(location.id)}</span>
													</CommandItem>
												);
											})}
										</CommandGroup>
									);
								})}
							</CommandList>
						</ScrollArea>
					</Command>
					{full ? (
						<p className="px-2 py-1.5 text-xs text-muted-foreground">{t("keyStorage.limit", { max: MAX_KEY_STORAGE_LOCATIONS })}</p>
					) : null}
				</PopoverContent>
			</Popover>
			{value.length > 0 ? (
				<ul className="flex flex-wrap gap-1.5">
					{value.map((locationId) => (
						<li key={locationId} className="flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs">
							<KeyStorageLogo id={locationId} className="size-3.5" />
							<span>{nameOf(locationId)}</span>
							<button
								type="button"
								disabled={disabled}
								aria-label={t("keyStorage.remove", { name: nameOf(locationId) })}
								onClick={() => toggle(locationId)}
								className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
							>
								<X className="size-3" />
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/** A read-only row of a key's locations, for tables and summaries. */
export function KeyStorageLocationList({ value, className }: { value: readonly string[]; className?: string }) {
	const nameOf = useKeyStorageLocationName();
	if (value.length === 0) return null;
	return (
		<span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
			{value.map((locationId) => (
				<span key={locationId} className="inline-flex items-center gap-1">
					<KeyStorageLogo id={locationId} className="size-3.5" />
					<span>{nameOf(locationId)}</span>
				</span>
			))}
		</span>
	);
}
