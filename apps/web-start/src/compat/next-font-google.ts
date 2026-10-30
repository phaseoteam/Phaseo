// `next/font/google` on self-hosted Fontsource packages (see fonts.css).
// Each loader returns the same shape as Next: a className that applies the
// family and, when `variable` is set, a class that defines that CSS variable.
type FontOptions = { variable?: string; weight?: string | string[]; style?: string | string[]; subsets?: string[]; display?: string; preload?: boolean; fallback?: string[]; adjustFontFallback?: boolean };
type FontResult = { className: string; variable: string; style: { fontFamily: string } };

const FAMILIES: Record<string, string> = {
	Montserrat: "'Montserrat Variable'",
	Noto_Sans_Arabic: "'Noto Sans Arabic Variable'",
	Noto_Sans_Devanagari: "'Noto Sans Devanagari Variable'",
	Noto_Sans_JP: "'Noto Sans JP Variable'",
	Noto_Sans_SC: "'Noto Sans SC Variable'",
};

function loader(name: keyof typeof FAMILIES) {
	return (options: FontOptions = {}): FontResult => {
		const family = [FAMILIES[name], ...(options.fallback ?? ["ui-sans-serif", "system-ui", "sans-serif"])].join(", ");
		const slug = name.toLowerCase().replace(/_/g, "-");
		return {
			className: `font-family-${slug}`,
			// fonts.css defines `.font-variable-<slug>` to set the CSS variable
			// the app asks for (for example `--font-montserrat`).
			variable: options.variable ? `font-variable-${slug}` : "",
			style: { fontFamily: family },
		};
	};
}

export const Montserrat = loader("Montserrat");
export const Noto_Sans_Arabic = loader("Noto_Sans_Arabic");
export const Noto_Sans_Devanagari = loader("Noto_Sans_Devanagari");
export const Noto_Sans_JP = loader("Noto_Sans_JP");
export const Noto_Sans_SC = loader("Noto_Sans_SC");
