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
	getEmbeddingsModelSchema,
	type EmbeddingsRoomParams,
} from "@/lib/chat/roomModelSettings";

type EmbeddingsModelSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	settings: RoomModelProfile<EmbeddingsRoomParams>;
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
	onUpdateParams: (partial: Partial<EmbeddingsRoomParams>) => void;
	onReset: () => void;
};

export function EmbeddingsModelSettingsDialog({
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
}: EmbeddingsModelSettingsDialogProps) {
	const schema = getEmbeddingsModelSchema(selectedModelId ?? "");

	return (
		<RoomModelSettingsShell
			open={open}
			onOpenChange={onOpenChange}
			title="Embeddings model settings"
			description="Configure vector output settings for this embeddings model."
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
					<Label>Encoding format</Label>
					<Select
						value={settings.params.encodingFormat}
						onValueChange={(value) =>
							onUpdateParams({
								encodingFormat: value as EmbeddingsRoomParams["encodingFormat"],
							})
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="float">float</SelectItem>
							<SelectItem value="base64">base64</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{schema.supportsDimensions ? (
					<div className="grid gap-1.5">
						<Label htmlFor="embedding-dimensions">
							Dimensions (max {schema.maxDimensions})
						</Label>
						<Input
							id="embedding-dimensions"
							type="number"
							min={1}
							max={schema.maxDimensions}
							value={settings.params.dimensions ?? ""}
							onChange={(event) => {
								const raw = event.target.value.trim();
								if (!raw) {
									onUpdateParams({ dimensions: null });
									return;
								}
								onUpdateParams({
									dimensions: Math.max(
										1,
										Math.min(schema.maxDimensions, Math.floor(Number(raw) || 1)),
									),
								});
							}}
						/>
					</div>
				) : (
					<p className="text-xs text-muted-foreground">
						This model does not expose configurable output dimensions.
					</p>
				)}
			</div>
		</RoomModelSettingsShell>
	);
}
