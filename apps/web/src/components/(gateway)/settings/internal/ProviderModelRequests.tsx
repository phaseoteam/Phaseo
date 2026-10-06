"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { reviewProviderModelRequestAction, refreshProviderModelRequestsAction } from "@/app/(dashboard)/settings/internal/provider-review/actions";
import type { ProviderModelRequest } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";

export default function ProviderModelRequests({ initialRequests }: {initialRequests:ProviderModelRequest[]}) {
  const t=useTranslations("SettingsUI.providerReviewCopy");
  const catalogT=useTranslations("SettingsUI.providerCatalogCopy");
  const locale=useLocale();
  const [requests,setRequests]=React.useState(initialRequests);
  const [reasons,setReasons]=React.useState<Record<string,string>>({});
  const [saving,setSaving]=React.useState<string|null>(null);
  async function review(request:ProviderModelRequest,decision:"approved"|"rejected"|"needs_changes") {
    if(decision!=="approved" && !reasons[request.id]?.trim()) {toast.error(t("current.changesReason"));return;}
    setSaving(request.id);
    try {await reviewProviderModelRequestAction({requestId:request.id,decision,reason:reasons[request.id],expectedUpdatedAt:request.updated_at});setRequests(await refreshProviderModelRequestsAction());}
    catch {toast.error(t("current.updateFailed"));}
    finally {setSaving(null);}
  }
  return <section className="space-y-4 border-t border-border pt-6">
    <h2 className="text-lg font-semibold">{t("current.catalogClaims")}</h2><p className="text-sm text-muted-foreground">{t("current.catalogClaimsHelp")}</p>
    {!requests.length ? <p className="text-sm text-muted-foreground">{t("current.noPendingClaims")}</p> : requests.map(request=><article key={request.id} className="space-y-3 rounded-lg border border-border p-4">
      <div><h3 className="break-words font-medium">{request.model.name}</h3><p className="break-all font-mono text-xs text-muted-foreground">{request.model_slug} · {request.provider_slug}</p></div>
      {request.model.description ? <p className="break-words text-sm">{request.model.description}</p> : null}
      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div><dt>{catalogT("inputModalities")}</dt><dd>{request.model.inputModalities.join(", ")}</dd></div>
        <div><dt>{catalogT("outputModalities")}</dt><dd>{request.model.outputModalities.join(", ")}</dd></div>
        {request.model.contextLength ? <div><dt>{catalogT("contextLength")}</dt><dd>{request.model.contextLength.toLocaleString(locale)}</dd></div>:null}
        {request.model.maxOutputTokens ? <div><dt>{catalogT("maxOutputTokens")}</dt><dd>{request.model.maxOutputTokens.toLocaleString(locale)}</dd></div>:null}
      </dl>
      {request.reason ? <p className="text-sm">{request.reason}</p>:null}
      <Input aria-label={t("current.reviewReason")} placeholder={t("current.changesReason")} value={reasons[request.id]??""} onChange={event=>setReasons(current=>({...current,[request.id]:event.target.value}))}/>
      <div className="flex flex-wrap gap-2"><Button disabled={saving!==null} onClick={()=>void review(request,"approved")}>{t("approve")}</Button><Button variant="outline" disabled={saving!==null} onClick={()=>void review(request,"needs_changes")}>{t("requestChanges")}</Button><Button variant="outline" disabled={saving!==null} onClick={()=>void review(request,"rejected")}>{t("reject")}</Button></div>
    </article>)}
  </section>;
}
