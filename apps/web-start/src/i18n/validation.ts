import {
	isDateElement,
	isLiteralElement,
	isNumberElement,
	isPluralElement,
	isPoundElement,
	isSelectElement,
	isStructurallySame,
	isTagElement,
	isTimeElement,
	parse,
	type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "next-intl";
import {
	appleAppStoreLocales,
	isAppleAppStoreLocale,
} from "./apple-locales";
import {
	getCatalogMessages,
	getCatalogOverlay,
	getCatalogOverlayFallback,
	getTypedCatalogMessages,
} from "./catalogs";
import {
	extractProtectedTokens,
	pseudoLocalizeMessage,
	pseudoLocalizeMessages,
} from "./pseudo";
import {
	catalogLocales,
	defaultLocale,
	getLocaleDefinition,
	publicLocales,
	translationLocales,
	variantLocales,
	type CatalogLocale,
} from "./routing";

export type FlatCatalog = Record<string, string>;

const NON_TRANSLATABLE_KEYS = new Set([
	"Auth.shared.emailPlaceholder",
	"Auth.signIn.sso",
	"Auth.forgotPassword.emailPlaceholder",
]);
const MAX_FULL_CATALOG_SOURCE_EQUALITY_RATIO = 0.25;
const REQUIRE_EVERY_PLURAL_CATEGORY = new Set<CatalogLocale>(["ar-SA"]);

export function flattenCatalog(
	value: unknown,
	prefix = "",
	result: FlatCatalog = {},
): FlatCatalog {
	if (typeof value === "string") {
		result[prefix] = value;
		return result;
	}

	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError(
			`Catalog value at "${prefix}" must be a message object or string`,
		);
	}

	for (const [key, child] of Object.entries(value)) {
		flattenCatalog(child, prefix ? `${prefix}.${key}` : key, result);
	}

	return result;
}

function groupStructuralElements(
	elements: MessageFormatElement[],
): Map<string, MessageFormatElement[]> {
	const groups = new Map<string, MessageFormatElement[]>();

	for (const element of elements) {
		if (isLiteralElement(element)) continue;
		const identity = isPoundElement(element)
			? "pound"
			: `${element.type}:${element.value}`;
		const group = groups.get(identity) ?? [];
		group.push(element);
		groups.set(identity, group);
	}

	return groups;
}

function compareElementSemantics(
	source: MessageFormatElement,
	translated: MessageFormatElement,
	path: string,
): string[] {
	const issues: string[] = [];

	if (
		(isNumberElement(source) ||
			isDateElement(source) ||
			isTimeElement(source)) &&
		(isNumberElement(translated) ||
			isDateElement(translated) ||
			isTimeElement(translated)) &&
		JSON.stringify(source.style ?? null) !==
			JSON.stringify(translated.style ?? null)
	) {
		issues.push(`${path}: number/date/time style changed`);
	}

	if (isTagElement(source) && isTagElement(translated)) {
		issues.push(
			...compareIcuSemantics(
				source.children,
				translated.children,
				`${path}.<${source.value}>`,
			),
		);
	}

	if (isSelectElement(source) && isSelectElement(translated)) {
		const sourceSelectors = Object.keys(source.options).sort();
		const translatedSelectors = Object.keys(translated.options).sort();
		if (
			JSON.stringify(sourceSelectors) !== JSON.stringify(translatedSelectors)
		) {
			issues.push(`${path}: select cases changed`);
		}

		for (const selector of sourceSelectors) {
			const translatedOption = translated.options[selector];
			if (!translatedOption) continue;
			issues.push(
				...compareIcuSemantics(
					source.options[selector].value,
					translatedOption.value,
					`${path}.${selector}`,
				),
			);
		}
	}

	if (isPluralElement(source) && isPluralElement(translated)) {
		if (source.offset !== translated.offset) {
			issues.push(`${path}: plural offset changed`);
		}
		if (source.pluralType !== translated.pluralType) {
			issues.push(`${path}: plural type changed`);
		}

		if (!translated.options.other) {
			issues.push(`${path}: plural case "other" is required`);
		}

		for (const selector of Object.keys(source.options)) {
			if (selector.startsWith("=") && !translated.options[selector]) {
				issues.push(`${path}: missing exact plural case "${selector}"`);
			}
		}
	}

	return issues;
}

export function compareIcuSemantics(
	source: MessageFormatElement[],
	translated: MessageFormatElement[],
	path = "message",
): string[] {
	const issues: string[] = [];
	const sourceGroups = groupStructuralElements(source);
	const translatedGroups = groupStructuralElements(translated);

	for (const [identity, sourceElements] of sourceGroups) {
		const translatedElements = translatedGroups.get(identity) ?? [];
		if (sourceElements.length !== translatedElements.length) {
			issues.push(
				`${path}: "${identity}" occurs ${translatedElements.length} time(s), expected ${sourceElements.length}`,
			);
		}

		const comparableCount = Math.min(
			sourceElements.length,
			translatedElements.length,
		);
		for (let index = 0; index < comparableCount; index += 1) {
			issues.push(
				...compareElementSemantics(
					sourceElements[index],
					translatedElements[index],
					`${path}.${identity}`,
				),
			);
		}
	}

	for (const identity of translatedGroups.keys()) {
		if (!sourceGroups.has(identity)) {
			issues.push(`${path}: unexpected ICU element "${identity}"`);
		}
	}

	return issues;
}

function validatePluralCategories(
	elements: MessageFormatElement[],
	locale: CatalogLocale,
	path: string,
): string[] {
	const issues: string[] = [];

	for (const element of elements) {
		if (isPluralElement(element)) {
			const pluralPath = `${path}.${element.value}`;
			const categories = new Set(
				new Intl.PluralRules(locale, {
					type: element.pluralType,
				}).resolvedOptions().pluralCategories,
			);
			const namedSelectors = Object.keys(element.options).filter(
				(selector) => !selector.startsWith("="),
			);

			if (!element.options.other) {
				issues.push(`${pluralPath}: plural case "other" is required`);
			}
			for (const selector of namedSelectors) {
				if (!categories.has(selector as Intl.LDMLPluralRule)) {
					issues.push(
						`${pluralPath}: plural case "${selector}" is invalid for ${locale}`,
					);
				}
			}
			if (REQUIRE_EVERY_PLURAL_CATEGORY.has(locale)) {
				for (const category of categories) {
					if (!element.options[category]) {
						issues.push(
							`${pluralPath}: plural case "${category}" is required for ${locale}`,
						);
					}
				}
			}

			for (const [selector, option] of Object.entries(element.options)) {
				issues.push(
					...validatePluralCategories(
						option.value,
						locale,
						`${pluralPath}.${selector}`,
					),
				);
			}
		} else if (isSelectElement(element)) {
			for (const [selector, option] of Object.entries(element.options)) {
				issues.push(
					...validatePluralCategories(
						option.value,
						locale,
						`${path}.${element.value}.${selector}`,
					),
				);
			}
		} else if (isTagElement(element)) {
			issues.push(
				...validatePluralCategories(
					element.children,
					locale,
					`${path}.<${element.value}>`,
				),
			);
		}
	}

	return issues;
}

function validateLocaleRegistry(): string[] {
	const issues: string[] = [];
	const sourceLocales = catalogLocales.filter(
		(locale) => getLocaleDefinition(locale).role === "source",
	);

	if (new Set(catalogLocales).size !== catalogLocales.length) {
		issues.push("locale registry: duplicate catalog locale");
	}
	if (
		appleAppStoreLocales.length !== 50 ||
		new Set(appleAppStoreLocales).size !== appleAppStoreLocales.length
	) {
		issues.push("Apple App Store locale matrix must contain 50 unique entries");
	}
	if (sourceLocales.length !== 1 || sourceLocales[0] !== defaultLocale) {
		issues.push(`locale registry: ${defaultLocale} must be the only source locale`);
	}

	for (const locale of catalogLocales) {
		const definition = getLocaleDefinition(locale);
		try {
			if (Intl.getCanonicalLocales(locale)[0] !== locale) {
				issues.push(`${locale}: locale identifier is not canonical`);
			}
		} catch {
			issues.push(`${locale}: invalid locale identifier`);
		}

		if (definition.role !== "pseudo" && !isAppleAppStoreLocale(locale)) {
			issues.push(`${locale}: locale is outside the Apple App Store matrix`);
		}
		if (definition.role === "pseudo" && definition.release === "public") {
			issues.push(`${locale}: pseudo-locales cannot be public`);
		}
		if (
			definition.release === "public" &&
			definition.reviewState !== "source" &&
			definition.reviewState !== "approved"
		) {
			issues.push(`${locale}: public locale must be approved`);
		}
		if (definition.script === "Arab" && definition.dir !== "rtl") {
			issues.push(`${locale}: Arabic script requires rtl direction`);
		}
		if (definition.dir === "rtl" && definition.font !== "arabic") {
			issues.push(`${locale}: rtl locale requires an rtl-capable font profile`);
		}

		if (definition.fallback !== null) {
			if (!catalogLocales.includes(definition.fallback as CatalogLocale)) {
				issues.push(`${locale}: fallback ${definition.fallback} is not registered`);
			} else if (definition.role === "overlay") {
				const sourceLanguage = new Intl.Locale(locale).language;
				const fallbackLanguage = new Intl.Locale(
					definition.fallback,
				).language;
				if (sourceLanguage !== fallbackLanguage) {
					issues.push(`${locale}: regional overlay must use a same-language fallback`);
				}
			}
		}

		const visited = new Set<CatalogLocale>([locale]);
		let fallback = definition.fallback;
		while (fallback && catalogLocales.includes(fallback as CatalogLocale)) {
			const fallbackLocale = fallback as CatalogLocale;
			if (visited.has(fallbackLocale)) {
				issues.push(`${locale}: locale fallback cycle detected`);
				break;
			}
			visited.add(fallbackLocale);
			fallback = getLocaleDefinition(fallbackLocale).fallback;
		}
	}

	for (const locale of publicLocales) {
		if (getLocaleDefinition(locale).release !== "public") {
			issues.push(`${locale}: public locale registry state is inconsistent`);
		}
	}

	return issues;
}

function validateOverlays(): string[] {
	const issues: string[] = [];

	for (const locale of variantLocales) {
		const overlay = flattenCatalog(getCatalogOverlay(locale));
		const fallbackLocale = getCatalogOverlayFallback(locale);
		const fallback = flattenCatalog(getCatalogMessages(fallbackLocale));
		const overlayKeys = Object.keys(overlay);
		if (getLocaleDefinition(locale).fallback !== fallbackLocale) {
			issues.push(`${locale}: overlay loader and registry fallbacks differ`);
		}

		if (overlayKeys.length === 0) {
			issues.push(`${locale}: regional overlay must contain at least one override`);
		}

		for (const key of overlayKeys) {
			const message = overlay[key];
			const fallbackMessage = fallback[key];
			if (fallbackMessage === undefined) {
				issues.push(`${locale}:${key}: overlay key does not exist in ${fallbackLocale}`);
				continue;
			}
			if (!message.trim()) {
				issues.push(`${locale}:${key}: overlay message is empty`);
				continue;
			}
			if (message === fallbackMessage) {
				issues.push(`${locale}:${key}: redundant regional override`);
			}

			try {
				const sourceAst = parse(fallbackMessage);
				const translatedAst = parse(message);
				if (!isStructurallySame(sourceAst, translatedAst).success) {
					issues.push(`${locale}:${key}: ICU arguments differ from ${fallbackLocale}`);
				}
				for (const issue of compareIcuSemantics(sourceAst, translatedAst)) {
					issues.push(`${locale}:${key}: ${issue}`);
				}
				issues.push(
					...validatePluralCategories(translatedAst, locale, `${locale}:${key}`),
				);

				const sourceTokens = extractProtectedTokens(fallbackMessage).sort();
				const translatedTokens = extractProtectedTokens(message).sort();
				if (JSON.stringify(sourceTokens) !== JSON.stringify(translatedTokens)) {
					issues.push(`${locale}:${key}: protected tokens changed`);
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				issues.push(`${locale}:${key}: invalid ICU message (${reason})`);
			}
		}
	}

	return issues;
}

function validateCatalogCoverage(
	sourceCatalog: FlatCatalog,
	sourceKeys: string[],
): string[] {
	const issues: string[] = [];

	for (const locale of [...translationLocales, ...variantLocales]) {
		const catalog = flattenCatalog(getCatalogMessages(locale));
		for (const key of NON_TRANSLATABLE_KEYS) {
			if (catalog[key] !== sourceCatalog[key]) {
				issues.push(`${locale}:${key}: locale-neutral value changed`);
			}
		}
	}

	for (const locale of translationLocales) {
		const catalog = flattenCatalog(getCatalogMessages(locale));
		const translatableKeys = sourceKeys.filter(
			(key) => !NON_TRANSLATABLE_KEYS.has(key),
		);
		const identicalCount = translatableKeys.filter(
			(key) => catalog[key] === sourceCatalog[key],
		).length;
		const identicalRatio = identicalCount / translatableKeys.length;

		if (identicalRatio > MAX_FULL_CATALOG_SOURCE_EQUALITY_RATIO) {
			issues.push(
				`${locale}: ${(identicalRatio * 100).toFixed(1)}% of translatable messages still match ${defaultLocale}`,
			);
		}
	}

	return issues;
}

function validatePluralRendering(): string[] {
	const issues: string[] = [];
	const candidates = [
		0, 1, 2, 3, 4, 5, 10, 11, 20, 21, 100, 101, 1_000, 1_000_000,
		0.1, 1.1, 2.1,
	];

	for (const locale of catalogLocales) {
		const rules = new Intl.PluralRules(locale);
		const samples = new Map<Intl.LDMLPluralRule, number>();
		for (const candidate of candidates) {
			const category = rules.select(candidate);
			if (!samples.has(category)) samples.set(category, candidate);
		}

		for (const category of rules.resolvedOptions().pluralCategories) {
			if (!samples.has(category)) {
				issues.push(`${locale}: no plural smoke-test sample for ${category}`);
			}
		}

		const translate = createTranslator({
			locale,
			messages: getTypedCatalogMessages(locale),
		});
		for (const [category, hours] of samples) {
			try {
				const rendered = translate("Auth.forgotPassword.expiryHelp", {
					hours,
				});
				if (!rendered.trim()) {
					issues.push(`${locale}: ${category} plural rendered an empty message`);
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				issues.push(`${locale}: ${category} plural failed to render (${reason})`);
			}
		}
	}

	return issues;
}

export function validateCatalogs(): string[] {
	const issues: string[] = [];
	const sourceCatalog = flattenCatalog(getCatalogMessages(defaultLocale));
	const sourceKeys = Object.keys(sourceCatalog).sort();

	issues.push(...validateLocaleRegistry());
	issues.push(...validateOverlays());

	for (const locale of catalogLocales) {
		const catalog = flattenCatalog(getCatalogMessages(locale));
		const catalogKeys = Object.keys(catalog).sort();

		if (JSON.stringify(catalogKeys) !== JSON.stringify(sourceKeys)) {
			const missing = sourceKeys.filter((key) => !catalogKeys.includes(key));
			const unexpected = catalogKeys.filter((key) => !sourceKeys.includes(key));
			issues.push(
				`${locale}: key mismatch (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"})`,
			);
		}

		for (const key of catalogKeys) {
			const message = catalog[key];
			if (!message.trim()) {
				issues.push(`${locale}:${key}: message is empty`);
				continue;
			}

			try {
				const translatedAst = parse(message);
				const sourceMessage = sourceCatalog[key];
				if (sourceMessage === undefined) continue;
				const sourceAst = parse(sourceMessage);

				const structuralResult = isStructurallySame(
					sourceAst,
					translatedAst,
				);
				if (!structuralResult.success) {
					issues.push(
						`${locale}:${key}: ICU arguments differ from ${defaultLocale}`,
					);
				}

				for (const issue of compareIcuSemantics(
					sourceAst,
					translatedAst,
				)) {
					issues.push(`${locale}:${key}: ${issue}`);
				}
				issues.push(
					...validatePluralCategories(
						translatedAst,
						locale,
						`${locale}:${key}`,
					),
				);

				const sourceProtectedTokens =
					extractProtectedTokens(sourceMessage).sort();
				const translatedProtectedTokens =
					extractProtectedTokens(message).sort();
				if (
					JSON.stringify(sourceProtectedTokens) !==
					JSON.stringify(translatedProtectedTokens)
				) {
					issues.push(`${locale}:${key}: protected tokens changed`);
				}

				if (getLocaleDefinition(locale).dir === "rtl") {
					for (const argument of ["provider", "email"]) {
						if (
							sourceMessage.includes(`{${argument}}`) &&
							!message.includes(`\u2068{${argument}}\u2069`)
						) {
							issues.push(
								`${locale}:${key}: ${argument} must use bidi isolation`,
							);
						}
					}
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				issues.push(`${locale}:${key}: invalid ICU message (${reason})`);
			}
		}
	}

	issues.push(...validateCatalogCoverage(sourceCatalog, sourceKeys));
	issues.push(...validatePluralRendering());

	const pseudoCatalog = flattenCatalog(getCatalogMessages("en-XA"));
	const placeholderKey = "Auth.forgotPassword.successDescription";
	const pseudoPlaceholderMessage = pseudoCatalog[placeholderKey];
	if (
		!pseudoPlaceholderMessage.includes("{email}") ||
		pseudoPlaceholderMessage === sourceCatalog[placeholderKey] ||
		!/^⟦.*~~~⟧$/.test(pseudoPlaceholderMessage)
	) {
		issues.push(
			"en-XA: pseudo-localisation must expand messages without changing placeholders",
		);
	}

	const translatePseudo = createTranslator({
		locale: defaultLocale,
		messages: getCatalogMessages("en-XA"),
	});
	const singular = translatePseudo("Auth.forgotPassword.expiryHelp", {
		hours: 1,
	});
	const plural = translatePseudo("Auth.forgotPassword.expiryHelp", {
		hours: 2,
	});
	if (!singular.includes("1") || !plural.includes("2") || singular === plural) {
		issues.push("en-XA: plural branches must render for one and other values");
	}

	issues.push(...validatePseudoLocalizer());
	issues.push(...validateSemanticComparator());

	return issues;
}

function validatePseudoLocalizer(): string[] {
	const issues: string[] = [];
	const syntheticMessage =
		"Read <link>Phaseo docs</link> via {method, select, sso {SSO} email {support@example.com} other {the API}} in {hours, plural, one {# hour} other {# hours}}.";
	const first = pseudoLocalizeMessage(syntheticMessage);
	const second = pseudoLocalizeMessage(syntheticMessage);
	const structuralResult = isStructurallySame(
		parse(syntheticMessage),
		parse(first),
	);
	const semanticIssues = compareIcuSemantics(
		parse(syntheticMessage),
		parse(first),
	);

	if (first !== second) {
		issues.push("en-XA: pseudo-localisation must be deterministic");
	}
	if (!structuralResult.success) {
		issues.push("en-XA: pseudo-localisation changed rich ICU structure");
	}
	if (semanticIssues.length > 0) {
		issues.push("en-XA: pseudo-localisation changed rich ICU semantics");
	}
	if (
		!first.includes("<link>") ||
		!first.includes("</link>") ||
		!first.includes("Phaseo") ||
		!first.includes("SSO") ||
		!first.includes("support@example.com")
	) {
		issues.push("en-XA: pseudo-localisation changed a protected token");
	}
	if (
		extractProtectedTokens("compte associé").length !== 0 ||
		JSON.stringify(extractProtectedTokens("Phaseo Gateway SSO")) !==
			JSON.stringify(["Phaseo", "Gateway", "SSO"])
	) {
		issues.push("validator: protected terms require whole-token boundaries");
	}
	if (first.includes(" hour") || first.includes(" hours")) {
		issues.push("en-XA: pseudo-localisation skipped plural branch text");
	}
	if (first.length < syntheticMessage.length * 1.3) {
		issues.push("en-XA: pseudo-localisation expansion is below 30%");
	}

	const sourceCatalog = { nested: { message: syntheticMessage } };
	const sourceSnapshot = JSON.stringify(sourceCatalog);
	const localizedCatalog = pseudoLocalizeMessages(sourceCatalog);
	if (
		JSON.stringify(sourceCatalog) !== sourceSnapshot ||
		localizedCatalog === sourceCatalog ||
		localizedCatalog.nested === sourceCatalog.nested
	) {
		issues.push("en-XA: pseudo-localisation mutated its source catalog");
	}

	return issues;
}

function validateSemanticComparator(): string[] {
	const issues: string[] = [];
	const rejectedCases = [
		{
			name: "renamed select case",
			source: "{role, select, admin {Admin} other {User}}",
			translated: "{role, select, owner {Owner} other {User}}",
		},
		{
			name: "changed plural offset",
			source: "{count, plural, one {# item} other {# items}}",
			translated:
				"{count, plural, offset:1 one {# item} other {# items}}",
		},
		{
			name: "changed number style",
			source: "{amount, number, ::currency/USD}",
			translated: "{amount, number, ::currency/EUR}",
		},
	] as const;

	for (const testCase of rejectedCases) {
		if (
			compareIcuSemantics(
				parse(testCase.source),
				parse(testCase.translated),
			).length === 0
		) {
			issues.push(
				`validator: failed to reject a ${testCase.name}`,
			);
		}
	}

	const pluralSource = "{count, plural, one {# item} other {# items}}";
	const pluralWithLocaleSpecificCase =
		"{count, plural, zero {No articles} one {# article} other {# articles}}";
	if (
		compareIcuSemantics(
			parse(pluralSource),
			parse(pluralWithLocaleSpecificCase),
		).length > 0
	) {
		issues.push(
			"validator: rejected a valid locale-specific plural case",
		);
	}

	return issues;
}

export function assertValidCatalogs(): void {
	const issues = validateCatalogs();
	if (issues.length > 0) {
		throw new Error(`Localisation validation failed:\n- ${issues.join("\n- ")}`);
	}
}
