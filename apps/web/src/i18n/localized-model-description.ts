import { getExplicitModelDescription, type ModelDescriptionSource } from "@/lib/models/modelDescription";

type Translator = (key: never, values?: never) => string;
const modalityKeys: Record<string, string> = {
	text: "modalityText", image: "modalityImage", video: "modalityVideo", audio: "modalityAudio",
	audio_stt: "modalityTranscription", audio_tts: "modalitySpeech", audio_music: "modalityMusic",
	embedding: "modalityEmbeddings", embeddings: "modalityEmbeddings", moderation: "modalityModeration",
	moderations: "modalityModeration", decisions: "modalityDecisions", decision: "modalityDecisions",
};

export function resolveLocalizedModelDescription(model: ModelDescriptionSource, locale: string, t: Translator): string {
	const explicit = getExplicitModelDescription(model);
	if (explicit) return explicit;
	const name = model.name?.trim() || model.model_id;
	const organisation = model.organisation?.name?.trim() || model.organisation_id?.trim() || t("Common.ui.publicModelCopy.modelCreator" as never);
	const status = (model.status ?? "").trim().toLowerCase().replace(/[_-]/g, " ");
	const statusKeys: Record<string, string> = { rumoured: "rumoured", announced: "announced", preview: "preview", "limited access": "limitedAccess", withheld: "withheld", deprecated: "deprecated", retired: "retired" };
	const statusLabel = t(`Catalogue.models.detail.faqContent.statuses.${statusKeys[status] ?? "available"}` as never);
	const intro = t("Catalogue.models.detail.faqContent.answers.modelPrefix" as never, { model: name, status: statusLabel } as never) + ` ${organisation}.`;
	const localizeModalities = (value: string | string[] | null | undefined) => {
		const values = Array.isArray(value) ? value : (value ?? "").split(",");
		return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).map((item) => {
			const normalized = item.toLowerCase().replace(/[\s-]+/g, "_");
			const key = modalityKeys[normalized];
			if (key) return t(`Catalogue.modelDetail.metadata.${key}` as never);
			if (["file", "code", "vision", "speech", "multimodal", "rerank", "structured"].includes(normalized)) return t(`Common.ui.modelCreation.modalities.${normalized}` as never);
			return item;
		});
	};
	const inputs = localizeModalities(model.input_types);
	const outputs = localizeModalities(model.output_types);
	const list = (values: string[]) => new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(values);
	if (inputs.length && outputs.length) return intro + " " + t("Common.ui.publicModelCopy.inputOutputDescription" as never, { inputs: list(inputs), outputs: list(outputs) } as never);
	if (inputs.length) return intro + " " + t("Common.ui.publicModelCopy.inputDescription" as never, { inputs: list(inputs) } as never);
	if (outputs.length) return intro + " " + t("Common.ui.publicModelCopy.outputDescription" as never, { outputs: list(outputs) } as never);
	return intro;
}
