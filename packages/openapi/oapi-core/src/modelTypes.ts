import type { IRModel, IRSchema } from "./ir.js";

// The spec loader inlines every $ref, so a backend sees a named model's schema where it was referenced.
// This finds the model an inline object schema came from by exact structure (ties broken by the name
// tokens it shares with the model being rendered), so backends can name the type instead of falling
// back to a generic map.
export type ModelTypeResolver = (schema: IRSchema, excludeModelName?: string) => string | undefined;

export function createModelTypeResolver(models: IRModel[]): ModelTypeResolver {
	const namesBySchema = new Map<string, string[]>();
	const modelSchemas = new Map(models.map((model) => [model.name, model.schema]));
	const deprecatedCompatibilityModels = new Set(
		models
			.filter((model) => model.doc?.startsWith("Deprecated compatibility alias."))
			.map((model) => model.name),
	);
	for (const model of models) {
		if (model.schema.kind !== "object") continue;
		const signature = schemaSignature(model.schema, modelSchemas);
		const names = namesBySchema.get(signature) ?? [];
		names.push(model.name);
		namesBySchema.set(signature, names);
	}

	return (schema, excludeModelName) => {
		if (schema.kind !== "object") return undefined;
		const candidates = (namesBySchema.get(schemaSignature(schema, modelSchemas)) ?? []).filter(
			(name) => name !== excludeModelName
		);
		if (candidates.length === 1) return candidates[0];
		const canonicalCandidates = candidates.filter(
			(name) => !deprecatedCompatibilityModels.has(name),
		);
		if (canonicalCandidates.length === 1) return canonicalCandidates[0];
		if (!excludeModelName || candidates.length === 0) return undefined;

		const contextTokens = modelNameTokens(excludeModelName);
		const ranked = (canonicalCandidates.length > 0 ? canonicalCandidates : candidates)
			.map((name) => ({
				name,
				score: Array.from(modelNameTokens(name)).filter((token) => contextTokens.has(token)).length
			}))
			.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
		return ranked[0]?.score && ranked[0].score > (ranked[1]?.score ?? 0)
			? ranked[0].name
			: undefined;
	};
}

function modelNameTokens(name: string): Set<string> {
	const tokens: string[] = [];
	let tokenStart = 0;

	const isUpper = (character: string | undefined) =>
		character !== undefined && character >= "A" && character <= "Z";
	const isLower = (character: string | undefined) =>
		character !== undefined && character >= "a" && character <= "z";
	const isDigit = (character: string | undefined) =>
		character !== undefined && character >= "0" && character <= "9";
	const isAlphaNumeric = (character: string | undefined) =>
		isUpper(character) || isLower(character) || isDigit(character);
	const pushToken = (end: number) => {
		if (end > tokenStart) tokens.push(name.slice(tokenStart, end));
	};

	for (let index = 0; index < name.length; index += 1) {
		const current = name[index];
		const previous = name[index - 1];
		const next = name[index + 1];

		if (!isAlphaNumeric(current)) {
			pushToken(index);
			tokenStart = index + 1;
			continue;
		}

		if (
			index > tokenStart &&
			(isDigit(current) !== isDigit(previous) ||
				(isUpper(current) && isLower(previous)) ||
				(isUpper(current) && isUpper(previous) && isLower(next)))
		) {
			pushToken(index);
			tokenStart = index;
		}
	}

	pushToken(name.length);
	return new Set(tokens.length > 0 ? tokens : [name]);
}

function schemaSignature(schema: IRSchema, modelSchemas: Map<string, IRSchema>): string {
	return JSON.stringify(canonicalSchemaValue(schema, modelSchemas, new Set()));
}

function canonicalSchemaValue(
	value: unknown,
	modelSchemas: Map<string, IRSchema>,
	resolvingRefs: Set<string>
): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalSchemaValue(item, modelSchemas, resolvingRefs));
	}
	if (!value || typeof value !== "object") return value;

	const record = value as Record<string, unknown>;
	if (record.kind === "ref" && typeof record.name === "string") {
		const target = modelSchemas.get(record.name);
		if (target && !resolvingRefs.has(record.name)) {
			const nextRefs = new Set(resolvingRefs);
			nextRefs.add(record.name);
			return canonicalSchemaValue(target, modelSchemas, nextRefs);
		}
	}

	return Object.fromEntries(
		Object.entries(record)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, canonicalSchemaValue(item, modelSchemas, resolvingRefs)])
	);
}
