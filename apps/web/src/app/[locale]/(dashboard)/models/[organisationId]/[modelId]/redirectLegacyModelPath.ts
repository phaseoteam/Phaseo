import { permanentRedirect } from "next/navigation";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { type PublicLocale } from "@/i18n/routing";
import { localizePublicPath } from "@/lib/auth/localized-paths";

export type LegacySearchParams = Record<
	string,
	string | string[] | undefined
>;

export function getLegacyModelRedirectPath(
	canonicalModelId: string,
	locale: PublicLocale,
	searchParams: LegacySearchParams,
): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams)) {
		if (Array.isArray(value)) {
			for (const item of value) query.append(key, item);
		} else if (value != null) {
			query.set(key, value);
		}
	}
	const queryString = query.toString();
	const modelPath = localizePublicPath(locale, getModelPath(canonicalModelId));
	return `${modelPath}${queryString ? `?${queryString}` : ""}`;
}

export async function redirectLegacyModelPath(
	params: Promise<ModelRouteParams & { locale: PublicLocale }>,
	searchParams?: Promise<LegacySearchParams>,
): Promise<never> {
	const [{ canonicalModelId }, routeParams, resolvedSearchParams] = await Promise.all([
		params.then((value) => resolveModelRouteIds(value, false)),
		params,
		searchParams ?? Promise.resolve<LegacySearchParams>({}),
	]);
	permanentRedirect(
		getLegacyModelRedirectPath(
			canonicalModelId,
			routeParams.locale,
			resolvedSearchParams,
		),
	);
}
