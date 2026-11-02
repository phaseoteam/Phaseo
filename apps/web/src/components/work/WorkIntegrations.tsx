"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createWorkApiKey, createWorkWebhook, deleteWorkWebhook, getWorkIntegrations, revokeWorkApiKey, updateWorkWebhook } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { WORK_PUBLIC_ORIGIN } from "@/lib/work/snippets";
import type { WorkApiKey, WorkWebhook } from "@/lib/work/types";
import { useWorkAction } from "./useWorkAction";
import { CopyBlock, useRelativeTime } from "./WorkBits";

function apiExample(token: string): string {
	return [
		`curl ${WORK_PUBLIC_ORIGIN}/api/_web/work/v1/items?state=open \\`,
		`  -H "authorization: Bearer ${token}"`,
		``,
		`curl -X POST ${WORK_PUBLIC_ORIGIN}/api/_web/work/v1/items \\`,
		`  -H "authorization: Bearer ${token}" -H "content-type: application/json" \\`,
		`  -d '{"title": "Nightly build failed", "priority": 2, "labels": ["ci"]}'`,
	].join("\n");
}

const VERIFY_EXAMPLE = [
	"// X-Phaseo-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>",
	"const [t, v1] = header.split(\",\").map((part) => part.split(\"=\")[1]);",
	"const expected = createHmac(\"sha256\", secret).update(`${t}.${rawBody}`).digest(\"hex\");",
	"const valid = timingSafeEqual(Buffer.from(v1, \"hex\"), Buffer.from(expected, \"hex\")) && Date.now() / 1000 - Number(t) < 300;",
].join("\n");

/** Work API keys and webhooks, in Work settings. Read for members; owners and admins change them. */
export function WorkIntegrationsSection() {
	const t = useTranslations("Work.integrations");
	const tCommon = useTranslations("Work.common");
	const relative = useRelativeTime();
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [state, setState] = useState<{ keys: WorkApiKey[]; webhooks: WorkWebhook[]; canManage: boolean } | null>(null);
	const [failed, setFailed] = useState(false);
	const [secret, setSecret] = useState<{ kind: "key" | "webhook"; value: string } | null>(null);
	const [keyName, setKeyName] = useState("");
	const [keyAccess, setKeyAccess] = useState<"read" | "write">("read");
	const [hookUrl, setHookUrl] = useState("");

	const load = useCallback(async () => {
		const result = await getWorkIntegrations();
		if (result.ok) { setState({ keys: result.keys, webhooks: result.webhooks, canManage: result.canManage }); setFailed(false); } else setFailed(true);
	}, []);
	useEffect(() => { void load(); }, [load]);

	const act = async (key: string, task: () => Promise<{ ok: boolean }>) => {
		const result = await perform(key, task as never, { refresh: false });
		if ((result as { ok: boolean }).ok) await load();
		return result;
	};
	const addKey = async (event: FormEvent) => {
		event.preventDefault();
		if (!keyName.trim()) return;
		const result = await perform("key", () => createWorkApiKey({ name: keyName.trim(), access: keyAccess }), { refresh: false });
		if (result.ok) { setSecret({ kind: "key", value: result.token }); setKeyName(""); await load(); }
	};
	const addHook = async (event: FormEvent) => {
		event.preventDefault();
		if (!hookUrl.trim()) return;
		const result = await perform("hook", () => createWorkWebhook({ url: hookUrl.trim() }), { refresh: false });
		if (result.ok) { setSecret({ kind: "webhook", value: result.secret }); setHookUrl(""); await load(); }
	};

	return (
		<section aria-labelledby={`${id}-title`} className="space-y-3">
			<div className="space-y-0.5 border-b pb-2">
				<h3 id={`${id}-title`} className="text-sm font-semibold">{t("title")}</h3>
				<p className="text-sm text-muted-foreground">{t("description")}</p>
			</div>
			{failed ? <Callout tone="critical">{t("loadFailed")}</Callout> : null}
			{!state ? (failed ? null : <p className="text-xs text-muted-foreground">{t("loading")}</p>) : (
				<>
					{state.canManage ? null : <Callout tone="info">{t("readOnly")}</Callout>}
					{secret ? (
						<div className="space-y-3 rounded-md border p-4">
							<div className="flex items-start justify-between gap-3">
								<Callout tone="warning" role="status" className="flex-1">{t("secretOnce")}</Callout>
								<Button type="button" variant="ghost" size="icon-sm" aria-label={tCommon("cancel")} onClick={() => setSecret(null)}><X aria-hidden="true" /></Button>
							</div>
							{secret.kind === "key" ? (
								<>
									<CopyBlock label={t("apiKey")} value={secret.value} />
									<CopyBlock label={t("apiExample")} value={apiExample(secret.value)} multiline />
								</>
							) : (
								<>
									<CopyBlock label={t("signingSecret")} value={secret.value} />
									<CopyBlock label={t("verifyExample")} value={VERIFY_EXAMPLE} multiline />
								</>
							)}
						</div>
					) : null}

					<div className="space-y-2">
						<p className="text-sm font-medium">{t("keysTitle")}</p>
						<p className="text-xs text-muted-foreground">{t("keysHint")}</p>
						{state.keys.length ? (
							<ul className="divide-y rounded-md border text-sm">
								{state.keys.map((key) => (
									<li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
										<span className="min-w-0 flex-1 truncate font-medium">{key.name}</span>
										<span className="font-mono text-xs text-muted-foreground">{key.keyPrefix}…</span>
										<span className="text-xs text-muted-foreground">{t(`access.${key.access}`)}</span>
										<span className="text-xs text-muted-foreground">{key.revokedAt ? t("revoked") : key.lastUsedAt ? t("lastUsed", { time: relative(key.lastUsedAt) }) : t("neverUsed")}</span>
										{state.canManage && !key.revokedAt ? (
											<Button type="button" size="xs" variant="ghost" disabled={busy !== null}
												onClick={() => { if (window.confirm(t("revokeConfirm", { name: key.name }))) void act("revoke", () => revokeWorkApiKey(key.id)); }}>
												{t("revoke")}
											</Button>
										) : null}
									</li>
								))}
							</ul>
						) : null}
						{state.canManage ? (
							<form onSubmit={addKey} className="flex flex-wrap items-end gap-2">
								<div className="min-w-48 flex-1 sm:max-w-xs">
									<Label htmlFor={`${id}-key-name`} className="sr-only">{t("keyName")}</Label>
									<Input id={`${id}-key-name`} value={keyName} maxLength={80} placeholder={t("keyNamePlaceholder")} onChange={(event) => setKeyName(event.target.value)} className="h-8 rounded-md text-sm" />
								</div>
								<Select value={keyAccess} onValueChange={(value) => setKeyAccess(value as "read" | "write")}>
									<SelectTrigger size="sm" aria-label={t("accessLabel")} className="w-36 rounded-md"><SelectValue>{t(`access.${keyAccess}`)}</SelectValue></SelectTrigger>
									<SelectContent>
										<SelectItem value="read">{t("access.read")}</SelectItem>
										<SelectItem value="write">{t("access.write")}</SelectItem>
									</SelectContent>
								</Select>
								<Button type="submit" size="sm" disabled={busy !== null || !keyName.trim()}>{t("createKey")}</Button>
							</form>
						) : null}
					</div>

					<div className="space-y-2">
						<p className="text-sm font-medium">{t("webhooksTitle")}</p>
						<p className="text-xs text-muted-foreground">{t("webhooksHint")}</p>
						{state.webhooks.length ? (
							<ul className="divide-y rounded-md border text-sm">
								{state.webhooks.map((hook) => (
									<li key={hook.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
										<span className="min-w-0 flex-1 truncate font-mono text-xs">{hook.url}</span>
										<span className="text-xs text-muted-foreground">
											{hook.lastDeliveryAt ? t("lastDelivery", { status: hook.lastStatus ?? t("noAnswer"), time: relative(hook.lastDeliveryAt) }) : t("noDeliveries")}
										</span>
										{!hook.enabled && hook.failureCount > 0 ? <span className="text-xs text-amber-700 dark:text-amber-300">{t("turnedOff", { count: hook.failureCount })}</span> : null}
										<label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
											<Switch size="sm" checked={hook.enabled} disabled={busy !== null || !state.canManage} onCheckedChange={(enabled) => void act("hook-toggle", () => updateWorkWebhook(hook.id, { enabled: Boolean(enabled) }))} />
											{tCommon("enabled")}
										</label>
										{state.canManage ? (
											<Button type="button" size="xs" variant="ghost" disabled={busy !== null}
												onClick={() => { if (window.confirm(t("deleteWebhookConfirm"))) void act("hook-delete", () => deleteWorkWebhook(hook.id)); }}>
												{tCommon("delete")}
											</Button>
										) : null}
									</li>
								))}
							</ul>
						) : null}
						{state.canManage ? (
							<form onSubmit={addHook} className="flex flex-wrap items-end gap-2">
								<div className="min-w-64 flex-1">
									<Label htmlFor={`${id}-hook-url`} className="sr-only">{t("webhookUrl")}</Label>
									<Input id={`${id}-hook-url`} type="url" value={hookUrl} placeholder="https://hooks.example.com/phaseo" onChange={(event) => setHookUrl(event.target.value)} className="h-8 rounded-md font-mono text-xs" />
								</div>
								<Button type="submit" size="sm" disabled={busy !== null || !hookUrl.trim()}>{t("addWebhook")}</Button>
							</form>
						) : null}
					</div>
				</>
			)}
		</section>
	);
}
