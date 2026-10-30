import type { RawEvent } from "@/lib/fetchers/models/timelineTypes";

type ModelLinkLike = {
	url?: string | null;
	platform?: string | null;
	kind?: string | null;
};

type LicenseModel = {
	license_url?: string | null;
	model_links?: ModelLinkLike[] | null;
};

export type LineageModelLink = {
	modelId: string;
	modelName: string;
};

export type ModelLineageLinks = {
	previous: LineageModelLink | null;
	next: LineageModelLink | null;
};

const LINEAGE_ACRONYMS: Record<string, string> = {
	ai: "AI",
	gpt: "GPT",
	glm: "GLM",
	llm: "LLM",
	ocr: "OCR",
	stt: "STT",
	tts: "TTS",
};

function getLineageFallbackName(modelId: string, genericFallback: string) {
	const slug = modelId.split("/").at(-1)?.trim();
	if (!slug) return genericFallback;

	const withoutDate = slug.replace(/-\d{4}-\d{2}-\d{2}$/, "");
	const withVersion = withoutDate.replace(/-(\d+)-(\d+)$/, "-$1.$2");
	const displayName = withVersion
		.split(/[-_]+/)
		.filter(Boolean)
		.map((part) => {
			const normalized = part.toLowerCase();
			return (
				LINEAGE_ACRONYMS[normalized] ??
				`${part.charAt(0).toUpperCase()}${part.slice(1)}`
			);
		})
		.join(" ");

	return displayName || genericFallback;
}

function normalizeLinkKind(link: ModelLinkLike) {
	return (link.kind ?? link.platform ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
}

export function isLicenseModelLink(link: ModelLinkLike) {
	const kind = normalizeLinkKind(link);
	return kind === "license" || kind === "licence" || kind === "license_text" || kind === "licence_text";
}

export function getGenericModelLinks<T extends ModelLinkLike>(links: T[]) {
	return links.filter((link) => !isLicenseModelLink(link));
}

export function getModelLicenseUrl(model: LicenseModel) {
	const directUrl = model.license_url?.trim();
	if (directUrl) return directUrl;

	const licenseLink = model.model_links?.find(
		(link) => isLicenseModelLink(link) && Boolean(link.url?.trim()),
	);
	return licenseLink?.url?.trim() || null;
}

export function getModelLineageLinks(
	events: RawEvent[] | null | undefined,
	previousModelId?: string | null,
): ModelLineageLinks {
	const previousEvent = events?.find(
		(event) => event.eventType === "PreviousModel" && event.modelId,
	);
	const previousId = previousEvent?.modelId ?? previousModelId?.trim() ?? "";
	const previous = previousId
		? {
				modelId: previousId,
				modelName: previousEvent?.modelName?.trim() || previousId,
			}
		: null;

	const nextEvent = events
		?.filter((event) => event.eventType === "FutureModel" && event.modelId)
		.toSorted((left, right) => left.date.localeCompare(right.date))[0];
	const next = nextEvent?.modelId
		? {
				modelId: nextEvent.modelId,
				modelName: nextEvent.modelName?.trim() || nextEvent.modelId,
			}
		: null;

	return { previous, next };
}

export async function resolveModelLineageNames(
	lineage: ModelLineageLinks,
	resolveName: (modelId: string) => Promise<string | null | undefined>,
): Promise<ModelLineageLinks> {
	const resolveLink = async (
		link: LineageModelLink | null,
		fallbackName: string,
	) => {
		if (!link || link.modelName !== link.modelId) return link;
		const resolvedName = (await resolveName(link.modelId))?.trim();
		return {
			...link,
			modelName:
				resolvedName || getLineageFallbackName(link.modelId, fallbackName),
		};
	};

	const [previous, next] = await Promise.all([
		resolveLink(lineage.previous, "Previous model"),
		resolveLink(lineage.next, "Next model"),
	]);

	return { previous, next };
}
