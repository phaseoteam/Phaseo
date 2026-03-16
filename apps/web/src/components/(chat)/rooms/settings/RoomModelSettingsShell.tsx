"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import type {
	RoomBaseModelSettings,
} from "@/components/(chat)/rooms/useRoomModelSettings";

type RoomModelSettingsShellProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	settings: RoomBaseModelSettings;
	modelChoices: Array<{
		id: string;
		label: string;
		orgId: string;
		orgName: string;
	}>;
	selectedModelId?: string | null;
	onModelChange: (modelId: string) => void;
	providerOptions: Array<{ id: string; name: string }>;
	supportedProvidersForModel?: string[];
	onUpdateBase: (partial: Partial<RoomBaseModelSettings>) => void;
	onReset: () => void;
	children: ReactNode;
};

export function RoomModelSettingsShell({
	open,
	onOpenChange,
	title,
	description,
	settings,
	modelChoices,
	selectedModelId,
	onModelChange,
	providerOptions,
	supportedProvidersForModel,
	onUpdateBase,
	onReset,
	children,
}: RoomModelSettingsShellProps) {
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const filteredProviderOptions = supportedProvidersForModel
		? providerOptions.filter((provider) =>
				supportedProvidersForModel.includes(provider.id),
			)
		: providerOptions;
	const groupedModelChoices = useMemo(() => {
		const grouped = new Map<string, typeof modelChoices>();
		for (const choice of modelChoices) {
			const key = choice.orgName || "Other";
			const existing = grouped.get(key);
			if (existing) {
				existing.push(choice);
			} else {
				grouped.set(key, [choice]);
			}
		}
		return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
	}, [modelChoices]);
	const selectedChoice =
		modelChoices.find((choice) => choice.id === selectedModelId) ?? null;

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[85vh] overflow-hidden p-4 sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>
					<div className="grid max-h-[72vh] gap-3 overflow-y-auto pr-1">
						<div className="grid gap-3">
							<div className="grid gap-1.5">
								<Label>Model</Label>
								<Button
									type="button"
									variant="outline"
									className="justify-start gap-2"
									disabled={modelChoices.length === 0}
									onClick={() => setModelPickerOpen(true)}
								>
									{selectedChoice ? (
										<>
											<Logo
												id={selectedChoice.orgId}
												alt={selectedChoice.orgName}
												width={16}
												height={16}
												className="shrink-0"
											/>
											<span className="truncate">{selectedChoice.label}</span>
										</>
									) : (
										<span className="truncate text-muted-foreground">
											Select model
										</span>
									)}
								</Button>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="room-display-name">Display name</Label>
								<Input
									id="room-display-name"
									value={settings.displayName}
									onChange={(event) =>
										onUpdateBase({ displayName: event.target.value })
									}
									placeholder="Optional model alias"
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>Provider</Label>
								<Select
									value={settings.providerId || "auto"}
									onValueChange={(value) => onUpdateBase({ providerId: value })}
								>
									<SelectTrigger>
										<SelectValue placeholder="Auto (Gateway)" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="auto">
											<div className="flex items-center gap-2">
												<span className="flex h-4 w-4 shrink-0 items-center justify-center">
													<svg
														viewBox="0 0 24 24"
														fill="none"
														className="h-4 w-4"
														stroke="currentColor"
														strokeWidth="2"
													>
														<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
													</svg>
												</span>
												Auto (Gateway)
											</div>
										</SelectItem>
										{filteredProviderOptions.map((provider) => (
											<SelectItem key={provider.id} value={provider.id}>
												<div className="flex items-center gap-2">
													<Logo
														id={provider.id}
														alt={provider.name}
														width={16}
														height={16}
														className="shrink-0"
													/>
													{provider.name}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
								<div>
									<p className="text-sm font-medium">Enabled</p>
									<p className="text-xs text-muted-foreground">
										Disable to prevent sends with this model.
									</p>
								</div>
								<Switch
									checked={settings.enabled}
									onCheckedChange={(checked) => onUpdateBase({ enabled: checked })}
								/>
							</div>
						</div>
						<Separator />
						{children}
						<div className="flex justify-end pt-1">
							<Button variant="outline" onClick={onReset}>
								Reset model settings
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
				<DialogContent className="overflow-hidden p-0 sm:max-w-lg">
					<DialogHeader className="sr-only">
						<DialogTitle>Select model</DialogTitle>
					</DialogHeader>
					<Command className="max-h-[70vh]">
						<CommandInput placeholder="Search models..." />
						<CommandList>
							<CommandEmpty>No models found.</CommandEmpty>
							{groupedModelChoices.map(([orgName, choices]) => (
								<CommandGroup key={orgName} heading={orgName}>
									{choices.map((choice) => (
										<CommandItem
											key={choice.id}
											value={`${choice.orgName} ${choice.label} ${choice.id}`}
											className="h-8"
											onSelect={() => {
												onModelChange(choice.id);
												setModelPickerOpen(false);
											}}
										>
											<div className="flex min-w-0 items-center gap-2">
												<Logo
													id={choice.orgId}
													alt={choice.orgName}
													width={14}
													height={14}
													className="shrink-0"
												/>
												<span className="truncate text-sm">{choice.label}</span>
												{selectedModelId === choice.id ? (
													<Badge
														variant="secondary"
														className="h-5 px-1.5 text-[10px]"
													>
														Selected
													</Badge>
												) : null}
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</DialogContent>
			</Dialog>
		</>
	);
}
