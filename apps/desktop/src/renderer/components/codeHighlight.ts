import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const languages = {
	bash: () => import("shiki/langs/bash.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	typescript: () => import("shiki/langs/typescript.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	java: () => import("shiki/langs/java.mjs"),
	csharp: () => import("shiki/langs/csharp.mjs"),
	php: () => import("shiki/langs/php.mjs"),
	ruby: () => import("shiki/langs/ruby.mjs"),
	cpp: () => import("shiki/langs/cpp.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	rust: () => import("shiki/langs/rust.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
};
const aliases: Record<string, keyof typeof languages> = { js: "javascript", ts: "typescript", py: "python", sh: "bash", shell: "bash", zsh: "bash", yml: "yaml", md: "markdown", "c++": "cpp", "c#": "csharp" };
let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
export type CodeToken = { content: string; light?: string; dark?: string };

export async function highlightCode(text: string, language: string): Promise<CodeToken[][] | null> {
	const lang = Object.hasOwn(aliases, language) ? aliases[language] : language;
	if (!Object.hasOwn(languages, lang) || text.length > 50_000) return null;
	const lines = text.split("\n");
	if (lines.length > 1000 || lines.some(line => line.length > 4000)) return null;
	highlighter ??= createHighlighterCore({
		engine: createJavaScriptRegexEngine(),
		themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
		langs: [],
	});
	const engine = await highlighter;
	if (!engine.getLoadedLanguages().includes(lang)) await engine.loadLanguage(languages[lang as keyof typeof languages]());
	return engine.codeToTokensWithThemes(text, { lang, themes: { light: "github-light", dark: "github-dark" } }).map(line => line.map(token => ({ content: token.content, light: token.variants.light.color, dark: token.variants.dark.color })));
}
