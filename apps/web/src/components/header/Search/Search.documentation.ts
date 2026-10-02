import type { RuntimeLocale } from "@/i18n/routing";
import type { PaletteItem } from "./Search.types";

const loaders = {
	"en-GB": () => import("./Search.docs.generated.json"),
	"es-ES": () => import("./Search.docs.es-ES.generated.json"),
	"fr-FR": () => import("./Search.docs.fr-FR.generated.json"),
	"de-DE": () => import("./Search.docs.de-DE.generated.json"),
	"pt-BR": () => import("./Search.docs.pt-BR.generated.json"),
	ja: () => import("./Search.docs.ja.generated.json"),
	"zh-Hans": () => import("./Search.docs.zh-Hans.generated.json"),
	hi: () => import("./Search.docs.hi.generated.json"),
	"ar-SA": () => import("./Search.docs.ar-SA.generated.json"),
};

export async function loadDocumentationPages(locale: RuntimeLocale): Promise<PaletteItem[]> {
	const catalogLocale = locale === "en-US" || locale === "en-XA" ? "en-GB" : locale;
	return (await loaders[catalogLocale]()).default;
}
