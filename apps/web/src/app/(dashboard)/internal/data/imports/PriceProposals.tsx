"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";
type Proposal = { proposal_id: string; source_url: string; created_at: string; route: { model_slug: string; provider_slug: string; provider_model_slug: string }; expected_sku: { display_name?: string; currency: string } | null; sku: { currency: string; meters: Array<{ meter_key: string; display_label: string; price_nanos: number; unit_quantity: number; unit: string }> } };
export function PriceProposals() {
  const [rows, setRows] = useState<Proposal[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { const result = await fetchAccountWebApi<{ rows: Proposal[] }>("/api/account/models/catalog/price-proposals", await getBrowserAccessToken()); setRows(result.rows); setError(""); } catch (e) { setError(String(e)); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const decide = async (row: Proposal, accept: boolean) => {
    if (accept && !window.confirm(`Publish these prices for ${row.route.model_slug}? Existing prices will be retained as an ended version.`)) return;
    setBusy(row.proposal_id); setError("");
    try { await fetchAccountWebApi(`/api/account/models/catalog/price-proposals/${row.proposal_id}`, await getBrowserAccessToken(), { method: "POST", body: JSON.stringify({ accept }) }); await load(); }
    catch (e) { setError(String(e)); } finally { setBusy(null); }
  };
  return <div className="space-y-6"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Provider updates</h1><p className="mt-1 text-sm text-muted-foreground">Review proposed prices before publishing. Existing prices remain in history.</p></div><Button variant="outline" onClick={() => void load()}>Refresh</Button></div>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {loading ? <p>Loading…</p> : !rows.length ? <p className="text-sm text-muted-foreground">No pending price updates.</p> : rows.map((row) => <section key={row.proposal_id} className="space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{row.route.model_slug}</h2><p className="text-sm text-muted-foreground">{row.route.provider_slug} · {row.expected_sku ? "Price revision" : "New price group"}</p></div><Link className="text-sm underline" href={`/internal/data/models/edit/${row.route.model_slug}?tab=pricing`}>View current pricing</Link></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Usage</th><th>Proposed price</th><th>Per</th></tr></thead><tbody>{row.sku.meters.map((meter) => <tr key={meter.meter_key}><td className="py-2">{meter.display_label}</td><td>{row.sku.currency} {meter.price_nanos / 1e9}</td><td>{meter.unit_quantity.toLocaleString()} {meter.unit}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy !== null} onClick={() => void decide(row, true)}>Accept prices</Button><Button variant="outline" disabled={busy !== null} onClick={() => void decide(row, false)}>Dismiss</Button>{/^https?:\/\//.test(row.source_url) ? <a className="text-sm underline" href={row.source_url} target="_blank" rel="noreferrer">Source</a> : null}</div>
    </section>)}{rows.length === 100 ? <p className="text-sm text-muted-foreground">Showing the oldest 100 updates. Review these to see the next batch.</p> : null}
  </div>;
}
