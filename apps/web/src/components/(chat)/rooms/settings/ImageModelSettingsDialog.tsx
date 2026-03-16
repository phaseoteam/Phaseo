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
	getImageModelSchema,
	type ImageRoomParams,
} from "@/lib/chat/roomModelSettings";

type ImageModelSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	settings: RoomModelProfile<ImageRoomParams>;
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
	onUpdateParams: (partial: Partial<ImageRoomParams>) => void;
	onReset: () => void;
};

export function ImageModelSettingsDialog({
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
}: ImageModelSettingsDialogProps) {
	const schema = getImageModelSchema(selectedModelId ?? "");

	return (
		<RoomModelSettingsShell
			open={open}
			onOpenChange={onOpenChange}
			title="Image model settings"
			description="Configure image generation options for the selected model."
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
					<Label>Quality</Label>
					<Select
						value={settings.params.quality}
						onValueChange={(value) => onUpdateParams({ quality: value })}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select quality" />
						</SelectTrigger>
						<SelectContent>
							{schema.qualityOptions.map((quality) => (
								<SelectItem key={quality} value={quality}>
									{quality}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{schema.styleOptions.length > 0 ? (
					<div className="grid gap-1.5">
						<Label>Style</Label>
						<Select
							value={settings.params.style}
							onValueChange={(value) => onUpdateParams({ style: value })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select style" />
							</SelectTrigger>
							<SelectContent>
								{schema.styleOptions.map((style) => (
									<SelectItem key={style} value={style}>
										{style}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}
				{schema.supportsBackground ? (
					<div className="grid gap-1.5">
						<Label>Background</Label>
						<Select
							value={settings.params.background}
							onValueChange={(value) => onUpdateParams({ background: value })}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select background mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">auto</SelectItem>
								<SelectItem value="opaque">opaque</SelectItem>
								<SelectItem value="transparent">transparent</SelectItem>
							</SelectContent>
						</Select>
					</div>
				) : null}
				<div className="grid gap-1.5">
					<Label htmlFor="image-count">Image count</Label>
					<Input
						id="image-count"
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
