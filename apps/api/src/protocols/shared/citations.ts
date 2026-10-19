// Purpose: Convert citations between the shapes each text protocol documents.
// Why: Upstreams return citations as OpenAI Chat `url_citation` annotations, Responses
//      `url_citation` annotations, Claude `citations` on text blocks or Gemini grounding
//      metadata; each client surface must receive them in its own documented shape.
// How: IR text parts keep annotations in the flat Responses form for URL citations and
//      Claude's own objects for document citations. Each encoder converts from there.

const ANTHROPIC_CITATION_TYPES = new Set([
	"char_location",
	"page_location",
	"content_block_location",
	"web_search_result_location",
	"search_result_location",
]);

export type UrlCitation = {
	type: "url_citation";
	url: string;
	title?: string;
	start_index?: number;
	end_index?: number;
};

function finiteIndex(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function urlCitation(url: string, title: unknown, start: unknown, end: unknown): UrlCitation {
	const startIndex = finiteIndex(start);
	const endIndex = finiteIndex(end);
	const titleText = nonEmptyString(title);
	return {
		type: "url_citation",
		url,
		...(titleText ? { title: titleText } : {}),
		...(startIndex !== undefined ? { start_index: startIndex } : {}),
		...(endIndex !== undefined ? { end_index: endIndex } : {}),
	};
}

/**
 * The IR form of one citation from any protocol: URL citations become flat Responses
 * `url_citation` objects, Claude document citations stay as Claude sent them.
 * Returns null for shapes that carry nothing a client could use.
 */
export function toIRAnnotation(value: unknown): Record<string, any> | null {
	if (!value || typeof value !== "object") return null;
	const annotation = value as Record<string, any>;
	const type = String(annotation.type ?? "");
	if (type === "url_citation") {
		// Chat nests the fields under url_citation; Responses keeps them flat.
		const source = annotation.url_citation && typeof annotation.url_citation === "object"
			? annotation.url_citation
			: annotation;
		const url = nonEmptyString(source.url);
		return url ? urlCitation(url, source.title, source.start_index, source.end_index) : null;
	}
	if (ANTHROPIC_CITATION_TYPES.has(type)) return { ...annotation };
	if (type === "file_citation" || type === "container_file_citation" || type === "file_path") return { ...annotation };
	return null;
}

export function toIRAnnotations(values: unknown): Array<Record<string, any>> {
	if (!Array.isArray(values)) return [];
	return values.map(toIRAnnotation).filter((value): value is Record<string, any> => value !== null);
}

function asUrlCitation(annotation: Record<string, any>): UrlCitation | null {
	if (annotation.type === "url_citation") return toIRAnnotation(annotation) as UrlCitation | null;
	// Claude web citations carry a URL; document citations do not.
	const url = nonEmptyString(annotation.url);
	return url ? urlCitation(url, annotation.title, undefined, undefined) : null;
}

/** Responses `output_text.annotations`: URL and file citations, flat. */
export function toResponsesAnnotations(values: unknown): Array<Record<string, any>> {
	return toIRAnnotations(values).flatMap((annotation) => {
		if (annotation.type === "file_citation" || annotation.type === "container_file_citation" || annotation.type === "file_path") {
			return [annotation];
		}
		const citation = asUrlCitation(annotation);
		return citation ? [citation] : [];
	});
}

/** Chat `message.annotations`: URL citations with the fields nested under url_citation. */
export function toChatAnnotations(values: unknown): Array<Record<string, any>> {
	return toIRAnnotations(values).flatMap((annotation) => {
		const citation = asUrlCitation(annotation);
		if (!citation) return [];
		const { type, ...fields } = citation;
		return [{ type, url_citation: fields }];
	});
}

/**
 * Messages `citations` on a text block: Claude's own citations only.
 * A plain URL citation from Chat, Responses or Gemini has no contract-valid Messages
 * form. web_search_result_location requires Claude's opaque encrypted_index, which
 * Claude reads back on the next turn; search_result_location and the document
 * locations require indices into blocks of the request. Inventing those would give
 * clients citations that fail validation or break replay, so URL citations are left
 * off Messages responses. Chat and Responses clients still receive them.
 */
export function toAnthropicCitations(values: unknown): Array<Record<string, any>> {
	return toIRAnnotations(values).filter((annotation) => ANTHROPIC_CITATION_TYPES.has(String(annotation.type)));
}

/** URL citations from Gemini grounding metadata, with the cited span when Gemini gives one. */
export function geminiGroundingToAnnotations(candidate: unknown): UrlCitation[] {
	if (!candidate || typeof candidate !== "object") return [];
	const metadata = (candidate as any).groundingMetadata ?? (candidate as any).grounding_metadata;
	const chunks: any[] = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
	const supports: any[] = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
	const annotations: UrlCitation[] = [];
	const cited = new Set<number>();
	for (const support of supports) {
		const indices: unknown[] = Array.isArray(support?.groundingChunkIndices) ? support.groundingChunkIndices : [];
		for (const index of indices) {
			const web = typeof index === "number" ? chunks[index]?.web : undefined;
			const url = nonEmptyString(web?.uri);
			if (!url) continue;
			cited.add(index as number);
			annotations.push(urlCitation(url, web?.title, support?.segment?.startIndex, support?.segment?.endIndex));
		}
	}
	chunks.forEach((chunk, index) => {
		const url = nonEmptyString(chunk?.web?.uri);
		if (url && !cited.has(index)) annotations.push(urlCitation(url, chunk.web.title, undefined, undefined));
	});
	const citationMetadata = (candidate as any).citationMetadata ?? (candidate as any).citation_metadata;
	const sources: any[] = Array.isArray(citationMetadata?.citations)
		? citationMetadata.citations
		: (Array.isArray(citationMetadata?.citationSources) ? citationMetadata.citationSources : []);
	for (const source of sources) {
		const url = nonEmptyString(source?.uri);
		if (!url || annotations.some((annotation) => annotation.url === url)) continue;
		annotations.push(urlCitation(url, source?.title, source?.startIndex, source?.endIndex));
	}
	return annotations;
}
