"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { Pencil } from "lucide-react";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateApiKeyAction } from "@/app/(dashboard)/settings/keys/actions";
import { keyDetailHref } from "./keyDetailHref";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";

export function KeyNameHeading({ k, canManage }: { k: KeyDetailData["key"]; canManage: boolean }) {
	const router = useRouter();
	const invalidateSettings = useInvalidatePrivateSettings();
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(k.name);
	const [saving, setSaving] = useState(false);
	function cancel() { setName(k.name); setEditing(false); }
	async function save(event: FormEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) { toast.error("Key name is required."); return; }
		if (trimmed === k.name) { setEditing(false); return; }
		setSaving(true);
		try {
			await updateApiKeyAction(k.id, { name: trimmed });
			toast.success("Key renamed");
			setEditing(false);
			router.replace(keyDetailHref({ ...k, name: trimmed }));
			void invalidateSettings();
			router.refresh();
		} catch (error) { toast.error(error instanceof Error ? error.message : "Failed to rename key"); }
		finally { setSaving(false); }
	}
	if (editing) return <form onSubmit={save} className="flex flex-wrap items-center gap-2" onKeyDown={(event) => {
		if (event.key === "Escape" && !saving) { event.preventDefault(); cancel(); }
	}}>
		<Input autoFocus aria-label="Key name" value={name} onChange={(event) => setName(event.target.value)} disabled={saving} className="w-64 max-w-full text-xl font-semibold" />
		<Button size="sm" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
		<Button size="sm" variant="ghost" type="button" onClick={cancel} disabled={saving}>Cancel</Button>
	</form>;
	return <h1 className="min-w-0 truncate text-xl font-semibold">{canManage ? <button type="button" onClick={() => setEditing(true)} className="group flex max-w-full items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Rename ${k.name}`}>
		<span className="truncate">{k.name}</span><Pencil className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
	</button> : k.name}</h1>;
}
