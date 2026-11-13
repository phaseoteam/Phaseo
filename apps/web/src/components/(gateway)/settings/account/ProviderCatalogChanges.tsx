import { useLocale, useTranslations } from "@/i18n/react";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fetchProviderCatalogEditEventAction, type ProviderManagedCatalog } from "@/features/settings/account/providers/actions";
import { nanosToUsd } from "@/lib/providerPricing";

function pathParts(field: string) { return field.startsWith("/") ? field.split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~")) : [field]; }
function feedValue(feed: Record<string, unknown> | undefined, field: string): unknown {
	let current: any = feed;
	for (const part of pathParts(field)) {
		if (current == null) return null;
		if (part === "$rate") return { priceNanos: current.priceNanos, unitQuantity: current.unitQuantity, unit: current.unit, displayUnit: current.displayUnit };
		current = Array.isArray(current) ? current.find((item) => (item.meterKey ?? item.serviceTier) === part) : current[part];
	}
	return current;
}
function displayValue(value: unknown, field: string) {
	if (pathParts(field).at(-1) === "$rate" && value && typeof value === "object") {
		const rate = value as { priceNanos: number; unitQuantity: number; unit: string };
		return JSON.stringify({ USD: nanosToUsd(rate.priceNanos), quantity: rate.unitQuantity, unit: rate.unit }, null, 2);
	}
	return JSON.stringify(value ?? null, null, 2);
}

function ActivityEvent({ providerSlug, event, label }: { providerSlug: string; event: ProviderManagedCatalog["activity"][number]; label: string }) {
	const t = useTranslations("SettingsUI.providerDashboard");
	const tc = useTranslations("SettingsUI.providerCatalogCopy");
	const locale = useLocale();
	const [data, setData] = useState<{ previous_value: unknown; value: unknown } | null>(null);
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(false);
	async function load() {
		if (data || loading) return;
		setLoading(true); setError(false);
		try { setData(await fetchProviderCatalogEditEventAction({ data: { providerSlug, eventId: event.id } })); }
		catch { setError(true); }
		finally { setLoading(false); }
	}
	return <Collapsible className="py-3" onOpenChange={(open) => { if (open) void load(); }}>
		<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-1.5 text-left"><ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" /><span className="min-w-0">{event.model_slug} · {label} · {t(event.action)} · {t(event.actor_kind)}{event.actor_name ? ` · ${event.actor_name}` : ""} · {new Date(event.created_at).toLocaleString(locale)}</span></CollapsibleTrigger>
		<CollapsibleContent hiddenUntilFound>{data ? <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{displayValue(data.previous_value, event.field)}{"\n→\n"}{displayValue(data.value, event.field)}</pre> : error ? <p role="alert">{t("statusUnavailable")}</p> : loading ? <p role="status">{tc("loading")}</p> : null}</CollapsibleContent>
	</Collapsible>;
}

export default function ProviderCatalogChanges({ catalog, modelId, disabled, onRevert }: { catalog: ProviderManagedCatalog; modelId: string; disabled: boolean; onRevert: (field: string, modelId?: string) => void }) {
	const t = useTranslations("SettingsUI.providerDashboard");
	const fields = useTranslations("SettingsUI.providerCatalogCopy");
	const rateLimits = useTranslations("SettingsUI.providerRateLimits");
	const locale = useLocale();
	const overrides = catalog.overrides?.[modelId] ?? {};
	const feed = catalog.feed_models?.find((model) => model.id === modelId);
	const date = (value: string) => new Date(value).toLocaleString(locale);
	const fieldLabels: Record<string, string> = { name: fields("modelName"), description: fields("description"), providerModelSlug: fields("providerModelID"), inputModalities: fields("inputModalities"), outputModalities: fields("outputModalities"), contextLength: fields("contextLength"), maxOutputTokens: fields("maxOutputTokens"), availability: fields("availability"), availableFrom: fields("availableFrom"), deprecatedAt: fields("deprecatedAt"), shutdownAt: fields("shutdownAt"), capabilities: fields("capabilities"), pricing: fields("pricing"), serviceTiers: t("tiers"), $model: t("manual"), $removed: fields("notListed"), $catalog: fields("catalog"), $rate_limits: rateLimits("title"), $rate: fields("price"), upstreamServiceTier: fields("upstreamTier"), displayLabel: fields("displayName"), displayUnit: fields("displayUnit") };
	const label = (field: string) => pathParts(field).map((part) => fieldLabels[part] ?? part).join(" · ");
	return <div className="space-y-4">
		{catalog.source.last_success_at ? <p className="text-xs text-muted-foreground">{t("lastSuccess")} · {date(catalog.source.last_success_at)}</p> : null}
		{Object.entries(catalog.overrides ?? {}).filter(([, edits]) => edits.$removed?.value === true).map(([id, edits]) => <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"><span>{id} · {fields("notListed")} · {edits.$removed.actor_name || t(edits.$removed.actor_kind)}</span><Button variant="outline" size="sm" disabled={disabled} onClick={() => onRevert("$removed", id)}>{t("useFeedValue")}</Button></div>)}
		{Object.entries(overrides).length ? <section className="divide-y rounded-lg border">
			<h3 className="px-4 py-3 text-sm font-medium">{t("overrides")}</h3>
			{Object.entries(overrides).map(([field, edit]) => <Collapsible key={field} className="px-4 py-3 text-sm">
				<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-1.5 text-left"><ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" /><span className="min-w-0">{label(field)} · {t(edit.actor_kind)}{edit.actor_name ? ` · ${edit.actor_name}` : ""} · {date(edit.edited_at)}</span></CollapsibleTrigger>
				<CollapsibleContent hiddenUntilFound>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					<div><p className="mb-2 text-xs text-muted-foreground">{t("feedValue")}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{displayValue(feedValue(feed, field), field)}</pre></div>
					<div><p className="mb-2 text-xs text-muted-foreground">{t("effectiveValue")}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{displayValue(edit.value, field)}</pre></div>
				</div>
				<Button variant="outline" size="sm" className="mt-3" disabled={disabled || (["name", "description", "inputModalities", "outputModalities", "contextLength", "maxOutputTokens", "availableFrom", "deprecatedAt", "shutdownAt"].includes(field) && !catalog.permissions?.can_edit_model_metadata)} onClick={() => onRevert(field)}>{field === "$model" && !feed ? fields("remove") : t("useFeedValue")}</Button>
				</CollapsibleContent>
			</Collapsible>)}
		</section> : null}
		<Collapsible className="rounded-lg border px-4 py-3 text-sm">
			<CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-1.5 text-left font-medium"><ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />{t("activity")}</CollapsibleTrigger>
			<CollapsibleContent hiddenUntilFound className="mt-3 divide-y">{catalog.activity?.length ? catalog.activity.map((event) => <ActivityEvent key={event.id} providerSlug={catalog.provider.provider_slug} event={event} label={label(event.field)} />) : <p className="py-3 text-muted-foreground">{t("noEdits")}</p>}</CollapsibleContent>
		</Collapsible>
	</div>;
}
