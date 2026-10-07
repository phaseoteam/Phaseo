"use client";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ProviderManagedCatalog } from "@/app/(dashboard)/settings/account/providers/actions";

export default function ProviderCatalogChanges({ catalog, modelId, disabled, onRevert }: { catalog: ProviderManagedCatalog; modelId: string; disabled: boolean; onRevert: (field: string) => void }) {
	const t = useTranslations("SettingsUI.providerDashboard");
	const fields = useTranslations("SettingsUI.providerCatalogCopy");
	const locale = useLocale();
	const overrides = catalog.overrides?.[modelId] ?? {};
	const feed = catalog.feed_models?.find((model) => model.id === modelId);
	const date = (value: string) => new Date(value).toLocaleString(locale);
	const value = (item: unknown) => JSON.stringify(item ?? null, null, 2);
	const fieldLabels: Record<string, string> = { name: fields("modelName"), description: fields("description"), providerModelSlug: fields("providerModelID"), inputModalities: fields("inputModalities"), outputModalities: fields("outputModalities"), contextLength: fields("contextLength"), maxOutputTokens: fields("maxOutputTokens"), availability: fields("availability"), availableFrom: fields("availableFrom"), deprecatedAt: fields("deprecatedAt"), shutdownAt: fields("shutdownAt"), capabilities: fields("capabilities"), pricing: fields("pricing"), serviceTiers: t("tiers"), $model: t("manual"), $removed: fields("notListed"), $catalog: fields("catalog") };
	return <div className="space-y-4">
		{catalog.source.last_success_at ? <p className="text-xs text-muted-foreground">{t("lastSuccess")} · {date(catalog.source.last_success_at)}</p> : null}
		{Object.entries(overrides).length ? <section className="divide-y rounded-lg border">
			<h3 className="px-4 py-3 text-sm font-medium">{t("overrides")}</h3>
			{Object.entries(overrides).map(([field, edit]) => <details key={field} className="px-4 py-3 text-sm">
				<summary className="cursor-pointer">{fieldLabels[field] ?? field} · {edit.actor_name || t(edit.actor_kind)} · {date(edit.edited_at)}</summary>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					<div><p className="mb-2 text-xs text-muted-foreground">{t("feedValue")}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{value(feed?.[field])}</pre></div>
					<div><p className="mb-2 text-xs text-muted-foreground">{t("effectiveValue")}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{value(edit.value)}</pre></div>
				</div>
				<Button variant="outline" size="sm" className="mt-3" disabled={disabled} onClick={() => onRevert(field)}>{field === "$model" ? fields("remove") : t("useFeedValue")}</Button>
			</details>)}
		</section> : null}
		<details className="rounded-lg border px-4 py-3 text-sm">
			<summary className="cursor-pointer font-medium">{t("activity")}</summary>
			<div className="mt-3 divide-y">{catalog.activity?.length ? catalog.activity.map((event) => <details key={event.id} className="py-3">
				<summary className="cursor-pointer">{event.model_slug} · {fieldLabels[event.field] ?? event.field} · {t(event.action)} · {event.actor_name || t(event.actor_kind)} · {date(event.created_at)}</summary>
				<pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{value({ before: event.previous_value, after: event.value })}</pre>
			</details>) : <p className="py-3 text-muted-foreground">{t("noEdits")}</p>}</div>
		</details>
	</div>;
}
