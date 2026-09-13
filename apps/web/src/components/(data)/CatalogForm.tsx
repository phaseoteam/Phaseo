"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import { useCatalogFormChanges } from "./useCatalogFormChanges";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CatalogForm({ action, children, className, submitLabel, backHref }: { action: (form: FormData) => Promise<void>; children: ReactNode; className?: string; submitLabel?: string; backHref?: string }) {
  const { attach: formRef, isDirty, markSaved } = useCatalogFormChanges();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      await action(data);
      markSaved();
      toast.success("Saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to save."); }
    finally { setSaving(false); }
  };
  return <form ref={formRef} onSubmit={submit} className={className} aria-busy={saving}>
    <UnsavedChangesGuard dirty={isDirty} saving={saving} />
    <fieldset disabled={saving} className="contents space-y-4">{children}</fieldset>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {submitLabel ? <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background/95 py-4 backdrop-blur-sm">
      <Button type="submit" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? "Saving…" : submitLabel}</Button>
      {backHref ? <Button variant="ghost" asChild><Link href={backHref}>Back</Link></Button> : null}
    </div> : null}
  </form>;
}
