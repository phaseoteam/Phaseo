import fs from "node:fs/promises";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { load as yamlLoad } from "js-yaml";

export type CompatibilityTarget =
	| "openai.responses"
	| "openai.chat.completions"
	| "anthropic.messages";

export type CompatibilityResult = {
	valid: boolean;
	errors: ErrorObject[] | null | undefined;
};

type ValidatorMap = Record<CompatibilityTarget, ValidateFunction>;

let cachedValidators: ValidatorMap | null = null;

const OPENAI_SPEC_URL = new URL("../../../../../api/openapi.openai.yml", import.meta.url);
const ANTHROPIC_SPEC_URL = new URL("../../../../../api/openapi.anthropic.json", import.meta.url);

async function readOpenAiSpecFromRepo(): Promise<string> {
	return fs.readFile(OPENAI_SPEC_URL, "utf8");
}

async function readAnthropicSpecFromRepo(): Promise<string> {
	return fs.readFile(ANTHROPIC_SPEC_URL, "utf8");
}

function encodeJsonPointer(value: string): string {
	return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function refForResponseSchema(args: {
	baseId: string;
	pathName: string;
	method: string;
	status: string;
	contentType: string;
}): string {
	const pointer = [
		"paths",
		args.pathName,
		args.method,
		"responses",
		args.status,
		"content",
		args.contentType,
		"schema",
	]
		.map(encodeJsonPointer)
		.join("/");
	return `${args.baseId}#/${pointer}`;
}

function findContentType(content: Record<string, unknown> | undefined): string | null {
	if (!content || typeof content !== "object") return null;
	if ("application/json" in content) return "application/json";
	const key = Object.keys(content).find((type) => type.startsWith("application/json"));
	return key ?? null;
}

function buildAjv(): Ajv {
	const ajv = new Ajv({
		allErrors: true,
		strict: false,
		allowUnionTypes: true,
	});
	addFormats(ajv);
	return ajv;
}

async function loadOpenAiSpec(): Promise<Record<string, any>> {
	const raw = await readOpenAiSpecFromRepo();
	const parsed = yamlLoad(raw);
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Failed to parse OpenAI OpenAPI spec");
	}
	return parsed as Record<string, any>;
}

async function loadAnthropicSpec(): Promise<Record<string, any>> {
	const raw = await readAnthropicSpecFromRepo();
	const parsed = JSON.parse(raw);
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Failed to parse Anthropic OpenAPI spec");
	}
	return parsed as Record<string, any>;
}

function resolveResponseRef(args: {
	spec: Record<string, any>;
	baseId: string;
	pathName: string;
	method: string;
	status: string;
}): string {
	const pathItem = args.spec.paths?.[args.pathName];
	const methodItem = pathItem?.[args.method];
	const response = methodItem?.responses?.[args.status];
	const contentType = findContentType(response?.content);
	if (!contentType) {
		throw new Error(`Missing JSON response schema for ${args.pathName}`);
	}
	return refForResponseSchema({
		baseId: args.baseId,
		pathName: args.pathName,
		method: args.method,
		status: args.status,
		contentType,
	});
}

async function buildValidators(): Promise<ValidatorMap> {
	const [openaiSpec, anthropicSpec] = await Promise.all([
		loadOpenAiSpec(),
		loadAnthropicSpec(),
	]);

	const ajv = buildAjv();
	ajv.addSchema(openaiSpec, "openai");
	ajv.addSchema(anthropicSpec, "anthropic");

	const openaiResponsesRef = resolveResponseRef({
		spec: openaiSpec,
		baseId: "openai",
		pathName: "/responses",
		method: "post",
		status: "200",
	});
	const openaiChatRef = resolveResponseRef({
		spec: openaiSpec,
		baseId: "openai",
		pathName: "/chat/completions",
		method: "post",
		status: "200",
	});
	const anthropicMessagesRef = resolveResponseRef({
		spec: anthropicSpec,
		baseId: "anthropic",
		pathName: "/v1/messages",
		method: "post",
		status: "200",
	});

	return {
		"openai.responses": ajv.compile({ $ref: openaiResponsesRef }),
		"openai.chat.completions": ajv.compile({ $ref: openaiChatRef }),
		"anthropic.messages": ajv.compile({ $ref: anthropicMessagesRef }),
	};
}

function getValidatorForTarget(
	validators: ValidatorMap,
	target: CompatibilityTarget,
): ValidateFunction {
	switch (target) {
		case "openai.responses":
			return validators["openai.responses"];
		case "openai.chat.completions":
			return validators["openai.chat.completions"];
		case "anthropic.messages":
			return validators["anthropic.messages"];
	}
}

export async function validateCompatibility(
	target: CompatibilityTarget,
	payload: unknown,
): Promise<CompatibilityResult> {
	if (!cachedValidators) {
		cachedValidators = await buildValidators();
	}

	const validate = getValidatorForTarget(cachedValidators, target);
	const valid = Boolean(validate(payload));
	return {
		valid,
		errors: validate.errors ?? null,
	};
}
