import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import {
	parse,
	TYPE,
	type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { getPublicMessages } from "./messages";
import { defaultLocale, publicLocales } from "./routing";

const WEB_ROOT = join(__dirname, "..", "..");
const SOURCE_ROOT = join(WEB_ROOT, "src");

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

function lookup(catalog: object, key: string): unknown {
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

function isFunction(node: ts.Node | undefined): boolean {
	if (!node) return false;
	if (ts.isParenthesizedExpression(node)) return isFunction(node.expression);
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function returnedExpression(body: ts.ConciseBody): ts.Expression | undefined {
	return ts.isBlock(body) ? body.statements.find(ts.isReturnStatement)?.expression : body;
}

// Finds `t.rich("key", { tag: (chunks) => ... })` calls whose translator and
// key are static, and records which values are tag callbacks. A value built by
// a local helper that returns a function, such as `link(model)` for
// `const link = (model) => (chunks) => <Link … />`, counts as a callback too.
function findRichCalls(): RichCall[] {
	const calls: RichCall[] = [];
	for (const file of listSourceFiles(SOURCE_ROOT)) {
		const text = readFileSync(file, "utf8");
		if (!text.includes(".rich(")) continue;
		const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const namespaces = new Map<string, string>();
		const callbackFactories = new Set<string>();
		const findTranslators = (node: ts.Node) => {
			if (ts.isVariableDeclaration(node) && node.initializer) {
				const namespace = translatorNamespace(node.initializer, tree);
				if (namespace !== null) namespaces.set(node.name.getText(tree), namespace);
				if (
					(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
					isFunction(returnedExpression(node.initializer.body))
				) {
					callbackFactories.add(node.name.getText(tree));
				}
			}
			if (ts.isFunctionDeclaration(node) && node.name && node.body && isFunction(returnedExpression(node.body))) {
				callbackFactories.add(node.name.text);
			}
			ts.forEachChild(node, findTranslators);
		};
		findTranslators(tree);
		const isTagCallback = (value: ts.Expression) =>
			isFunction(value) ||
			(ts.isCallExpression(value) &&
				ts.isIdentifier(value.expression) &&
				callbackFactories.has(value.expression.text));
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
						ts.isPropertyAssignment(property) && isTagCallback(property.initializer)
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

	it("finds the static rich text calls in the app", () => {
		expect(calls.length).toBeGreaterThan(20);
		expect(calls).toContainEqual(
			expect.objectContaining({
				key: "Catalogue.models.detail.statusBanner.rumouredDescription",
				tags: ["discord"],
			}),
		);
	});

	it("resolves every static rich text key in the source messages", async () => {
		const source = await getPublicMessages(defaultLocale);
		const unresolved = calls
			.filter((call) => typeof lookup(source, call.key) !== "string")
			.map((call) => `${call.location} ${call.key}`);
		expect(unresolved).toEqual([]);
	});

	// A tag callback passed for a plain {placeholder} renders a function as a
	// React child. On a partially prerendered page that error left the response
	// streaming until the function timed out.
	it("defines a matching tag for every tag callback in every locale", async () => {
		const problems: string[] = [];
		for (const locale of publicLocales) {
			const catalog = await getPublicMessages(locale);
			for (const call of calls) {
				const message = lookup(catalog, call.key);
				if (typeof message !== "string") {
					problems.push(`${call.location} ${locale} ${call.key}: no message`);
					continue;
				}
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
