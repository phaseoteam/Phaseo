// src/lib/shiki.ts
import { cache } from "react";
import {
    codeToTokensWithThemes,
    createHighlighter,
    bundledThemes,
    bundledLanguages,
    type Highlighter,
} from "shiki";
import { transformerColorizedBrackets } from "@shikijs/colorized-brackets";

const LIGHT = "github-light" as const;
const DARK = "github-dark" as const;

export type ShikiLang =
    | "bash"
    | "ts"
    | "python"
    | "json"
    | "go"
    | "csharp"
    | "php"
    | "ruby"
    | "rust"
    | "cpp"
    | "diff";
export type ShikiTheme = typeof LIGHT | typeof DARK;

export const getShikiHighlighter = cache(async (): Promise<Highlighter> => {
    return createHighlighter({
        themes: [bundledThemes[LIGHT], bundledThemes[DARK]],
        langs: [
            bundledLanguages.bash,
            bundledLanguages.ts,
            bundledLanguages.python,
            bundledLanguages.json,
            bundledLanguages.go,
            bundledLanguages.csharp,
            bundledLanguages.php,
            bundledLanguages.ruby,
            bundledLanguages.rust,
            bundledLanguages.cpp,
            bundledLanguages.diff,
        ],
    });
});

// Single-theme render with colourised brackets
export async function codeToHtml(
    code: string,
    lang: ShikiLang,
    theme: ShikiTheme
) {
    const highlighter = await getShikiHighlighter();
    return highlighter.codeToHtml(code, {
        lang,
        theme,
        transformers: [
            transformerColorizedBrackets(),
        ],

    });
}

// Pre-render both light & dark (used by your CodeBlock)
export async function codeToHtmlBoth(code: string, lang: ShikiLang) {
    const [light, dark] = await Promise.all([
        codeToHtml(code, lang, LIGHT),
        codeToHtml(code, lang, DARK),
    ]);
    return { light, dark };
}

export async function codeToTokensBoth(code: string, lang: ShikiLang) {
    return codeToTokensWithThemes(code, {
        lang,
        themes: {
            light: LIGHT,
            dark: DARK,
        },
    });
}

export type CodeTokensWithThemesResult = Awaited<ReturnType<typeof codeToTokensBoth>>;
