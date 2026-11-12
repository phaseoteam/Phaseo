import { useLocale, useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import { getLocalizedDocsHref } from "@/lib/docs";
import {
	getParameterDocsHref,
	getParameterReference,
	getParameterReferenceTranslationKey,
} from "@/lib/parameters/reference";
import { normalizeParameterSpecs, type ParameterSpec, type ParameterSpecs, type ParameterValue } from "@/lib/models/modelParameters";
import { cn } from "@/lib/utils";
import {
	HoverCard,
	HoverCardContent,
	HoverCardHeader,
	HoverCardNote,
	HoverCardRows,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { prettifyParamName } from "@/components/(data)/model/pricing/ProviderModelParameters";

/** How many accepted values the card lists before "+N more". */
const MAX_LISTED_VALUES = 6;

/**
 * One spec per parameter across a provider's routes: the first route that
 * documents a parameter as supported wins, so the card describes a route that
 * really accepts it.
 */
export function mergeRouteParameterSpecs(routeParams: ReadonlyArray<unknown>): ParameterSpecs {
	const merged: ParameterSpecs = {};
	for (const params of routeParams) {
		for (const [name, spec] of Object.entries(normalizeParameterSpecs(params))) {
			if (!merged[name] || (!merged[name].supported && spec.supported)) merged[name] = spec;
		}
	}
	return merged;
}

function formatValue(value: ParameterValue): string {
	return typeof value === "string" ? value : String(value);
}

/** "0–2", "≥ 1" or "≤ 4096", from the spec's bounds. */
export function formatParameterRange(spec: Pick<ParameterSpec, "min" | "max">, locale: string): string | null {
	const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
	const hasMin = typeof spec.min === "number" && Number.isFinite(spec.min);
	const hasMax = typeof spec.max === "number" && Number.isFinite(spec.max);
	if (hasMin && hasMax) return `${format(spec.min!)}–${format(spec.max!)}`;
	if (hasMin) return `≥ ${format(spec.min!)}`;
	if (hasMax) return `≤ ${format(spec.max!)}`;
	return null;
}

/**
 * A parameter chip that links to the parameter's docs. Its card gives the
 * parameter's type and default, then, when the route documents it, the range,
 * accepted values, provider default and support level. The provider's own
 * field names and values are never shown.
 */
export function ParameterHoverChip({ param, spec = null }: { param: string; spec?: ParameterSpec | null }) {
	const locale = useLocale();
	const tQuickstart = useTranslations("Catalogue.models.detail.quickstart");
	const tCard = useTranslations("Catalogue.hoverCards");
	const reference = getParameterReference(param);
	const descriptionKey = getParameterReferenceTranslationKey(param);
	const docsHref = getLocalizedDocsHref(locale, getParameterDocsHref(param));
	const referenceDefault =
		reference.defaultValue === "Provider specific"
			? tQuickstart("defaultProviderSpecific")
			: reference.defaultValue === "Unset"
				? tQuickstart("defaultUnset")
				: reference.defaultValue;
	const values = spec?.values ?? [];
	const listedValues = values.slice(0, MAX_LISTED_VALUES).map(formatValue).join(", ");
	const hiddenValues = values.length - Math.min(values.length, MAX_LISTED_VALUES);
	const supportLevel = spec?.support_level
		? spec.support_level === "native"
			? tCard("supportNative")
			: spec.support_level === "emulated"
				? tCard("supportEmulated")
				: spec.support_level.replace(/[_-]+/g, " ")
		: null;
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<Link
					href={docsHref}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={tCard("parameterDocs", { param })}
					className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
				>
					{prettifyParamName(param)}
				</Link>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-72 space-y-2.5">
				<HoverCardHeader
					title={<code className="font-mono text-[13px]">{param}</code>}
					// Parameters outside the reference come back as "-"; skip those placeholders.
					meta={[
						reference.type && reference.type !== "-" ? reference.type : null,
						referenceDefault && referenceDefault !== "-" ? `${tQuickstart("defaultLabel")} ${referenceDefault}` : null,
					]}
				/>
				<HoverCardNote>{tQuickstart(`parameterDescriptions.${descriptionKey}` as never)}</HoverCardNote>
				{spec ? (
					<HoverCardRows
						rows={[
							{ key: "range", label: tCard("rowRange"), value: formatParameterRange(spec, locale) },
							values.length
								? {
										key: "values",
										label: tCard("rowValues"),
										value: (
											<span className={cn("font-mono text-[11px]", "break-words")}>
												{listedValues}
												{hiddenValues > 0 ? ` ${tCard("moreValues", { count: hiddenValues })}` : ""}
											</span>
										),
									}
								: null,
							spec.default !== undefined ? { key: "default", label: tCard("rowPhaseoDefault"), value: formatValue(spec.default) } : null,
							spec.provider_default !== undefined
								? { key: "providerDefault", label: tCard("rowProviderDefault"), value: formatValue(spec.provider_default) }
								: null,
							supportLevel ? { key: "support", label: tCard("rowSupport"), value: supportLevel } : null,
						]}
					/>
				) : null}
			</HoverCardContent>
		</HoverCard>
	);
}
