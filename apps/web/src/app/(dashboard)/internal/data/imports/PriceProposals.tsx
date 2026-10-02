"use client";
import { localizedInternalCatalogError } from "@/i18n/internal-catalog-errors";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";
type Proposal = { proposal_id: string; source_url: string; created_at: string; route: { model_slug: string; provider_slug: string; provider_model_slug: string }; expected_sku: { display_name?: string; currency: string } | null; sku: { currency: string; meters: Array<{ meter_key: string; display_label: string; price_nanos: number; unit_quantity: number; unit: string }> } };
export function PriceProposals() {
  const tx = useTranslations();
  const locale = useLocale();
  const [rows, setRows] = useState<Proposal[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { const result = await fetchAccountWebApi<{ rows: Proposal[] }>("/api/account/models/catalog/price-proposals", await getBrowserAccessToken()); setRows(result.rows); setError(""); } catch (e) { setError(localizedInternalCatalogError(e, tx, "Common.ui.pricingEditorCopy.loadPriceProposalsFailed")); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const decide = async (row: Proposal, accept: boolean) => {
    if (accept && !window.confirm(tx("Common.ui.pricingEditorCopy.publishThesePricesForModelExistingPricesWillBeRetainedAsAnEndedVersion", { model: row.route.model_slug }))) return;
    setBusy(row.proposal_id); setError("");
    try { await fetchAccountWebApi(`/api/account/models/catalog/price-proposals/${row.proposal_id}`, await getBrowserAccessToken(), { method: "POST", body: JSON.stringify({ accept }) }); await load(); }
    catch (e) { setError(localizedInternalCatalogError(e, tx, "Common.ui.pricingEditorCopy.reviewPriceProposalFailed")); } finally { setBusy(null); }
  };
  return <div className="space-y-6"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{tx("Common.ui.pricingEditorCopy.providerUpdates" as never)}</h1><p className="mt-1 text-sm text-muted-foreground">{tx("Common.ui.pricingEditorCopy.reviewProposedPricesBeforePublishingExistingPricesRemainInHistory" as never)}</p></div><Button variant="outline" onClick={() => void load()}>{tx("SettingsUI.strings.Refresh" as never)}</Button></div>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {loading ? <p>{tx("Common.ui.auditDataTable.loading" as never)}</p> : !rows.length ? <p className="text-sm text-muted-foreground">{tx("Common.ui.pricingEditorCopy.noPendingPriceUpdates" as never)}</p> : rows.map((row) => <section key={row.proposal_id} className="space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{row.route.model_slug}</h2><p className="text-sm text-muted-foreground">{row.route.provider_slug} · {row.expected_sku ? tx("Common.ui.pricingEditorCopy.priceRevision" as never) : tx("Common.ui.pricingEditorCopy.newPriceGroup" as never)}</p></div><Link className="text-sm underline" href={`/internal/data/models/edit/${row.route.model_slug}?tab=pricing`}>{tx("Common.ui.pricingEditorCopy.viewCurrentPricing" as never)}</Link></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">{tx("Common.search.palette.navigationItems.nav-settings-usage" as never)}</th><th>{tx("Common.ui.pricingEditorCopy.proposedPrice" as never)}</th><th>{tx("Common.ui.pricingEditorCopy.per" as never)}</th></tr></thead><tbody>{row.sku.meters.map((meter) => <tr key={meter.meter_key}><td className="py-2">{tx.has(("Catalogue.modelDetail.pricing.meters." + meter.meter_key) as never) ? tx(("Catalogue.modelDetail.pricing.meters." + meter.meter_key) as never) : meter.display_label}</td><td>{new Intl.NumberFormat(locale, { style: "currency", currency: row.sku.currency, maximumFractionDigits: 9 }).format(meter.price_nanos / 1e9)}</td><td>{meter.unit_quantity.toLocaleString(locale)} {tx.has(("Catalogue.modelDetail.pricing." + (meter.unit_quantity === 1 ? "unitsSingular." : "units.") + meter.unit) as never) ? tx(("Catalogue.modelDetail.pricing." + (meter.unit_quantity === 1 ? "unitsSingular." : "units.") + meter.unit) as never) : meter.unit}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy !== null} onClick={() => void decide(row, true)}>{tx("Common.ui.pricingEditorCopy.acceptPrices" as never)}</Button><Button variant="outline" disabled={busy !== null} onClick={() => void decide(row, false)}>{tx("SettingsUI.credits.dismiss" as never)}</Button>{/^https?:\/\//.test(row.source_url) ? <a className="text-sm underline" href={row.source_url} target="_blank" rel="noreferrer">{tx("Common.ui.modelEditor.advanced.benchmarks.source" as never)}</a> : null}</div>
    </section>)}{rows.length === 100 ? <p className="text-sm text-muted-foreground">{tx("Common.ui.pricingEditorCopy.showingTheOldest100UpdatesReviewTheseToSeeTheNextBatch" as never)}</p> : null}
  </div>;
}
