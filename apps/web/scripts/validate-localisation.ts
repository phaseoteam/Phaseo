import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isArgumentElement,
	isDateElement,
	isLiteralElement,
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
	type CatalogLocale,
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

function collectLiteralText(elements: MessageFormatElement[], result: string[] = []): string[] {
	for (const element of elements) {
		if (isLiteralElement(element)) {
			result.push(element.value);
		} else if (isSelectElement(element) || isPluralElement(element)) {
			for (const option of Object.values(element.options)) {
				collectLiteralText(option.value, result);
			}
		} else if (isTagElement(element)) {
			collectLiteralText(element.children, result);
		}
	}
	return result;
}

// Machine translation once left HTML-escaped quotes, padded protected terms ("Phaseox",
// "Bedrockxx"), mangled English ("Reeem", "Irror") and other languages' text in catalogs.
const HTML_ENTITY = /&(?:quot|apos|amp|lt|gt|nbsp|#\d+|#x[\da-f]+);/i;
// Latin-script words translations may add although the English text does not use them
// (zh-Hans writes LLM tokens as "token"). Acronyms such as SSO, OS or US$ are always allowed.
const ADDED_LATIN_TERMS = new Set(["phaseo", "token", "web"]);
// Simplified Chinese forms that Japanese writes differently (们/們, 设/設, 关/関, 试/試 ...).
const SIMPLIFIED_CHINESE_ONLY =
	/[们这过获试删选择况仪码级关闭开页设认证计让说请读从对时间发现动头东车门问题应该实际网络线统资务构链显输单费额账户钥键态败错误导处复报览浏载传储滤样么吗还为无专业优价标签册历纪录钟则规图层达适运营产质细节击确总结组织档权测评购订阅销扫见观视频语话记忆虑]/u;

function latinTerms(elements: MessageFormatElement[], skipAcronyms = false): Set<string> {
	const words = collectLiteralText(elements).join(" ").match(/[A-Za-z]{2,}/g) ?? [];
	return new Set(
		words
			.filter((word) => !skipAcronyms || /[a-z]/.test(word))
			.map((word) => word.toLowerCase().replace(/(?<=\w{2})(?:ing|s)$/, "")),
	);
}

function translationDamage(
	locale: CatalogLocale,
	sourceMessage: string,
	message: string,
	sourceElements: MessageFormatElement[],
	elements: MessageFormatElement[],
): string | null {
	if (HTML_ENTITY.test(message) && !HTML_ENTITY.test(sourceMessage)) {
		return "contains an HTML entity; write the character itself";
	}
	const script = getLocaleDefinition(locale).script;
	if (script === "Jpan" && SIMPLIFIED_CHINESE_ONLY.test(message)) {
		return "contains Simplified Chinese characters";
	}
	if (script === "Latn") return null;
	const sourceTerms = latinTerms(sourceElements);
	const foreign = [...latinTerms(elements, true)].filter(
		(term) => !sourceTerms.has(term) && !ADDED_LATIN_TERMS.has(term),
	);
	return foreign.length > 0
		? `contains Latin-script words that are not in the English source (${foreign.join(", ")})`
		: null;
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
					const sourceElements = parse(sourceMessage, { ignoreTag: true });
					const translatedElements = parse(message, { ignoreTag: true });
					const damage = translationDamage(
						locale,
						sourceMessage,
						message,
						sourceElements,
						translatedElements,
					);
					if (damage) issues.push(`${locale}/${filename}:${key}: ${damage}`);
					const sourceArguments = collectIcuArguments(sourceElements);
					const translatedArguments = collectIcuArguments(translatedElements);
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
