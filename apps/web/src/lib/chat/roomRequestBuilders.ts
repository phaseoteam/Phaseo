type ModerationInputItem =
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "image_url";
			image_url: {
				url: string;
			};
	  };

export function buildModerationInput(args: {
	text?: string;
	imageUrls?: string[];
}): string | ModerationInputItem[] {
	const trimmedText = (args.text ?? "").trim();
	const images = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean);

	if (!images.length) {
		return trimmedText;
	}

	const input: ModerationInputItem[] = [];
	if (trimmedText) {
		input.push({ type: "text", text: trimmedText });
	}
	for (const imageUrl of images) {
		input.push({
			type: "image_url",
			image_url: { url: imageUrl },
		});
	}
	return input;
}

export type EmbeddingContentPart =
	| { type: "input_text"; text: string }
	| { type: "input_image"; image_url: string | { url: string } }
	| { type: "input_audio"; input_audio: { data?: string; url?: string; format?: string } }
	| { type: "input_video"; url: string | { url: string } };

export function splitEmbeddingTextInput(text: string): string[] {
	return text
		.split(/\r?\n/g)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function buildEmbeddingsMultimodalInput(parts: EmbeddingContentPart[]) {
	return {
		content: parts,
	};
}

export function extractGenerationUrls(payload: any): string[] {
	const urls: string[] = [];
	const addUrl = (value: unknown) => {
		if (typeof value !== "string") return;
		const trimmed = value.trim();
		if (!trimmed) return;
		urls.push(trimmed);
	};

	addUrl(payload?.url);
	addUrl(payload?.video_url);
	addUrl(payload?.audio_url);
	addUrl(payload?.content_url);
	addUrl(payload?.result_url);
	addUrl(payload?.video?.url);
	addUrl(payload?.result?.url);

	if (Array.isArray(payload?.data)) {
		for (const entry of payload.data) {
			addUrl(entry?.url);
			addUrl(entry?.uri);
			addUrl(entry?.video_url);
			addUrl(entry?.content_url);
			addUrl(entry?.result_url);
			addUrl(entry?.video?.url);
			if (typeof entry?.b64_json === "string" && entry.b64_json.trim()) {
				addUrl(`data:image/png;base64,${entry.b64_json}`);
			}
		}
	}
	if (Array.isArray(payload?.output)) {
		for (const entry of payload.output) {
			addUrl(entry?.url);
			addUrl(entry?.uri);
			addUrl(entry?.video_url);
			addUrl(entry?.content_url);
			addUrl(entry?.result_url);
			addUrl(entry?.video?.url);
		}
	}
	if (Array.isArray(payload?.result?.output)) {
		for (const entry of payload.result.output) {
			addUrl(entry?.url);
			addUrl(entry?.uri);
			addUrl(entry?.video_url);
			addUrl(entry?.content_url);
			addUrl(entry?.result_url);
			addUrl(entry?.video?.url);
		}
	}
	if (
		Array.isArray(
			payload?.response?.generateVideoResponse?.generatedSamples,
		)
	) {
		for (const entry of payload.response.generateVideoResponse.generatedSamples) {
			addUrl(entry?.video?.uri);
			addUrl(entry?.video?.url);
		}
	}

	return Array.from(new Set(urls));
}

export type NormalizedModerationResult = {
	flagged: boolean;
	categories: Record<string, boolean>;
	categoryScores: Record<string, number>;
	categoryAppliedInputTypes: Record<string, Array<"text" | "image">>;
	raw: unknown;
};

export function normalizeModerationResult(
	payload: any,
): NormalizedModerationResult | null {
	const result = payload?.results?.[0];
	if (!result || typeof result !== "object") return null;

	const categories =
		result.categories && typeof result.categories === "object"
			? (result.categories as Record<string, boolean>)
			: {};
	const categoryScores =
		result.category_scores && typeof result.category_scores === "object"
			? (result.category_scores as Record<string, number>)
			: {};
	const categoryAppliedInputTypes =
		result.category_applied_input_types &&
		typeof result.category_applied_input_types === "object"
			? Object.fromEntries(
					Object.entries(
						result.category_applied_input_types as Record<string, unknown>,
					).map(([category, value]) => [
						category,
						Array.isArray(value)
							? value.filter(
									(type): type is "text" | "image" =>
										type === "text" || type === "image",
								)
							: [],
					]),
				)
			: {};
	return {
		flagged: Boolean(result.flagged),
		categories,
		categoryScores,
		categoryAppliedInputTypes,
		raw: result,
	};
}

export function extractEmbeddingVectors(payload: any): number[][] {
	const vectors: number[][] = [];
	if (!Array.isArray(payload?.data)) return vectors;
	for (const entry of payload.data) {
		if (!Array.isArray(entry?.embedding)) continue;
		const vector = entry.embedding
			.map((value: unknown) =>
				typeof value === "number" && Number.isFinite(value) ? value : 0,
			)
			.filter((value: number) => Number.isFinite(value));
		if (vector.length > 0) {
			vectors.push(vector);
		}
	}
	return vectors;
}

function dot(a: number[], b: number[]): number {
	let total = 0;
	for (let i = 0; i < a.length; i += 1) {
		total += a[i] * b[i];
	}
	return total;
}

function normalizeVector(vector: number[]): number[] {
	const mag = Math.sqrt(dot(vector, vector));
	if (!Number.isFinite(mag) || mag <= 0) {
		return vector.map(() => 0);
	}
	return vector.map((value) => value / mag);
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
	return matrix.map((row) => dot(row, vector));
}

function powerIteration(matrix: number[][], iterations = 30): number[] {
	const size = matrix.length;
	let vector: number[] = Array.from(
		{ length: size },
		(_, index) => (index === 0 ? 1 : 0),
	);
	for (let i = 0; i < iterations; i += 1) {
		vector = normalizeVector(multiplyMatrixVector(matrix, vector));
	}
	return vector;
}

function transpose(matrix: number[][]): number[][] {
	return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
	const bT = transpose(b);
	return a.map((row) => bT.map((col) => dot(row, col)));
}

function centerVectors(vectors: number[][]): number[][] {
	const width = vectors[0]?.length ?? 0;
	const means = Array.from({ length: width }, (_, dimension) => {
		const total = vectors.reduce((sum, vector) => sum + vector[dimension], 0);
		return total / vectors.length;
	});
	return vectors.map((vector) =>
		vector.map((value, dimension) => value - means[dimension]),
	);
}

export function projectVectorsPca2d(vectors: number[][]): Array<{ x: number; y: number }> {
	if (!vectors.length) return [];
	if (vectors.length === 1) return [{ x: 0, y: 0 }];
	const centered = centerVectors(vectors);
	const xTx = multiplyMatrices(transpose(centered), centered);
	const pc1 = powerIteration(xTx);
	const lambda1 = dot(pc1, multiplyMatrixVector(xTx, pc1));
	const deflated = xTx.map((row, i) =>
		row.map((value, j) => value - lambda1 * pc1[i] * pc1[j]),
	);
	const pc2 = powerIteration(deflated);

	return centered.map((vector) => ({
		x: dot(vector, pc1),
		y: dot(vector, pc2),
	}));
}
