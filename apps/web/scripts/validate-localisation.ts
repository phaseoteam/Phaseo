import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isArgumentElement,
	isDateElement,
	isNumberElement,
	isPluralElement,
	isSelectElement,
	isTagElement,
	isTimeElement,
	parse,
	type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { assertValidCatalogs } from "../src/i18n/validation";
import { appleAppStoreLocales } from "../src/i18n/apple-locales";
import {
	catalogLocales,
	getLocaleDefinition,
	publicLocales,
	translationLocales,
} from "../src/i18n/routing";
import { getProfileMessages } from "../src/i18n/profile";

const MESSAGES_DIRECTORY = fileURLToPath(new URL("../messages/", import.meta.url));
const SOURCE_LOCALE = "en-GB";
const sourceFilesCount = readdirSync(join(MESSAGES_DIRECTORY, SOURCE_LOCALE)).filter(
	(filename) => filename.endsWith(".json"),
).length;
const NON_MESSAGE_CATALOG_ENTRIES = new Set([
	"product.json:interactiveOnboarding.prompts.json.response",
]);
// This value is an English plural form supplied for languages that need it.
// These four translations use a single locale-neutral field label instead.
const OPTIONAL_LOCALE_ARGUMENTS = new Set([
	"ja:settings-ui.json:observability.selectedFieldValues:fieldPlural",
	"zh-Hans:settings-ui.json:observability.selectedFieldValues:fieldPlural",
	"hi:settings-ui.json:observability.selectedFieldValues:fieldPlural",
	"ar-SA:settings-ui.json:observability.selectedFieldValues:fieldPlural",
]);

function flattenMessages(
	value: unknown,
	prefix = "",
	result = new Map<string, unknown>(),
): Map<string, unknown> {
	if (Array.isArray(value)) {
		value.forEach((child, index) => {
			flattenMessages(child, `${prefix}[${index}]`, result);
		});
		return result;
	}
	if (value && typeof value === "object" && !Array.isArray(value)) {
		for (const [key, child] of Object.entries(value)) {
			flattenMessages(child, prefix ? `${prefix}.${key}` : key, result);
		}
		return result;
	}
	if (!prefix) throw new TypeError("Expected a message object at the catalog root");
	result.set(prefix, value);
	return result;
}

function collectIcuArguments(
	elements: MessageFormatElement[],
	result = new Set<string>(),
): Set<string> {
	for (const element of elements) {
		if (
			isArgumentElement(element) ||
			isDateElement(element) ||
			isNumberElement(element) ||
			isTimeElement(element)
		) {
			result.add(element.value);
		} else if (isSelectElement(element) || isPluralElement(element)) {
			result.add(element.value);
			for (const option of Object.values(element.options)) {
				collectIcuArguments(option.value, result);
			}
		} else if (isTagElement(element)) {
			collectIcuArguments(element.children, result);
		}
	}
	return result;
}

function readMessageFile(path: string): Map<string, unknown> {
	return flattenMessages(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function validateFullLocaleCatalogs(): string[] {
	const issues: string[] = [];
	const sourceDirectory = join(MESSAGES_DIRECTORY, SOURCE_LOCALE);
	const sourceFiles = readdirSync(sourceDirectory)
		.filter((filename) => filename.endsWith(".json"))
		.sort();
	const sourceCatalogs = new Map<string, Map<string, unknown>>();

	for (const filename of sourceFiles) {
		try {
			sourceCatalogs.set(filename, readMessageFile(join(sourceDirectory, filename)));
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			issues.push(`${SOURCE_LOCALE}/${filename}: could not read catalog (${reason})`);
		}
	}

	for (const locale of translationLocales) {
		const localeDirectory = join(MESSAGES_DIRECTORY, locale);
		const localeFiles = new Set(
			readdirSync(localeDirectory).filter((filename) => filename.endsWith(".json")),
		);
		for (const filenameExtra of localeFiles) {
			if (!sourceFiles.includes(filenameExtra)) {
				issues.push(`${locale}: unexpected catalog ${filenameExtra}`);
			}
		}
		for (const filename of sourceFiles) {
			const source = sourceCatalogs.get(filename);
			if (!source) continue;
			if (!localeFiles.has(filename)) {
				issues.push(`${locale}: missing ${filename}`);
				continue;
			}

			let translated: Map<string, unknown>;
			try {
				translated = readMessageFile(join(localeDirectory, filename));
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				issues.push(`${locale}/${filename}: could not read catalog (${reason})`);
				continue;
			}

			for (const key of source.keys()) {
				if (!translated.has(key)) {
					issues.push(`${locale}/${filename}:${key}: missing message`);
				}
			}
			for (const key of translated.keys()) {
				if (!source.has(key)) {
					issues.push(`${locale}/${filename}:${key}: unexpected message`);
				}
			}

			for (const [key, sourceMessage] of source) {
				const message = translated.get(key);
				if (typeof message !== "string" || typeof sourceMessage !== "string") {
					continue;
				}
				if (!message.trim()) {
					issues.push(`${locale}/${filename}:${key}: translation is empty`);
					continue;
				}
				if (
					filename === "settings-ui.json" &&
					key === 'Type "DELETE" to confirm' &&
					!message.includes("DELETE")
				) {
					issues.push(
						`${locale}/${filename}:${key}: required confirmation token DELETE must stay unchanged`,
					);
				}
				if (NON_MESSAGE_CATALOG_ENTRIES.has(`${filename}:${key}`)) continue;

				try {
					const sourceArguments = collectIcuArguments(
						parse(sourceMessage, { ignoreTag: true }),
					);
					const translatedArguments = collectIcuArguments(
						parse(message, { ignoreTag: true }),
					);
					const missingArguments = [...sourceArguments].filter(
						(argument) =>
							!translatedArguments.has(argument) &&
							!OPTIONAL_LOCALE_ARGUMENTS.has(
								`${locale}:${filename}:${key}:${argument}`,
							),
					);
					const unexpectedArguments = [...translatedArguments].filter(
						(argument) => !sourceArguments.has(argument),
					);
					if (missingArguments.length > 0 || unexpectedArguments.length > 0) {
						issues.push(
							`${locale}/${filename}:${key}: interpolation arguments differ (missing: ${missingArguments.join(", ") || "none"}; unexpected: ${unexpectedArguments.join(", ") || "none"})`,
						);
					}
				} catch (error) {
					const reason = error instanceof Error ? error.message : String(error);
					issues.push(`${locale}/${filename}:${key}: invalid ICU message (${reason})`);
				}
			}
		}
	}

	return issues;
}

assertValidCatalogs();

const fullCatalogIssues = validateFullLocaleCatalogs();
if (fullCatalogIssues.length > 0) {
	throw new Error(`Invalid full locale catalogs:\n- ${fullCatalogIssues.join("\n- ")}`);
}

const profileSource = getProfileMessages("en-GB");
const profileSourceKeys = Object.keys(profileSource).sort();
const profileIssues: string[] = [];
for (const locale of publicLocales) {
	const localized = getProfileMessages(locale);
	const localizedKeys = Object.keys(localized).sort();
	if (JSON.stringify(localizedKeys) !== JSON.stringify(profileSourceKeys)) {
		profileIssues.push(`${locale}: profile message keys do not match en-GB`);
		continue;
	}
	for (const key of profileSourceKeys as Array<keyof typeof profileSource>) {
		const sourcePlaceholders = [...profileSource[key].matchAll(/\{([A-Za-z][\w.-]*)\}/g)]
			.map((match) => match[1])
			.sort();
		const translated = localized[key];
		if (!translated.trim()) {
			profileIssues.push(`${locale}.${key}: translation is empty`);
			continue;
		}
		const translatedPlaceholders = [...translated.matchAll(/\{([A-Za-z][\w.-]*)\}/g)]
			.map((match) => match[1])
			.sort();
		if (JSON.stringify(translatedPlaceholders) !== JSON.stringify(sourcePlaceholders)) {
			profileIssues.push(`${locale}.${key}: interpolation placeholders do not match en-GB`);
		}
	}
}
if (profileIssues.length > 0) {
	throw new Error(`Invalid profile translations:\n${profileIssues.join("\n")}`);
}

const appleCatalogCount = catalogLocales.filter(
	(locale) => getLocaleDefinition(locale).role !== "pseudo",
).length;
process.stdout.write(
	`Localisation catalogs valid: ${catalogLocales.join(", ")}\n` +
	`Full message catalogs valid: ${translationLocales.length} locales, ${sourceFilesCount} files each\n` +
		`Profile catalogs valid: ${publicLocales.length} locales\n` +
		`Apple App Store matrix coverage: ${appleCatalogCount}/${appleAppStoreLocales.length} locales\n`,
);
