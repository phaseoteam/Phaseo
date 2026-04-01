"use client";

import { useEffect, useMemo } from "react";
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

type ImageSettingsFormParams = Pick<ImageRoomParams, "size" | "quality" | "style">;

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
	const isGoogleImageSchema = schema.variant.startsWith("google-");
	const sizeLabel = isGoogleImageSchema ? "Aspect ratio" : "Resolution";
	const sizePlaceholder = isGoogleImageSchema
		? "Select aspect ratio"
		: "Select resolution";
	const qualityLabel = isGoogleImageSchema ? "Image size" : "Quality";
	const qualityPlaceholder = isGoogleImageSchema
		? "Select image size"
		: "Select quality";
	const normalizedParams = useMemo(() => {
		const size = schema.sizeOptions.includes(settings.params.size)
			? settings.params.size
			: (schema.sizeOptions[0] ?? "1024x1024");
		const quality = schema.qualityOptions.includes(settings.params.quality)
			? settings.params.quality
			: (schema.qualityOptions[0] ?? "standard");
		const style =
			schema.styleOptions.length === 0
				? ""
				: schema.styleOptions.includes(settings.params.style)
					? settings.params.style
					: (schema.styleOptions[0] ?? "");
		return { size, quality, style } satisfies ImageSettingsFormParams;
	}, [schema, settings.params]);

	useEffect(() => {
		const patch: Partial<ImageRoomParams> = {};
		if (settings.params.size !== normalizedParams.size) {
			patch.size = normalizedParams.size;
		}
		if (settings.params.quality !== normalizedParams.quality) {
			patch.quality = normalizedParams.quality;
		}
		if (settings.params.style !== normalizedParams.style) {
			patch.style = normalizedParams.style;
		}
		if (Object.keys(patch).length > 0) {
			onUpdateParams(patch);
		}
	}, [normalizedParams, onUpdateParams, settings.params]);

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
					<Label>{sizeLabel}</Label>
					<Select
						value={normalizedParams.size}
						onValueChange={(value) => onUpdateParams({ size: value })}
					>
						<SelectTrigger>
							<SelectValue placeholder={sizePlaceholder} />
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
					<Label>{qualityLabel}</Label>
					<Select
						value={normalizedParams.quality}
						onValueChange={(value) => onUpdateParams({ quality: value })}
					>
						<SelectTrigger>
							<SelectValue placeholder={qualityPlaceholder} />
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
							value={normalizedParams.style}
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
			</div>
		</RoomModelSettingsShell>
	);
}
