"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { COUNTRY_OPTIONS } from "@/lib/countryCodes";
import { cn } from "@/lib/utils";

type CountryComboboxProps = {
	className?: string;
	id?: string;
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	placeholder?: string;
};

export function CountryCombobox({
	className,
	id,
	value,
	onValueChange,
	disabled = false,
	placeholder = "Select a country",
}: CountryComboboxProps) {
	const [open, setOpen] = React.useState(false);
	const searchInputRef = React.useRef<HTMLInputElement>(null);
	const listViewportRef = React.useRef<HTMLDivElement>(null);
	const selected = COUNTRY_OPTIONS.find((country) => country.code === value);

	React.useEffect(() => {
		if (!open) return;
		const frame = window.requestAnimationFrame(() => {
			const viewport = listViewportRef.current;
			const selectedItem = viewport?.querySelector<HTMLElement>(
				"[data-checked='true']",
			);
			if (viewport && selectedItem) {
				const viewportRect = viewport.getBoundingClientRect();
				const itemRect = selectedItem.getBoundingClientRect();
				viewport.scrollTop +=
					itemRect.top -
					viewportRect.top -
					(viewport.clientHeight - itemRect.height) / 2;
			}
			searchInputRef.current?.focus({ preventScroll: true });
		});
		return () => window.cancelAnimationFrame(frame);
	}, [open, value]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Select country"
					disabled={disabled}
					className={cn("h-10 w-full justify-between rounded-md px-3 font-normal", className)}
				>
					<span className="flex min-w-0 items-center gap-2">
						{selected ? (
							<Image
								aria-hidden="true"
								src={`/flags/${selected.code.toLowerCase()}.svg`}
								alt=""
								width={20}
								height={14}
								className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
							/>
						) : null}
						<span className={cn("truncate", !selected && "text-muted-foreground")}>
							{selected?.name ?? placeholder}
						</span>
					</span>
					<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				initialFocus={false}
				className="w-[var(--anchor-width)] min-w-72 gap-0 rounded-xl p-1"
			>
				<Command>
					<CommandInput
						ref={searchInputRef}
						placeholder="Search country, ISO-2 or ISO-3…"
						wrapperClassName="pb-1"
					/>
					<ScrollArea
						className="h-64"
						viewportClassName="overscroll-contain"
						viewportRef={listViewportRef}
					>
						<CommandList className="max-h-none overflow-visible">
							<CommandEmpty>No country found.</CommandEmpty>
							<CommandGroup>
								{COUNTRY_OPTIONS.map((country) => (
									<CommandItem
										key={country.code}
										value={`${country.name} ${country.code} ${country.alpha3}`}
										data-checked={country.code === value}
										onSelect={() => {
											onValueChange(country.code);
											setOpen(false);
										}}
									>
										<Image
											aria-hidden="true"
											src={`/flags/${country.code.toLowerCase()}.svg`}
											alt=""
											width={20}
											height={14}
											className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
										/>
										<span className="min-w-0 flex-1 truncate">
											{country.name}
										</span>
										<span className="text-xs text-muted-foreground">
											{country.code}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</ScrollArea>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
