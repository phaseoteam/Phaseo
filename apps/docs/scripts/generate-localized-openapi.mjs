import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(docsRoot, "openapi/v1/openapi.yaml");
const translationsPath = path.join(docsRoot, "openapi/localized-copy.json");
const locales = ["es", "fr", "de", "pt-BR", "hi", "ja", "zh-Hans", "ar"];
const checkOnly = process.argv.includes("--check");

const source = yaml.load(await readFile(sourcePath, "utf8"), {
	schema: yaml.JSON_SCHEMA,
});
const translations = JSON.parse(await readFile(translationsPath, "utf8"));
const globalComponentCopy = translations._components ?? {};
const globalStringCopy = translations._strings ?? {};

function getOperationKey(reference) {
	if (typeof reference !== "string") return undefined;
	const match = reference.match(
		/(?:^|\.yaml\s+)(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)$/,
	);
	return match ? `${match[1]} ${match[2]}` : undefined;
}

async function readEndpointPageMetadata(filePath) {
	const content = await readFile(filePath, "utf8");
	const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatter) return undefined;
	return yaml.load(frontmatter[1], { schema: yaml.JSON_SCHEMA });
}

async function loadEndpointPageCopy() {
	const pages = new Map();
	const sourcePages = path.join(docsRoot, "v1/api-reference/endpoint");
	for (const fileName of await readdir(sourcePages)) {
		if (!fileName.endsWith(".mdx")) continue;
		const metadata = await readEndpointPageMetadata(path.join(sourcePages, fileName));
		const operationKey = getOperationKey(metadata?.openapi);
		if (operationKey) {
			pages.set(operationKey, { fileName, source: metadata, locales: {} });
		}
	}

	for (const locale of locales) {
		const localePages = path.join(docsRoot, locale, "v1/api-reference/endpoint");
		for (const fileName of await readdir(localePages)) {
			if (!fileName.endsWith(".mdx")) continue;
			const metadata = await readEndpointPageMetadata(path.join(localePages, fileName));
			const operationKey = getOperationKey(metadata?.openapi);
			if (operationKey && pages.has(operationKey)) {
				pages.get(operationKey).locales[locale] = metadata;
			}
		}
	}
	return pages;
}

const endpointPageCopy = await loadEndpointPageCopy();

function translatedValue(locale, values, label) {
	const value = values?.[locale];
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Missing ${locale} translation for ${label}`);
	}
	return value;
}

function applyStringCopy(locale, value, context) {
	if (Array.isArray(value)) {
		for (const [index, child] of value.entries()) {
			applyStringCopy(locale, child, `${context}/${index}`);
		}
		return;
	}
	if (!value || typeof value !== "object") return;

	for (const [key, child] of Object.entries(value)) {
		const sourceText = typeof child === "string" ? child.replace(/\s+$/, "") : child;
		if (
			["summary", "description", "title"].includes(key) &&
		typeof child === "string" &&
			globalStringCopy[sourceText]
		) {
			value[key] = translatedValue(
				locale,
				globalStringCopy[sourceText],
				`${context}/${key}`,
			);
		} else {
			applyStringCopy(locale, child, `${context}/${key}`);
		}
	}
}

function buildLocalizedSpec(locale) {
	const paths = {};
	const components = {};
	const visitedComponents = new Set();
	const operationCopies = new Map(
		Object.entries(translations).filter(([operationKey]) =>
			!operationKey.startsWith("_"),
		),
	);
	for (const [route, pathItem] of Object.entries(source.paths ?? {})) {
		for (const [method, operation] of Object.entries(pathItem)) {
			if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
			const operationKey = `${method.toUpperCase()} ${route}`;
			if (operationCopies.has(operationKey)) continue;
			const pageCopy = endpointPageCopy.get(operationKey);
			const localePageCopy = pageCopy?.locales[locale];
			const hasSummary =
				globalStringCopy[operation.summary] || localePageCopy?.title;
			const hasDescription =
				globalStringCopy[operation.description] ||
				(pageCopy?.source?.description === operation.description &&
					localePageCopy?.description);
			if (hasSummary && hasDescription) {
				operationCopies.set(operationKey, {});
			}
		}
	}

	function addComponentReference(reference) {
		const prefix = "#/components/";
		if (!reference.startsWith(prefix)) {
			throw new Error(`Unsupported OpenAPI reference: ${reference}`);
		}

		const [section, ...encodedNameParts] = reference.slice(prefix.length).split("/");
		const name = encodedNameParts
			.map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
			.join("/");
		if (!section || !name) {
			throw new Error(`Invalid OpenAPI component reference: ${reference}`);
		}

		const key = `${section}/${name}`;
		if (visitedComponents.has(key)) return;
		const component = source.components?.[section]?.[name];
		if (!component) {
			throw new Error(`OpenAPI component does not exist: ${reference}`);
		}

		visitedComponents.add(key);
		components[section] ??= {};
		components[section][name] = structuredClone(component);
		collectComponentReferences(components[section][name]);
	}

	function collectComponentReferences(value) {
		if (Array.isArray(value)) {
			for (const item of value) collectComponentReferences(item);
			return;
		}
		if (!value || typeof value !== "object") return;

		for (const [key, child] of Object.entries(value)) {
			if (key === "$ref") {
				if (typeof child !== "string") {
					throw new Error("OpenAPI $ref values must be strings");
				}
				addComponentReference(child);
			} else {
				collectComponentReferences(child);
			}
		}
	}

	function addSecurityRequirements(requirements) {
		for (const requirement of requirements ?? []) {
			for (const name of Object.keys(requirement)) {
				addComponentReference(
					`#/components/securitySchemes/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`,
				);
			}
		}
	}

	function applyComponentCopy(componentCopy, context) {
		for (const [section, namedComponents] of Object.entries(componentCopy)) {
			for (const [name, fields] of Object.entries(namedComponents)) {
				const component = components[section]?.[name];
				if (!component) {
					if (context === "Global OpenAPI copy") continue;
					throw new Error(`${context} does not reference component ${section}/${name}`);
				}
				applyFieldCopy(
					component,
					fields,
					`${context} component ${section}/${name}`,
				);
			}
		}
	}

	function applyFieldCopy(targetObject, fields, context) {
		for (const [fieldPath, localeValues] of Object.entries(fields ?? {})) {
			const segments = fieldPath.startsWith("/")
				? fieldPath
					.split("/")
					.slice(1)
					.map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
				: [fieldPath];
			const target = segments.slice(0, -1).reduce((value, segment) => {
				if (!value || typeof value !== "object" || !(segment in value)) {
					throw new Error(`${context} has no field ${fieldPath}`);
				}
				return value[segment];
			}, targetObject);
			const field = segments.at(-1);
			if (!field || !target || typeof target !== "object" || !(field in target)) {
				throw new Error(`${context} has no field ${fieldPath}`);
			}
			target[field] = translatedValue(locale, localeValues, `${context} ${fieldPath}`);
		}
	}

	function applyParameterCopy(parameters, copies, context) {
		for (const copy of copies ?? []) {
			const parameter = parameters?.find(
				(candidate) => candidate.name === copy.name && candidate.in === copy.in,
			);
			if (!parameter) {
				throw new Error(
					`${context} has no ${copy.in} parameter named ${copy.name}`,
				);
			}
			parameter.description = translatedValue(
				locale,
				copy.description,
				`${context} ${copy.in} parameter ${copy.name}`,
			);
		}
	}

	addSecurityRequirements(source.security);

	for (const [operationKey, copy] of operationCopies) {
		const [method, ...pathParts] = operationKey.split(" ");
		const route = pathParts.join(" ");
		const sourcePath = source.paths?.[route];
		const sourceOperation = sourcePath?.[method.toLowerCase()];
		if (!sourceOperation) {
			throw new Error(`OpenAPI operation does not exist: ${operationKey}`);
		}

		const operation = structuredClone(sourceOperation);
		const pageCopy = endpointPageCopy.get(operationKey);
		const localePageCopy = pageCopy?.locales[locale];
		operation.summary = copy.summary
			? translatedValue(locale, copy.summary, `${operationKey} summary`)
			: globalStringCopy[sourceOperation.summary]
				? translatedValue(
						locale,
						globalStringCopy[sourceOperation.summary],
						`${operationKey} summary`,
					)
				: translatedValue(
						locale,
						{ [locale]: localePageCopy?.title },
						`${operationKey} summary`,
					);
		operation.description = copy.description
			? translatedValue(locale, copy.description, `${operationKey} description`)
			: globalStringCopy[sourceOperation.description]
				? translatedValue(
						locale,
						globalStringCopy[sourceOperation.description],
						`${operationKey} description`,
					)
				: translatedValue(
						locale,
						{ [locale]: localePageCopy?.description },
						`${operationKey} description`,
					);
		applyParameterCopy(operation.parameters, copy.parameters, operationKey);

		for (const [status, localeDescriptions] of Object.entries(copy.responses ?? {})) {
			const response = operation.responses?.[status];
			if (!response) {
				throw new Error(`${operationKey} has no ${status} response`);
			}
			response.description = translatedValue(
				locale,
				localeDescriptions,
				`${operationKey} response ${status}`,
			);
		}
		applyFieldCopy(operation, copy.fields, `${operationKey} operation`);
		applyStringCopy(locale, operation, operationKey);
		addSecurityRequirements(operation.security);
		collectComponentReferences(operation);
		applyComponentCopy(copy.components ?? {}, operationKey);

		paths[route] ??= {};
		if (sourcePath.parameters && !paths[route].parameters) {
			paths[route].parameters = structuredClone(sourcePath.parameters);
		}
		applyParameterCopy(
			paths[route].parameters,
			copy.pathParameters,
			`${operationKey} path`,
		);
		applyStringCopy(locale, paths[route].parameters, `${operationKey} path`);
		collectComponentReferences(paths[route].parameters ?? []);
		paths[route][method.toLowerCase()] = operation;
	}

	applyComponentCopy(globalComponentCopy, "Global OpenAPI copy");
	applyStringCopy(locale, components, "OpenAPI components");

	const spec = {
		openapi: source.openapi,
		info: {
			title: source.info.title,
			version: source.info.version,
		},
		servers: source.servers,
		security: source.security,
		paths,
	};
	if (Object.keys(components).length > 0) spec.components = components;

	return yaml.dump(spec, {
		lineWidth: -1,
		noRefs: true,
		schema: yaml.JSON_SCHEMA,
	});
}

for (const locale of locales) {
	const outputPath = path.join(
		docsRoot,
		locale,
		"openapi/v1/openapi.localized.yaml",
	);
	const generated = buildLocalizedSpec(locale);
	if (checkOnly) {
		let existing;
		try {
			existing = await readFile(outputPath, "utf8");
		} catch {
			throw new Error(`Missing generated locale OpenAPI file: ${outputPath}`);
		}
		if (existing !== generated) {
			throw new Error(`Localized OpenAPI file is out of date: ${outputPath}`);
		}
	} else {
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, generated, "utf8");
	}
}

process.stdout.write(
	`${checkOnly ? "Checked" : "Generated"} localized OpenAPI overlays for ${locales.length} locales.\n`,
);
