"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	RoomModelSettingsShell,
} from "@/components/(chat)/rooms/settings/RoomModelSettingsShell";
import type {
	RoomBaseModelSettings,
	RoomModelProfile,
} from "@/components/(chat)/rooms/useRoomModelSettings";
import {
	CHAT_AUDIO_SPEECH_FORMAT,
	getAudioModelSchema,
	type AudioModeSupport,
	type AudioRoomParams,
	type CapabilityParamsById,
} from "@/lib/chat/roomModelSettings";

type AudioModelSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	settings: RoomModelProfile<AudioRoomParams>;
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
	capabilityParamsById?: CapabilityParamsById;
	onUpdateBase: (partial: Partial<RoomBaseModelSettings>) => void;
	onUpdateParams: (partial: Partial<AudioRoomParams>) => void;
	onReset: () => void;
	modeSupport: AudioModeSupport;
};

export function AudioModelSettingsDialog({
	open,
	onOpenChange,
	settings,
	modelChoices,
	selectedModelId,
	onModelChange,
	providerOptions,
	supportedProvidersForModel,
	capabilityParamsById,
	onUpdateBase,
	onUpdateParams,
	onReset,
	modeSupport,
}: AudioModelSettingsDialogProps) {
	const t = useTranslations("Product.chatRooms");
	const schema = getAudioModelSchema(selectedModelId ?? "", capabilityParamsById);
	const speechVoice = schema.voiceOptions.includes(settings.params.speechVoice)
		? settings.params.speechVoice
		: (schema.voiceOptions[0] ?? "");
	const transcriptionResponseFormat = settings.params.transcriptionResponseFormat || "json";
	const translationResponseFormat = settings.params.translationResponseFormat || "json";

	return (
		<RoomModelSettingsShell
			open={open}
			onOpenChange={onOpenChange}
			title={t("audioSettings")}
			description={t("audioSettingsDescription")}
			settings={settings}
			modelChoices={modelChoices}
			selectedModelId={selectedModelId}
			onModelChange={onModelChange}
			providerOptions={providerOptions}
			supportedProvidersForModel={supportedProvidersForModel}
			onUpdateBase={onUpdateBase}
			onReset={onReset}
		>
			<div className="grid gap-4">
				{modeSupport.speech ? (
					<div className="space-y-2">
						<p className="text-sm font-medium">{t("speechDefaults")}</p>
						<div className="grid gap-2">
							<div className="grid gap-1.5">
								<Label>{t("voice")}</Label>
								<Select
									value={speechVoice}
									onValueChange={(value) => onUpdateParams({ speechVoice: value })}
								>
									<SelectTrigger>
										<SelectValue placeholder={t("selectVoice")} />
									</SelectTrigger>
									<SelectContent>
										{schema.voiceOptions.map((voice) => (
											<SelectItem key={voice} value={voice}>
												{voice}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-1.5">
								<Label>{t("format")}</Label>
								<div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
									{t("audioFormatFixedInChat", { format: CHAT_AUDIO_SPEECH_FORMAT })}
								</div>
							</div>
							{schema.supportsSpeechSpeed ? (
								<div className="grid gap-1.5">
									<Label htmlFor="speech-speed">{t("speed")}</Label>
									<Input
										id="speech-speed"
										type="number"
										min={0.25}
										max={4}
										step={0.05}
										value={settings.params.speechSpeed}
										onChange={(event) =>
											onUpdateParams({
												speechSpeed: Math.max(
													0.25,
													Math.min(4, Number(event.target.value) || 1),
												),
											})
										}
									/>
								</div>
							) : null}
						</div>
					</div>
				) : null}
				{modeSupport.transcription ? (
					<div className="space-y-2">
						<p className="text-sm font-medium">{t("transcriptionDefaults")}</p>
						<div className="grid gap-2">
							{schema.supportsLanguageHint ? (
								<div className="grid gap-1.5">
									<Label htmlFor="transcription-language">{t("languageHint")}</Label>
									<Input
										id="transcription-language"
										value={settings.params.transcriptionLanguage}
										onChange={(event) =>
											onUpdateParams({
												transcriptionLanguage: event.target.value,
											})
										}
										placeholder="en"
									/>
								</div>
							) : null}
							<div className="grid gap-1.5">
								<Label htmlFor="transcription-prompt">{t("prompt")}</Label>
								<Textarea
									id="transcription-prompt"
									rows={2}
									value={settings.params.transcriptionPrompt}
									onChange={(event) =>
										onUpdateParams({
											transcriptionPrompt: event.target.value,
										})
									}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>{t("responseFormat")}</Label>
								<Select
									value={transcriptionResponseFormat}
									onValueChange={(value) =>
										onUpdateParams({ transcriptionResponseFormat: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="json">json</SelectItem>
										<SelectItem value="text">text</SelectItem>
										<SelectItem value="srt">srt</SelectItem>
										<SelectItem value="vtt">vtt</SelectItem>
										<SelectItem value="verbose_json">verbose_json</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
				) : null}
				{modeSupport.translation ? (
					<div className="space-y-2">
						<p className="text-sm font-medium">{t("translationDefaults")}</p>
						<div className="grid gap-2">
							<div className="grid gap-1.5">
								<Label htmlFor="translation-prompt">{t("prompt")}</Label>
								<Textarea
									id="translation-prompt"
									rows={2}
									value={settings.params.translationPrompt}
									onChange={(event) =>
										onUpdateParams({ translationPrompt: event.target.value })
									}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>{t("responseFormat")}</Label>
								<Select
									value={translationResponseFormat}
									onValueChange={(value) =>
										onUpdateParams({ translationResponseFormat: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="json">json</SelectItem>
										<SelectItem value="text">text</SelectItem>
										<SelectItem value="srt">srt</SelectItem>
										<SelectItem value="vtt">vtt</SelectItem>
										<SelectItem value="verbose_json">verbose_json</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
				) : null}
			</div>
		</RoomModelSettingsShell>
	);
}
