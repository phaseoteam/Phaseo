import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import {
	parse,
	TYPE,
	type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

const WEB_ROOT = join(__dirname, "..", "..");
const SOURCE_ROOT = join(WEB_ROOT, "src");
const MESSAGES_ROOT = join(WEB_ROOT, "messages");

type RichCall = {
	location: string;
	key: string;
	tags: string[];
};

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return listSourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

function loadCatalogs(): Map<string, Record<string, unknown>> {
	const catalogs = new Map<string, Record<string, unknown>>();
	for (const locale of readdirSync(MESSAGES_ROOT)) {
		const directory = join(MESSAGES_ROOT, locale);
		if (!statSync(directory).isDirectory()) continue;
		const catalog: Record<string, unknown> = {};
		for (const filename of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
			Object.assign(catalog, JSON.parse(readFileSync(join(directory, filename), "utf8")));
		}
		catalogs.set(locale, catalog);
	}
	return catalogs;
}

function lookup(catalog: Record<string, unknown>, key: string): unknown {
	return key.split(".").reduce<unknown>(
		(node, part) =>
			node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
		catalog,
	);
}

function collectTags(elements: MessageFormatElement[], tags = new Set<string>()): Set<string> {
	for (const element of elements) {
		if (element.type === TYPE.tag) {
			tags.add(element.value);
			collectTags(element.children, tags);
		} else if (element.type === TYPE.plural || element.type === TYPE.select) {
			for (const option of Object.values(element.options)) collectTags(option.value, tags);
		}
	}
	return tags;
}

function translatorNamespace(initializer: ts.Expression, tree: ts.SourceFile): string | null {
	const call = ts.isAwaitExpression(initializer) ? initializer.expression : initializer;
	if (!ts.isCallExpression(call)) return null;
	if (!["useTranslations", "getTranslations"].includes(call.expression.getText(tree))) return null;
	const [argument] = call.arguments;
	if (!argument) return "";
	if (ts.isStringLiteral(argument)) return argument.text;
	if (ts.isObjectLiteralExpression(argument)) {
		const namespace = argument.properties.find(
			(property) => property.name?.getText(tree) === "namespace",
		);
		if (!namespace) return "";
		if (ts.isPropertyAssignment(namespace) && ts.isStringLiteral(namespace.initializer)) {
			return namespace.initializer.text;
		}
	}
	return null;
}

// Finds `t.rich("key", { tag: (chunks) => ... })` calls whose translator and
// key are static, and records which values are tag callbacks.
function findRichCalls(): RichCall[] {
	const calls: RichCall[] = [];
	for (const file of listSourceFiles(SOURCE_ROOT)) {
		const text = readFileSync(file, "utf8");
		if (!text.includes(".rich(")) continue;
		const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const namespaces = new Map<string, string>();
		const findTranslators = (node: ts.Node) => {
			if (ts.isVariableDeclaration(node) && node.initializer) {
				const namespace = translatorNamespace(node.initializer, tree);
				if (namespace !== null) namespaces.set(node.name.getText(tree), namespace);
			}
			ts.forEachChild(node, findTranslators);
		};
		findTranslators(tree);
		const visit = (node: ts.Node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				node.expression.name.text === "rich"
			) {
				const namespace = namespaces.get(node.expression.expression.getText(tree));
				const [keyArgument, valuesArgument] = node.arguments;
				if (
					namespace !== undefined &&
					keyArgument &&
					(ts.isStringLiteral(keyArgument) || ts.isNoSubstitutionTemplateLiteral(keyArgument)) &&
					valuesArgument &&
					ts.isObjectLiteralExpression(valuesArgument)
				) {
					const tags = valuesArgument.properties.flatMap((property) =>
						ts.isPropertyAssignment(property) &&
						(ts.isArrowFunction(property.initializer) ||
							ts.isFunctionExpression(property.initializer))
							? [property.name.getText(tree).replace(/^["']|["']$/g, "")]
							: [],
					);
					const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
					calls.push({
						location: `${relative(WEB_ROOT, file).replaceAll("\\", "/")}:${line}`,
						key: [namespace, keyArgument.text].filter(Boolean).join("."),
						tags,
					});
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(tree);
	}
	return calls;
}

describe("rich text messages", () => {
	const calls = findRichCalls();
	const catalogs = loadCatalogs();

	it("finds the static rich text calls in the app", () => {
		expect(calls.length).toBeGreaterThan(20);
		expect(calls).toContainEqual(
			expect.objectContaining({
				key: "Catalogue.models.detail.statusBanner.rumouredDescription",
				tags: ["discord"],
			}),
		);
	});

	// A tag callback passed for a plain {placeholder} renders a function as a
	// React child. On a partially prerendered page that error left the response
	// streaming until the function timed out.
	it("defines a matching tag for every tag callback in every locale", () => {
		const problems: string[] = [];
		for (const call of calls) {
			for (const [locale, catalog] of catalogs) {
				const message = lookup(catalog, call.key);
				if (typeof message !== "string") continue;
				let tags: Set<string>;
				try {
					tags = collectTags(parse(message));
				} catch (error) {
					problems.push(`${call.location} ${locale} ${call.key}: ${String(error)}`);
					continue;
				}
				for (const tag of call.tags) {
					if (!tags.has(tag)) {
						problems.push(`${call.location} ${locale} ${call.key}: missing <${tag}>`);
					}
				}
			}
		}
		expect(problems).toEqual([]);
	});
});
