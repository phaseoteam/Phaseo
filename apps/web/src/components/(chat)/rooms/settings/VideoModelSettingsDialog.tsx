"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	RoomModelSettingsShell,
} from "@/components/(chat)/rooms/settings/RoomModelSettingsShell";
import type {
	RoomBaseModelSettings,
	RoomModelProfile,
} from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	getVideoModelSchema,
	type VideoRoomParams,
} from "@/lib/chat/roomModelSettings";

type VideoModelSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	settings: RoomModelProfile<VideoRoomParams>;
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
	onUpdateParams: (partial: Partial<VideoRoomParams>) => void;
	onReset: () => void;
};

export function VideoModelSettingsDialog({
	open,
	onOpenChange,
	settings,
	modelChoices,
	selectedModelId,
	onModelChange,
	providerOptions,
	supportedProvidersForModel,
	onUpdateBase,
	onUpdateParams,
	onReset,
}: VideoModelSettingsDialogProps) {
	const schema = getVideoModelSchema(selectedModelId ?? "");

	return (
		<RoomModelSettingsShell
			open={open}
			onOpenChange={onOpenChange}
			title="Video model settings"
			description="Configure video generation options for the selected model."
			settings={settings}
			modelChoices={modelChoices}
			selectedModelId={selectedModelId}
			onModelChange={onModelChange}
			providerOptions={providerOptions}
			supportedProvidersForModel={supportedProvidersForModel}
			onUpdateBase={onUpdateBase}
			onReset={onReset}
		>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<Label>Resolution</Label>
					<Select
						value={settings.params.size}
						onValueChange={(value) => onUpdateParams({ size: value })}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select resolution" />
						</SelectTrigger>
						<SelectContent>
							{schema.sizeOptions.map((size) => (
								<SelectItem key={size} value={size}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-1.5">
					<Label>Duration (seconds)</Label>
					<Select
						value={String(settings.params.duration)}
						onValueChange={(value) =>
							onUpdateParams({ duration: Number(value) || schema.durationOptions[0] || 5 })
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select duration" />
						</SelectTrigger>
						<SelectContent>
							{schema.durationOptions.map((duration) => (
								<SelectItem key={duration} value={String(duration)}>
									{duration}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="video-count">Video count</Label>
					<Input
						id="video-count"
						type="number"
						min={1}
						max={schema.maxCount}
						value={settings.params.n}
						onChange={(event) =>
							onUpdateParams({
								n: Math.max(
									1,
									Math.min(
										schema.maxCount,
										Math.floor(Number(event.target.value) || 1),
									),
								),
							})
						}
					/>
				</div>
			</div>
		</RoomModelSettingsShell>
	);
}
