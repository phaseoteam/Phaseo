"use client";
import { useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UnsavedChangesGuard } from "@/components/(data)/UnsavedChangesGuard";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

type Row = Record<string, unknown>;
type Field = { key: string; label: string; type: string; required?: boolean; options?: string[]; reference?: string; immutable?: boolean; default?: unknown };
type Registry = { title: string; keys: string[]; fields: Field[] };
async function request<T>(path: string, body?: unknown): Promise<T> {
  return fetchAccountWebApi<T>(`/api/account/models/catalog/registries${path}`, await getBrowserAccessToken(), body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
}
function rowLabel(row: Row): string { return String(row.name ?? row.display_name ?? row.provider_model_slug ?? row.feature_name ?? row.meter_key ?? row.variant_key ?? row.region_code ?? row.plan_id ?? "Record"); }
function ReferenceSelect({ field, value, disabled, onChange }: { field: Field; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows: Row[] = [];
      for (let page = 1; ; page++) {
        const result = await request<{ rows: Row[]; count: number }>(`/${field.reference}?page=${page}`);
        rows.push(...result.rows);
        if (rows.length >= result.count || !result.rows.length) break;
      }
      const keys: Record<string, string> = { organisations: "lab_slug", providers: "provider_slug", routes: "provider_model_id", regions: "provider_region_id", "service-tiers": "service_tier_slug", plans: "plan_uuid" };
      if (!cancelled) setOptions(rows.map((row) => ({ value: String(row[keys[field.reference!]]), label: `${rowLabel(row)}${row.provider_slug ? ` · ${row.provider_slug}` : ""}` })));
    })().catch(() => { if (!cancelled) setError("Could not load choices. Reload to retry."); });
    return () => { cancelled = true; };
  }, [field.reference]);
  return <><SearchableSelect label={field.label} id={field.key} value={value} disabled={disabled} options={[...(!field.required ? [{ value: "", label: "None" }] : []), ...options, ...(value && !options.some((option) => option.value === value) ? [{ value, label: value }] : [])]} onValueChange={onChange} />{error ? <p role="alert">{error}</p> : null}</>;
}
export function RegistryEditor() {
  const [resource, setResource] = useQueryState("collection", { defaultValue: "families" });
  const [registries, setRegistries] = useState<Record<string, Registry>>({});
  const [listing, setListing] = useState<{ resource: string; rows: Row[]; count: number }>({ resource: "", rows: [], count: 0 });
  const rows = listing.resource === resource ? listing.rows : [];
  const count = listing.resource === resource ? listing.count : 0;
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [before, setBefore] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [draftResource, setDraftResource] = useState(resource);
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const registry = registries[resource];
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  useEffect(() => { void request<{ registries: Record<string, Registry> }>("").then((result) => setRegistries(result.registries)).catch((e) => setError(String(e))); }, []);
  useEffect(() => { setDraft(null); setBefore(null); setBaseline(""); }, [resource]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void request<{ rows: Row[]; count: number }>(`/${encodeURIComponent(resource)}?page=${page}&q=${encodeURIComponent(search)}`).then((result) => { if (!cancelled) { setListing({ resource, rows: result.rows, count: result.count }); setError(""); } }).catch((e) => { if (!cancelled) setError(String(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [resource, page, search, revision]);
  const canLeave = () => !saving && (!dirty || window.confirm("Discard unsaved changes?"));
  const edit = (row: Row | null) => {
    if (!registry || !canLeave()) return;
    const values = Object.fromEntries(registry.fields.map((field) => { const value = row ? row[field.key] : field.type === "uuid" ? crypto.randomUUID() : field.default ?? null; return [field.key, field.type === "json" ? JSON.stringify(value ?? {}, null, 2) : value]; }));
    setDraftResource(resource); setBefore(row); setDraft(values); setBaseline(JSON.stringify(values)); setError("");
  };
  const save = async () => {
    if (!registry || !draft || draftResource !== resource) return;
    setSaving(true); setError("");
    try {
      const values = Object.fromEntries(registry.fields.map((field) => [field.key, field.type === "json" ? JSON.parse(String(draft[field.key] || "{}")) : draft[field.key]]));
      const result = await request<{ row: Row }>(`/${resource}`, { values, before });
      const saved = Object.fromEntries(registry.fields.map((field) => [field.key, field.type === "json" ? JSON.stringify(result.row[field.key] ?? {}, null, 2) : result.row[field.key] ?? null]));
      setDraft(saved); setBefore(result.row); setBaseline(JSON.stringify(saved)); setRevision((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };
  return <div className="space-y-6">
    <UnsavedChangesGuard dirty={dirty} saving={saving} />
    <div><h1 className="text-2xl font-semibold">Catalog settings</h1><p className="mt-1 text-sm text-muted-foreground">Reference data shared across models and providers.</p></div>
    <div className="flex flex-wrap gap-2" aria-label="Reference collections">{Object.entries(registries).map(([key, value]) => <Button key={key} variant={resource === key ? "secondary" : "ghost"} onClick={() => { if (canLeave()) { setDraft(null); setBefore(null); setPage(1); setSearch(""); setQuery(""); void setResource(key); } }}>{value.title}</Button>)}</div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-8 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
      <section className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{registry?.title}</h2><Button onClick={() => edit(null)} disabled={!registry}>Add</Button></div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(query); }}><Input aria-label="Search records" placeholder="Search records…" value={query} onChange={(e) => setQuery(e.target.value)} /><Button variant="outline">Search</Button></form>
        <div className="max-h-[60vh] divide-y overflow-y-auto">{loading ? <p className="py-4 text-sm text-muted-foreground">Loading…</p> : rows.map((row) => <button type="button" key={registry?.keys.map((key) => String(row[key])).join(":")} className="block w-full py-3 text-left hover:bg-muted/50" onClick={() => edit(row)}><span className="block text-sm font-medium">{rowLabel(row)}</span><span className="block truncate text-xs text-muted-foreground">{row.status ? String(row.status) : registry?.keys.map((key) => String(row[key])).join(" · ")}</span></button>)}{!loading && !rows.length ? <p className="py-4 text-sm text-muted-foreground">No records found.</p> : null}</div>
        <div className="flex items-center justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">{page} / {Math.max(1, Math.ceil(count / 100))}</span><Button variant="outline" disabled={page * 100 >= count} onClick={() => setPage(page + 1)}>Next</Button></div>
      </section>
      <section>{draft && registry && draftResource === resource ? <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h2 className="font-semibold">{before ? rowLabel(before) : "New record"}</h2>
        <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">{registry.fields.map((field) => {
          const value = draft[field.key]; const disabled = saving || (!!before && (field.immutable || registry.keys.includes(field.key)));
          const update = (next: unknown) => setDraft((current) => ({ ...current, [field.key]: next }));
          const choices = [...(field.options ?? []), ...(value && !field.options?.includes(String(value)) ? [String(value)] : [])];
          return <div key={field.key} className={field.type === "json" ? "sm:col-span-2" : ""}><label htmlFor={field.key} className="mb-1.5 block text-sm font-medium">{field.label}</label>{field.reference ? <ReferenceSelect field={field} value={String(value ?? "")} disabled={disabled} onChange={(next) => update(next || null)} /> : field.options ? <SearchableSelect label={field.label} id={field.key} value={String(value ?? "")} disabled={disabled} options={[...(!field.required ? [{ value: "", label: "None" }] : []), ...choices.map((v) => ({ value: v, label: v }))]} onValueChange={(next) => update(next || null)} /> : field.type === "boolean" ? <input id={field.key} type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => update(e.target.checked)} /> : field.type === "json" ? <Textarea id={field.key} value={String(value ?? "{}")} disabled={disabled} className="font-mono text-xs" rows={4} onChange={(e) => update(e.target.value)} /> : <Input id={field.key} required={field.required} disabled={disabled} type={field.type === "number" ? "number" : field.type === "url" ? "url" : field.type === "datetime" ? "datetime-local" : "text"} step="any" min={field.type === "number" ? 0 : undefined} value={field.type === "datetime" && value ? String(value).slice(0, 16) : String(value ?? "")} onChange={(e) => update(e.target.value === "" ? null : field.type === "number" ? Number(e.target.value) : field.type === "datetime" ? `${e.target.value.slice(0, 16)}:00Z` : e.target.value)} />}</div>;
        })}</fieldset>
        <div className="sticky bottom-0 flex gap-3 border-t bg-background py-4"><Button disabled={saving}>{saving ? "Saving…" : "Save"}</Button><Button type="button" variant="ghost" onClick={() => { if (canLeave()) setDraft(null); }}>Close</Button></div>
      </form> : <p className="py-8 text-sm text-muted-foreground">Select a record to edit, or add a new one.</p>}</section>
    </div>
  </div>;
}
