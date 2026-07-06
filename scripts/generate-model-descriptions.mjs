import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const MODELS_ROOT = path.join(
	REPO_ROOT,
	"packages/data/catalog/src/data/models",
);
const ORGANISATIONS_ROOT = path.join(
	REPO_ROOT,
	"packages/data/catalog/src/data/organisations",
);
const OPENROUTER_MODELS_URL =
	"https://openrouter.ai/api/v1/models?output_modalities=all";
const LEGACY_PHASEO_FALLBACK =
	"On Phaseo you can compare providers, pricing, benchmarks, routing support, and availability for this model.";

function normalizeWhitespace(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeAscii(value) {
	return normalizeWhitespace(value)
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[–—]/g, "-")
		.replace(/\u00A0/g, " ");
}

function ensureSentence(value) {
	const normalized = normalizeWhitespace(value);
	if (!normalized) return "";
	return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function trimSentenceBoundary(value, maxLength = 280) {
	const normalized = normalizeWhitespace(value);
	if (normalized.length <= maxLength) return normalized;

	const sentences =
		normalized.match(/[^.!?]+[.!?]+(?:\s+|$)/g)?.map((item) => item.trim()) ?? [];
	let combined = "";
	for (const sentence of sentences) {
		const candidate = combined ? `${combined} ${sentence}` : sentence;
		if (candidate.length > maxLength) break;
		combined = candidate;
	}
	if (combined) return combined;

	const slice = normalized.slice(0, Math.max(0, maxLength - 1));
	const boundary = slice.lastIndexOf(" ");
	const safe = boundary >= Math.floor(maxLength * 0.65) ? slice.slice(0, boundary) : slice;
	return ensureSentence(safe);
}

function parseTypes(value) {
	if (Array.isArray(value)) {
		return Array.from(
			new Set(value.map((item) => normalizeModality(item)).filter(Boolean)),
		);
	}
	if (typeof value === "string") {
		return Array.from(
			new Set(
				value
					.split(",")
					.map((item) => normalizeModality(item))
					.filter(Boolean),
			),
		);
	}
	return [];
}

function normalizeModality(value) {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	if (!normalized) return "";
	if (normalized.includes("embedding")) return "embeddings";
	if (normalized.includes("moderation")) return "moderations";
	if (normalized.includes("music")) return "music";
	if (
		normalized.includes("transcrib") ||
		normalized.includes("speech_to_text") ||
		normalized === "stt"
	) {
		return "audio_stt";
	}
	if (
		normalized.includes("text_to_speech") ||
		normalized.includes("speech_synth") ||
		normalized.includes("tts") ||
		normalized.includes("voice")
	) {
		return "audio_tts";
	}
	if (normalized.includes("video")) return "video";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("audio")) return "audio";
	if (normalized === "text") return "text";
	return normalized;
}

function formatModality(value) {
	switch (value) {
		case "audio_stt":
			return "audio";
		case "audio_tts":
			return "text";
		case "music":
			return "audio";
		case "embeddings":
			return "embeddings";
		case "moderations":
			return "moderation";
		default:
			return value.replace(/_/g, " ");
	}
}

function joinNaturalList(values) {
	if (values.length === 0) return "";
	if (values.length === 1) return values[0];
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function withArticle(phrase) {
	return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function formatContextLength(value) {
	if (!Number.isFinite(value) || value <= 0) return null;
	if (value >= 1000000) {
		const millions = value / 1000000;
		return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
	}
	if (value >= 1000) {
		const thousands = value / 1000;
		return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
	}
	return String(value);
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listDirectories(root) {
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

function listModelFiles(root) {
	const files = [];
	for (const org of listDirectories(root)) {
		const orgRoot = path.join(root, org);
		for (const modelDir of listDirectories(orgRoot)) {
			const filePath = path.join(orgRoot, modelDir, "model.json");
			if (fs.existsSync(filePath)) {
				files.push(filePath);
			}
		}
	}
	return files.sort();
}

function loadOrganisationNames() {
	const map = new Map();
	for (const org of listDirectories(ORGANISATIONS_ROOT)) {
		const filePath = path.join(ORGANISATIONS_ROOT, org, "organisation.json");
		if (!fs.existsSync(filePath)) continue;
		const data = readJson(filePath);
		const organisationId = normalizeWhitespace(data.organisation_id);
		const name = normalizeWhitespace(data.name);
		if (organisationId && name) {
			map.set(organisationId, name);
		}
	}
	return map;
}

function getDetailValue(details, name) {
	if (!Array.isArray(details)) return null;
	for (const detail of details) {
		if (normalizeWhitespace(detail?.name).toLowerCase() !== name.toLowerCase()) continue;
		return detail?.value ?? null;
	}
	return null;
}

function parseContextLength(details) {
	const raw = getDetailValue(details, "input_context_length");
	const parsed =
		typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
	return Number.isFinite(parsed) ? parsed : null;
}

function tokenize(value) {
	return normalizeWhitespace(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.map((item) => item.trim())
		.filter(Boolean);
}

function normalizedId(value) {
	const raw = normalizeWhitespace(value).toLowerCase();
	if (!raw.includes("/")) return raw;
	const [org, slug] = raw.split("/", 2);
	const normalizedSlug = slug
		.replace(/-\d{4}-\d{2}-\d{2}$/, "")
		.replace(/\.(?=\d)/g, "-")
		.replace(/[._]/g, "-")
		.replace(/-+/g, "-")
		.replace(/-preview-\d{4}-\d{2}-\d{2}$/, "-preview")
		.replace(/-beta-\d{4}-\d{2}-\d{2}$/, "-beta");
	return `${org}/${normalizedSlug}`;
}

function semanticTokens(value) {
	return tokenize(value).filter(
		(token) =>
			!/^\d+$/.test(token) &&
			!/^\d{4}$/.test(token) &&
			!/^\d+b$/.test(token) &&
			token !== "preview" &&
			token !== "beta" &&
			token !== "experimental" &&
			token !== "exp",
	);
}

function inferModelCategory(meta) {
	if (meta.isReranker) return "reranker";
	if (meta.isEmbedding) return "embedding";
	if (meta.isModeration) return "moderation";
	if (meta.isTranslation) return "translation";
	if (meta.isTts) return "tts";
	if (meta.isTranscription) return "transcription";
	if (meta.isMusic) return "music";
	if (meta.isOcr) return "ocr";
	if (meta.isVideo) return "video";
	if (meta.isImage) return "image";
	if (meta.isSearch) return "search";
	if (meta.isVision) return "vision";
	if (meta.isCoding && meta.isReasoning) return "reasoning_code";
	if (meta.isCoding) return "code";
	if (meta.isReasoning) return "reasoning";
	return "text";
}

function buildMeta(model, organisationNames) {
	const modelId = normalizeWhitespace(model.model_id);
	const apiModelId = normalizeWhitespace(model.api_model_id) || modelId;
	const name = normalizeWhitespace(model.name) || modelId;
	const organisationId = normalizeWhitespace(model.organisation_id);
	const organisationName =
		organisationNames.get(organisationId) || organisationId || "the model developer";
	const inputTypes = parseTypes(model.input_types);
	const outputTypes = parseTypes(model.output_types);
	const rawTokens = new Set([
		...tokenize(modelId),
		...tokenize(apiModelId),
		...tokenize(name),
		...inputTypes.flatMap((item) => tokenize(item)),
		...outputTypes.flatMap((item) => tokenize(item)),
	]);
	const has = (...values) => values.some((value) => rawTokens.has(value));
	const outputSet = new Set(outputTypes);
	const inputSet = new Set(inputTypes);
	const contextLength = parseContextLength(model.details);

	const meta = {
		modelId,
		apiModelId,
		name,
		organisationId,
		organisationName,
		inputTypes,
		outputTypes,
		inputSet,
		outputSet,
		contextLength,
		rawTokens,
		semanticTokenSet: new Set([
			...semanticTokens(modelId),
			...semanticTokens(apiModelId),
			...semanticTokens(name),
		]),
		isPreview:
			has("preview", "beta", "experimental", "exp") ||
			normalizeWhitespace(model.status).toLowerCase() === "announced",
		isFast: has("flash", "fast", "turbo", "lite", "instant", "highspeed"),
		isCompact: has("mini", "nano", "micro", "small", "tiny"),
		isPremium: has("pro", "max", "ultra", "premier", "large", "heavy", "opus"),
		isEmbedding:
			outputSet.has("embeddings") || has("embedding", "embed", "embeddings"),
		isReranker: has("rerank", "reranker", "ranker"),
		isModeration:
			outputSet.has("moderations") ||
			has("moderation", "guard", "guardian", "safeguard", "shield"),
		isTranslation: has("translation", "translate", "translator"),
		isTts:
			(outputSet.has("audio") || outputSet.has("audio_tts")) &&
			has("tts", "voice", "speech", "sonic"),
		isTranscription:
			(outputSet.has("text") || outputSet.size === 0) &&
			(inputSet.has("audio") ||
				inputSet.has("audio_stt") ||
				has("transcribe", "transcription", "stt", "asr")),
		isMusic:
			(outputSet.has("audio") ||
				outputSet.has("music") ||
				outputSet.has("audio_music")) &&
			has("music", "lyria", "suno"),
		isImage:
			outputSet.has("image") ||
			has("imagen", "imagine", "flux", "recraft", "canvas", "seedream"),
		isVideo:
			outputSet.has("video") ||
			has("video", "veo", "wan", "seedance", "hailuo", "t2v", "i2v"),
		isOcr: has("ocr"),
		isSearch: has("search", "research"),
		isCoding: has("code", "coder", "coding", "devstral", "codestral", "grep"),
		isReasoning: has("reasoning", "thinking", "think", "qwq", "r1", "x1"),
		isVision:
			inputSet.has("image") ||
			has("vision", "vl", "multimodal", "omni") ||
			(inputSet.has("audio") && outputSet.has("text")),
		acceptsImageInput: inputSet.has("image"),
		acceptsAudioInput: inputSet.has("audio") || inputSet.has("audio_stt"),
		producesText: outputSet.has("text"),
	};

	return {
		...meta,
		category: inferModelCategory(meta),
	};
}

function cleanOpenRouterDescription(description, targetName) {
	let normalized = normalizeAscii(description);
	if (!normalized) return "";

	const ellipsisIndex = normalized.indexOf("...");
	if (ellipsisIndex >= 0) {
		const beforeEllipsis = normalized.slice(0, ellipsisIndex).trim();
		const sentenceEnds = [
			beforeEllipsis.lastIndexOf(". "),
			beforeEllipsis.lastIndexOf("? "),
			beforeEllipsis.lastIndexOf("! "),
		].sort((a, b) => b - a);
		const lastBoundary = sentenceEnds.find((index) => index >= 0) ?? -1;
		normalized =
			lastBoundary >= 40
				? beforeEllipsis.slice(0, lastBoundary + 1)
				: beforeEllipsis;
	}

	const isIndex = normalized.indexOf(" is ");
	if (targetName && isIndex > 0 && isIndex < 96) {
		normalized = `${targetName}${normalized.slice(isIndex)}`;
	}

	if (normalized.includes(LEGACY_PHASEO_FALLBACK)) {
		normalized = normalized.replace(LEGACY_PHASEO_FALLBACK, "").trim();
	}

	return trimSentenceBoundary(ensureSentence(normalized));
}

function hasRiskyRelativeLanguage(value) {
	const normalized = normalizeWhitespace(value).toLowerCase();
	return (
		normalized.includes("most advanced") ||
		normalized.includes("latest model") ||
		normalized.includes("latest release") ||
		normalized.includes("next generation") ||
		normalized.includes("state-of-the-art") ||
		normalized.includes("flagship")
	);
}

function enrichOpenRouterDescription(description, meta, source) {
	if (source === "openrouter_related" && hasRiskyRelativeLanguage(description)) {
		return {
			description: buildGeneratedDescription(meta),
			usedGenerated: true,
		};
	}

	let enriched = description;
	const normalized = description.toLowerCase();
	const followUp = ensureSentence(pickFollowUp(meta));

	const needsPreviewNote =
		meta.isPreview && !/(preview|beta|experimental)/.test(normalized);
	const canAppendFollowUp =
		followUp &&
		enriched.length < 150 &&
		!normalized.includes(followUp.toLowerCase().slice(0, 32));

	if (needsPreviewNote) {
		enriched = trimSentenceBoundary(
			`${enriched} This entry tracks a preview release and capabilities may change before general availability.`,
		);
	} else if (canAppendFollowUp) {
		enriched = trimSentenceBoundary(`${enriched} ${followUp}`);
	}

	return {
		description: enriched,
		usedGenerated: false,
	};
}

function buildModalitySentence(meta) {
	const inputModalities = meta.inputTypes.map(formatModality);
	const outputModalities = meta.outputTypes.map(formatModality);
	if (!inputModalities.length || !outputModalities.length) return "";
	return ensureSentence(
		`It accepts ${joinNaturalList(inputModalities)} inputs and produces ${joinNaturalList(outputModalities)} outputs`,
	);
}

function pickFollowUp(meta) {
	const contextLabel = formatContextLength(meta.contextLength);

	if (meta.isPreview) {
		return "This entry tracks a preview release and capabilities may change before general availability.";
	}

	switch (meta.category) {
		case "embedding":
			if (meta.rawTokens.has("multilingual")) {
				return "It is aimed at multilingual retrieval and semantic similarity tasks.";
			}
			if (meta.rawTokens.has("english")) {
				return "It is aimed at English-language retrieval, clustering, and semantic search.";
			}
			return "It is aimed at semantic search, retrieval, clustering, and RAG pipelines.";
		case "reranker":
			return "Use it to rescore retrieved passages, products, or documents before final ranking or generation.";
		case "moderation":
			return "It is suited to input filtering, safety checks, and policy enforcement in LLM applications.";
		case "translation":
			return "It is aimed at multilingual translation and localization workflows.";
		case "tts":
			return meta.isFast
				? "It is tuned for low-latency voice generation in interactive applications."
				: "It is suited to narration, assistants, and spoken user interfaces.";
		case "transcription":
			return "It is suited to captioning, meeting notes, transcription, and speech analytics pipelines.";
		case "music":
			return "It is aimed at prompt-driven soundtrack, jingle, and creative audio workflows.";
		case "image":
			if (meta.acceptsImageInput) {
				return "It supports text and image inputs for generation, restyling, or edit-style workflows.";
			}
			return meta.isFast
				? "It is tuned for quick image generation and iterative creative workflows."
				: "It is aimed at illustration, design exploration, and marketing creative.";
		case "video":
			if (meta.acceptsImageInput) {
				return "It supports turning still images into animated clips as well as prompt-driven video workflows.";
			}
			return "It is aimed at text-to-video, multimodal clip generation, and motion design workflows.";
		case "ocr":
			return "It is suited to extracting text, structure, and answers from PDFs, scans, and screenshots.";
		case "search":
			return "It is aimed at retrieval-heavy assistants, browsing, and research synthesis.";
		default:
			if (contextLabel && meta.contextLength >= 200000) {
				return `It supports up to ${contextLabel} of input context for long documents, codebases, and agent workflows.`;
			}
			if (meta.isFast) {
				return "It is tuned for lower latency and cost-sensitive production use.";
			}
			if (meta.isPremium) {
				return "It targets higher-capability workloads where depth, quality, or scale matter more than raw speed.";
			}
			if (meta.isCompact) {
				return "It is a smaller-footprint option suited to tighter latency or deployment budgets.";
			}
			return buildModalitySentence(meta);
	}
}

function buildGeneratedDescription(meta) {
	let firstSentence = "";

	switch (meta.category) {
		case "embedding":
			firstSentence = `${meta.name} is ${withArticle("embedding model")} from ${meta.organisationName} for vector search and semantic retrieval workflows.`;
			break;
		case "reranker":
			firstSentence = `${meta.name} is ${withArticle("reranking model")} from ${meta.organisationName} for improving retrieval quality by rescoring candidate results against a query.`;
			break;
		case "moderation":
			firstSentence = `${meta.name} is ${withArticle("safety model")} from ${meta.organisationName} for moderation, prompt filtering, and policy enforcement.`;
			break;
		case "translation":
			firstSentence = `${meta.name} is ${withArticle("translation model")} from ${meta.organisationName} for converting text between languages.`;
			break;
		case "tts":
			firstSentence = `${meta.name} is ${withArticle("text-to-speech model")} from ${meta.organisationName} for turning text into spoken audio.`;
			break;
		case "transcription":
			firstSentence = `${meta.name} is ${withArticle("speech-to-text model")} from ${meta.organisationName} for transcription and spoken-language understanding workflows.`;
			break;
		case "music":
			firstSentence = `${meta.name} is ${withArticle("music generation model")} from ${meta.organisationName} for creating songs, instrumentals, and audio clips from prompts.`;
			break;
		case "image":
			firstSentence = `${meta.name} is ${withArticle("image generation model")} from ${meta.organisationName} for visual creation workflows.`;
			break;
		case "video":
			firstSentence = `${meta.name} is ${withArticle("video generation model")} from ${meta.organisationName} for prompt-driven clip and scene creation.`;
			break;
		case "ocr":
			firstSentence = `${meta.name} is ${withArticle("document understanding model")} from ${meta.organisationName} for OCR, extraction, and page-level visual reasoning.`;
			break;
		case "search":
			firstSentence = `${meta.name} is ${withArticle("search-oriented model")} from ${meta.organisationName} for browsing-heavy retrieval and research workflows.`;
			break;
		case "vision":
			firstSentence = `${meta.name} is ${withArticle("multimodal model")} from ${meta.organisationName} that can work across text and visual inputs.`;
			break;
		case "reasoning_code":
			firstSentence = `${meta.name} is ${withArticle("reasoning-oriented coding model")} from ${meta.organisationName} for debugging, code generation, and agent workflows.`;
			break;
		case "code":
			firstSentence = `${meta.name} is ${withArticle("coding model")} from ${meta.organisationName} for code generation, edits, and software tasks.`;
			break;
		case "reasoning":
			firstSentence = `${meta.name} is ${withArticle("reasoning model")} from ${meta.organisationName} for multi-step analysis, math, and tool-driven tasks.`;
			break;
		default:
			firstSentence = `${meta.name} is ${withArticle("language model")} from ${meta.organisationName} for chat, writing, analysis, and general-purpose automation.`;
			break;
	}

	const secondSentence = pickFollowUp(meta);
	const description = [ensureSentence(firstSentence), ensureSentence(secondSentence)]
		.filter(Boolean)
		.join(" ");
	return trimSentenceBoundary(description);
}

function scoreRelatedMatch(meta, candidate) {
	if (meta.organisationId !== candidate.organisationId) return -1;
	if (meta.category !== candidate.category) return -1;

	const commonTokens = [...meta.semanticTokenSet].filter((token) =>
		candidate.semanticTokenSet.has(token),
	);
	if (commonTokens.length < 2) return -1;

	let score = commonTokens.length * 4;
	if (meta.isReasoning === candidate.isReasoning) score += 1;
	if (meta.isCoding === candidate.isCoding) score += 1;
	if (meta.isVision === candidate.isVision) score += 1;
	if (meta.isFast === candidate.isFast) score += 1;
	if (meta.isPremium === candidate.isPremium) score += 1;
	if (meta.isCompact === candidate.isCompact) score += 1;

	const sharedPrefix = commonTokens[0] ?? null;
	if (sharedPrefix) score += 1;

	return score;
}

function buildOpenRouterIndex(openRouterModels, organisationNames) {
	const byId = new Map();
	const byNormalizedId = new Map();
	const byOrganisation = new Map();

	for (const model of openRouterModels) {
		const modelId = normalizeWhitespace(model.id);
		if (!modelId) continue;
		const organisationId = modelId.split("/")[0] ?? "";
		const meta = buildMeta(
			{
				model_id: modelId,
				api_model_id: modelId,
				organisation_id: organisationId,
				name: normalizeWhitespace(model.name).replace(/^[^:]+:\s*/, ""),
				input_types: model.architecture?.input_modalities ?? [],
				output_types: model.architecture?.output_modalities ?? [],
				details:
					typeof model.context_length === "number"
						? [{ name: "input_context_length", value: model.context_length }]
						: [],
				status: null,
			},
			organisationNames,
		);
		const description = cleanOpenRouterDescription(model.description, meta.name);
		if (!description) continue;

		const entry = {
			...meta,
			description,
		};
		byId.set(modelId, entry);
		byNormalizedId.set(normalizedId(modelId), entry);
		if (!byOrganisation.has(entry.organisationId)) {
			byOrganisation.set(entry.organisationId, []);
		}
		byOrganisation.get(entry.organisationId).push(entry);
	}

	return {
		byId,
		byNormalizedId,
		byOrganisation,
	};
}

function chooseDescription(meta, openRouterIndex) {
	const exact =
		openRouterIndex.byId.get(meta.apiModelId) ||
		openRouterIndex.byId.get(meta.modelId);
	if (exact) {
		const enriched = enrichOpenRouterDescription(
			cleanOpenRouterDescription(exact.description, meta.name),
			meta,
			"openrouter_exact",
		);
		return {
			description: enriched.description,
			source: enriched.usedGenerated ? "generated" : "openrouter_exact",
		};
	}

	const normalized =
		openRouterIndex.byNormalizedId.get(normalizedId(meta.apiModelId)) ||
		openRouterIndex.byNormalizedId.get(normalizedId(meta.modelId));
	if (normalized) {
		const enriched = enrichOpenRouterDescription(
			cleanOpenRouterDescription(normalized.description, meta.name),
			meta,
			"openrouter_normalized",
		);
		return {
			description: enriched.description,
			source: enriched.usedGenerated ? "generated" : "openrouter_normalized",
		};
	}

	const sameOrg = openRouterIndex.byOrganisation.get(meta.organisationId) ?? [];
	let best = null;
	for (const candidate of sameOrg) {
		const score = scoreRelatedMatch(meta, candidate);
		if (score < 8) continue;
		if (!best || score > best.score) {
			best = { candidate, score };
		}
	}
	if (best) {
		const enriched = enrichOpenRouterDescription(
			cleanOpenRouterDescription(best.candidate.description, meta.name),
			meta,
			"openrouter_related",
		);
		return {
			description: enriched.description,
			source: enriched.usedGenerated ? "generated" : "openrouter_related",
		};
	}

	return {
		description: buildGeneratedDescription(meta),
		source: "generated",
	};
}

function insertDescription(model, description) {
	const trimmedDescription = trimSentenceBoundary(
		ensureSentence(normalizeAscii(description)),
	);
	const result = {};
	let inserted = false;

	for (const [key, value] of Object.entries(model)) {
		if (key === "description") continue;
		result[key] = value;
		if (!inserted && key === "previous_model_id") {
			result.description = trimmedDescription;
			inserted = true;
		}
	}

	if (!inserted) {
		const fallback = {};
		for (const [key, value] of Object.entries(result)) {
			fallback[key] = value;
			if (!inserted && key === "status") {
				fallback.description = trimmedDescription;
				inserted = true;
			}
		}
		if (!inserted) {
			fallback.description = trimmedDescription;
		}
		return fallback;
	}

	return result;
}

async function loadOpenRouterModels() {
	const response = await fetch(OPENROUTER_MODELS_URL, {
		headers: {
			"User-Agent": "ai-stats-model-description-sync/1.0",
		},
	});
	if (!response.ok) {
		throw new Error(
			`Failed to load OpenRouter models (${response.status} ${response.statusText})`,
		);
	}
	const json = await response.json();
	if (!Array.isArray(json?.data)) {
		throw new Error("OpenRouter models response did not include a data array.");
	}
	return json.data;
}

async function main() {
	const checkOnly = process.argv.includes("--check");
	const organisationNames = loadOrganisationNames();
	const openRouterModels = await loadOpenRouterModels();
	const openRouterIndex = buildOpenRouterIndex(openRouterModels, organisationNames);
	const modelFiles = listModelFiles(MODELS_ROOT);

	const stats = {
		total: 0,
		updated: 0,
		openrouter_exact: 0,
		openrouter_normalized: 0,
		openrouter_related: 0,
		generated: 0,
	};
	const missing = [];

	for (const filePath of modelFiles) {
		const original = fs.readFileSync(filePath, "utf8");
		const model = JSON.parse(original);
		const meta = buildMeta(model, organisationNames);
		const { description, source } = chooseDescription(meta, openRouterIndex);
		const finalDescription = trimSentenceBoundary(
			ensureSentence(normalizeAscii(description)),
		);

		if (!finalDescription || finalDescription === "." || finalDescription === LEGACY_PHASEO_FALLBACK) {
			missing.push(meta.modelId);
			continue;
		}

		stats.total += 1;
		stats[source] += 1;

		const updatedModel = insertDescription(model, finalDescription);
		const next = `${JSON.stringify(updatedModel, null, 2)}\n`;
		if (next !== original) {
			stats.updated += 1;
			if (!checkOnly) {
				fs.writeFileSync(filePath, next, "utf8");
			}
		}
	}

	if (missing.length > 0) {
		console.error(
			`Missing descriptions for ${missing.length} models:\n${missing.join("\n")}`,
		);
		process.exitCode = 1;
	}

	console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
