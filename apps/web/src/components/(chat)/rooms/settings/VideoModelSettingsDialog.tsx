"use client";

import { useTranslations } from "next-intl";

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
	getVideoDurationOptions,
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
	onAutoAdjustParams?: (message: string) => void;
	onReset: () => void;
};

type VideoSettingsFormParams = Pick<VideoRoomParams, "size" | "duration">;

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
	onAutoAdjustParams,
	onReset,
}: VideoModelSettingsDialogProps) {
	const t = useTranslations("Product.chatRooms");
	const schema = getVideoModelSchema(selectedModelId ?? "");
	const normalizedSize = useMemo(
		() =>
			schema.sizeOptions.includes(settings.params.size)
				? settings.params.size
				: (schema.sizeOptions[0] ?? "1280x720"),
		[schema, settings.params.size],
	);
	const durationOptions = useMemo(
		() => getVideoDurationOptions(selectedModelId ?? "", normalizedSize),
		[normalizedSize, selectedModelId],
	);
	const normalizedParams = useMemo(() => {
		const duration = durationOptions.includes(settings.params.duration)
			? settings.params.duration
			: (durationOptions[0] ?? schema.durationOptions[0] ?? 5);
		return { size: normalizedSize, duration } satisfies VideoSettingsFormParams;
	}, [durationOptions, normalizedSize, schema.durationOptions, settings.params.duration]);

	useEffect(() => {
		const patch: Partial<VideoRoomParams> = {};
		const changes: string[] = [];
		if (settings.params.size !== normalizedParams.size) {
			patch.size = normalizedParams.size;
			changes.push(
				t("mediaStudio.resolutionChange", {
					from: settings.params.size,
					to: normalizedParams.size,
				}),
			);
		}
		if (settings.params.duration !== normalizedParams.duration) {
			patch.duration = normalizedParams.duration;
			changes.push(
				t("mediaStudio.durationChange", {
					from: settings.params.duration,
					to: normalizedParams.duration,
				}),
			);
		}
		if (Object.keys(patch).length > 0) {
			onUpdateParams(patch);
			if (onAutoAdjustParams && changes.length > 0) {
				onAutoAdjustParams(
					t("mediaStudio.unsupportedSettingsAdjusted", {
						changes: changes.join(", "),
					}),
				);
			}
		}
	}, [normalizedParams, onAutoAdjustParams, onUpdateParams, settings.params, t]);

	return (
		<RoomModelSettingsShell
			open={open}
			onOpenChange={onOpenChange}
			title={t("videoSettings")}
			description={t("videoSettingsDescription")}
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
					<Label>{t("resolution")}</Label>
					<Select
						value={normalizedParams.size}
						onValueChange={(value) => onUpdateParams({ size: value })}
					>
						<SelectTrigger>
							<SelectValue placeholder={t("selectResolution")} />
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
					<Label>{t("durationSeconds")}</Label>
					<Select
						value={String(normalizedParams.duration)}
						onValueChange={(value) =>
							onUpdateParams({ duration: Number(value) || durationOptions[0] || 5 })
						}
					>
						<SelectTrigger>
							<SelectValue placeholder={t("selectDuration")} />
						</SelectTrigger>
						<SelectContent>
							{durationOptions.map((duration) => (
								<SelectItem key={duration} value={String(duration)}>
									{duration}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</RoomModelSettingsShell>
	);
}
