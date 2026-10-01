"use client";

import * as React from "react";
import Image from "next/image";
import { BellRing, Globe2, Mail, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { localizedSettingsError } from "@/i18n/error-messages";
import { useTranslations } from "next-intl";

import { createNotificationDestination, deleteNotificationDestination, setBillingNotificationPreference, testNotificationConfiguration, testNotificationDestination } from "@/app/(dashboard)/settings/credits/actions";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { NotificationDestination, NotificationEventKind } from "@/lib/fetchers/internal/settingsTypes";
import { cn } from "@/lib/utils";
import NotificationRouteSelector from "./NotificationRouteSelector";

type DestinationType = NotificationDestination["type"];
type ProviderIconProps = { className?: string };
type ProviderDefinition = { type: DestinationType; name: string; placeholder: string; icon: React.ComponentType<ProviderIconProps>; color: string };
type LocalizedProvider = ProviderDefinition & { description: string; field: string };

function DiscordIcon({ className }: ProviderIconProps) {
	return <Image src="/social/discord.svg" alt="" width={24} height={19} className={className} />;
}

function SlackIcon({ className }: ProviderIconProps) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
			<path fill="#36C5F0" d="M5.1 14.4a2.1 2.1 0 1 1-2.1-2.1h2.1v2.1Zm1.05 0a2.1 2.1 0 0 1 4.2 0v5.25a2.1 2.1 0 1 1-4.2 0V14.4Z" />
			<path fill="#2EB67D" d="M9.6 5.1A2.1 2.1 0 1 1 11.7 3v2.1H9.6Zm0 1.05a2.1 2.1 0 0 1 0 4.2H4.35a2.1 2.1 0 1 1 0-4.2H9.6Z" />
			<path fill="#ECB22E" d="M18.9 9.6a2.1 2.1 0 1 1 2.1 2.1h-2.1V9.6Zm-1.05 0a2.1 2.1 0 0 1-4.2 0V4.35a2.1 2.1 0 1 1 4.2 0V9.6Z" />
			<path fill="#E01E5A" d="M14.4 18.9a2.1 2.1 0 1 1-2.1 2.1v-2.1h2.1Zm0-1.05a2.1 2.1 0 0 1 0-4.2h5.25a2.1 2.1 0 1 1 0 4.2H14.4Z" />
		</svg>
	);
}

function TeamsIcon({ className }: ProviderIconProps) {
	return <Image src="/logos/microsoft-teams.svg" alt="" width={24} height={25} className={className} />;
}

const providers: ProviderDefinition[] = [
	{ type: "email", name: "Email", placeholder: "alerts@company.com", icon: Mail, color: "text-emerald-500 bg-emerald-500/10" },
	{ type: "discord", name: "Discord", placeholder: "https://discord.com/channels/…", icon: DiscordIcon, color: "bg-[#5865F2]/10" },
	{ type: "discord_webhook", name: "Discord Webhook", placeholder: "https://discord.com/api/webhooks/…", icon: DiscordIcon, color: "bg-[#5865F2]/10" },
	{ type: "slack", name: "Slack", placeholder: "https://hooks.slack.com/services/…", icon: SlackIcon, color: "bg-background" },
	{ type: "microsoft_teams", name: "Microsoft Teams", placeholder: "https://…webhook.office.com/…", icon: TeamsIcon, color: "bg-[#6264A7]/10" },
	{ type: "custom_webhook", name: "Custom Webhook", placeholder: "https://api.company.com/phaseo", icon: Globe2, color: "text-cyan-500 bg-cyan-500/10" },
];


export default function NotificationDestinationsClient({ initialDestinations, initialModelDeprecationEnabled, initialNotificationRoutes }: { initialDestinations: NotificationDestination[]; initialModelDeprecationEnabled: boolean; initialNotificationRoutes: Partial<Record<NotificationEventKind, string[]>> }) {
	const t = useTranslations("SettingsUI");
	const localizedProviders = providers.map((provider) => {
		const key = "notificationCopy.providers." + provider.type;
		return {
			...provider,
			name: provider.type === "email" ? t("notificationCopy.emailName") : provider.type === "custom_webhook" ? t("notificationCopy.customWebhookName") : provider.name,
			description: t((key + ".description") as never),
			field: t((key + ".field") as never),
		};
	});
	const providerByType = new Map(localizedProviders.map((provider) => [provider.type, provider] as const));
	const s = (key: string, values?: Record<string, string>) => (t as unknown as (messageKey: string, messageValues?: Record<string, string>) => string)(`strings.${key}`, values);
	const [destinations, setDestinations] = React.useState(initialDestinations ?? []);
	const [modelDeprecationEnabled, setModelDeprecationEnabled] = React.useState(initialModelDeprecationEnabled);
	const [open, setOpen] = React.useState(false);
	const [selectedTypes, setSelectedTypes] = React.useState<DestinationType[]>([]);
	const [name, setName] = React.useState("");
	const [targets, setTargets] = React.useState<Partial<Record<DestinationType, string>>>({});
	const [emails, setEmails] = React.useState<string[]>([]);
	const [emailDraft, setEmailDraft] = React.useState("");
	const [discordBotToken, setDiscordBotToken] = React.useState("");
	const [discordMentions, setDiscordMentions] = React.useState<Partial<Record<"discord" | "discord_webhook", { userIds: string; roleIds: string }>>>({});
	const [slackMentions, setSlackMentions] = React.useState({ userIds: "", userGroupIds: "" });
	const [teamsMentionIds, setTeamsMentionIds] = React.useState("");
	const [saving, setSaving] = React.useState(false);
	const selectedProvider = selectedTypes.length === 1 ? providerByType.get(selectedTypes[0]!) : null;
	const SelectedProviderIcon = selectedProvider?.icon ?? BellRing;
	const configurationValid = selectedTypes.length > 0 && selectedTypes.every(isTypeConfigured);

	function resetSheet() { setName(""); setTargets({}); setEmails([]); setEmailDraft(""); setDiscordBotToken(""); setDiscordMentions({}); setSlackMentions({ userIds: "", userGroupIds: "" }); setTeamsMentionIds(""); setSelectedTypes([]); }
	function isTypeConfigured(type: DestinationType) { return type === "email" ? emails.length > 0 : type === "discord" ? Boolean(targets.discord?.trim() && discordBotToken.trim()) : Boolean(targets[type]?.trim()); }
	function mentionIds(type: "discord" | "discord_webhook", kind: "userIds" | "roleIds") { return String(discordMentions[type]?.[kind] ?? "").split(",").map((value) => value.trim()).filter(Boolean); }
	function targetForType(type: DestinationType) { return type === "email" ? JSON.stringify(emails) : type === "discord" ? JSON.stringify({ channelId: targets.discord?.trim(), botToken: discordBotToken.trim(), userIds: mentionIds("discord", "userIds"), roleIds: mentionIds("discord", "roleIds") }) : type === "discord_webhook" ? JSON.stringify({ url: String(targets.discord_webhook ?? "").trim(), userIds: mentionIds("discord_webhook", "userIds"), roleIds: mentionIds("discord_webhook", "roleIds") }) : type === "slack" ? JSON.stringify({ url: String(targets.slack ?? "").trim(), userIds: slackMentions.userIds.split(",").map((value) => value.trim()).filter(Boolean), userGroupIds: slackMentions.userGroupIds.split(",").map((value) => value.trim()).filter(Boolean) }) : type === "microsoft_teams" ? JSON.stringify({ url: String(targets.microsoft_teams ?? "").trim(), mentionIds: teamsMentionIds.split(",").map((value) => value.trim()).filter(Boolean) }) : String(targets[type] ?? "").trim(); }
	function discordMentionFields(type: "discord" | "discord_webhook") { return <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`${type}-user-ids`}>{s("Ping user IDs")} <span className="font-normal text-muted-foreground">({s("optional")})</span></Label><Input className="rounded-md" id={`${type}-user-ids`} value={discordMentions[type]?.userIds ?? ""} onChange={(event) => setDiscordMentions((current) => ({ ...current, [type]: { userIds: event.target.value, roleIds: current[type]?.roleIds ?? "" } }))} placeholder="123…, 456…" /></div><div className="space-y-2"><Label htmlFor={`${type}-role-ids`}>{s("Ping role IDs")} <span className="font-normal text-muted-foreground">({s("optional")})</span></Label><Input className="rounded-md" id={`${type}-role-ids`} value={discordMentions[type]?.roleIds ?? ""} onChange={(event) => setDiscordMentions((current) => ({ ...current, [type]: { userIds: current[type]?.userIds ?? "", roleIds: event.target.value } }))} placeholder="123…, 456…" /></div></div>; }
	function slackMentionFields() { return <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="slack-user-ids">{s("Ping user IDs")} <span className="font-normal text-muted-foreground">({s("optional")})</span></Label><Input className="rounded-md" id="slack-user-ids" value={slackMentions.userIds} onChange={(event) => setSlackMentions((current) => ({ ...current, userIds: event.target.value }))} placeholder="U012…, U034…" /></div><div className="space-y-2"><Label htmlFor="slack-user-group-ids">{s("Ping user group IDs")} <span className="font-normal text-muted-foreground">({s("optional")})</span></Label><Input className="rounded-md" id="slack-user-group-ids" value={slackMentions.userGroupIds} onChange={(event) => setSlackMentions((current) => ({ ...current, userGroupIds: event.target.value }))} placeholder="S012…, S034…" /></div></div>; }
	function teamsMentionFields() { return <div className="space-y-2"><Label htmlFor="teams-mention-ids">{s("Ping users")} <span className="font-normal text-muted-foreground">({s("optional")})</span></Label><Input className="rounded-md" id="teams-mention-ids" value={teamsMentionIds} onChange={(event) => setTeamsMentionIds(event.target.value)} placeholder="alex@company.com, 123e4567-e89b-12d3-a456-426614174000" /><p className="text-xs text-muted-foreground">{t("notificationCopy.teamsMentionHelp")}</p></div>; }
	function sendConfigurationTest(type: DestinationType) { toast.promise(testNotificationConfiguration({ type, target: targetForType(type) }), { loading: `${s("Sending")} ${providerByType.get(type)?.name ?? s("channel")} ${s("test")}…`, success: s("Test notification delivered"), error: (error) => localizedSettingsError(error, t, "Could not send test") }); }
	function addEmail() {
		const email = emailDraft.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (email) toast.error(s("Enter a valid email address")); return; }
		setEmails((current) => current.includes(email) ? current : [...current, email]); setEmailDraft("");
	}
	async function removeDestination(destinationId: string) {
		setSaving(true);
		try { await deleteNotificationDestination(destinationId); setDestinations((current) => current.filter((entry) => entry.id !== destinationId)); toast.success(s("Destination removed")); }
		catch (error) { toast.error(localizedSettingsError(error, t, "Could not remove destination")); }
		finally { setSaving(false); }
	}
	async function createDestination() {
		if (!name.trim()) return;
		setSaving(true);
		try {
			const created = await Promise.all(selectedTypes.map((type) => createNotificationDestination({ name: name.trim(), type, target: targetForType(type) })));
			setDestinations((current) => [...created, ...current]); setOpen(false); resetSheet(); toast.success(created.length === 1 ? s("Destination created") : `${created.length} ${s("destinations created")}`);
		} catch (error) { toast.error(localizedSettingsError(error, t, "Could not create destination")); }
		finally { setSaving(false); }
	}

	return (
		<>
			<section aria-labelledby="event-alerts-title" className="space-y-3">
				<h2 id="event-alerts-title" className="font-heading text-base font-medium">{s("Product alerts")}</h2>
				<div className="rounded-xl border bg-background/40 px-4 py-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div><h3 className="text-sm font-medium">{s("Model Deprecation Alerts")}</h3><p className="mt-0.5 text-sm text-muted-foreground">{s("Get notice before a model your workspace uses is retired.")}</p></div>
						<div className="flex shrink-0 items-center gap-2 self-end sm:self-auto"><NotificationRouteSelector destinations={destinations} eventKind="model_deprecation" initialDestinationIds={initialNotificationRoutes.model_deprecation ?? []} /><Switch checked={modelDeprecationEnabled} aria-label={s("Enable model deprecation alerts")} onCheckedChange={(checked) => {
							const next = Boolean(checked); setModelDeprecationEnabled(next);
							toast.promise(setBillingNotificationPreference({ preference: "modelDeprecationAlerts", enabled: next }), { loading: `${s("Saving")}…`, success: s("Saved"), error: s("Could not save alert") });
						}} /></div>
					</div>
				</div>
			</section>

			<section aria-labelledby="destinations-title" className="space-y-3">
				<div className="flex items-end justify-between gap-4">
					<div><h2 id="destinations-title" className="font-heading text-base font-medium">{s("Destinations")}</h2><p className="mt-1 text-sm text-muted-foreground">{s("Create reusable channels, then choose them on each alert above.")}</p></div>
					<Button className="rounded-md" onClick={() => setOpen(true)}><Plus /> {s("Add destination")}</Button>
				</div>
				<div className="overflow-hidden rounded-xl border bg-background/40">
					{destinations.length === 0 ? (
						<div className="flex flex-col items-center px-6 py-12 text-center"><div className="mb-4 rounded-md border bg-muted/40 p-3"><BellRing className="size-5 text-muted-foreground" /></div><h3 className="text-sm font-medium">{s("No destinations yet")}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{s("Add a destination to route alerts to the tools your team already watches.")}</p><Button className="mt-5 rounded-md" variant="outline" onClick={() => setOpen(true)}><Plus /> {s("Add destination")}</Button></div>
					) : destinations.map((destination, index) => {
						const item = providerByType.get(destination.type)!; const Icon = item.icon;
					return <div key={destination.id} className={cn("flex items-center gap-3 px-4 py-3.5", index > 0 && "border-t")}><div className={cn("grid size-9 place-items-center rounded-md", item.color)}><Icon className="size-4.5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{destination.name}</p><p className="truncate text-xs text-muted-foreground">{item.name} · {destination.targetPreview}</p></div><Button className="rounded-md" variant="outline" size="sm" disabled={saving} onClick={() => toast.promise(testNotificationDestination(destination.id), { loading: `${s("Sending")} ${s("test")}…`, success: s("Test notification delivered"), error: (error) => localizedSettingsError(error, t, "Could not send test") })}>{s("Send test")}</Button><Button className="rounded-md" variant="ghost" size="icon-sm" aria-label={s("Delete {name}", { name: destination.name })} disabled={saving} onClick={() => void removeDestination(destination.id)}><Trash2 /></Button></div>;
					})}
				</div>
			</section>

			<ProviderInspectorSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetSheet(); }}>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[50vw] lg:!w-[48vw] xl:!w-[44vw] 2xl:!w-[42vw] data-[side=right]:sm:max-w-none">
					<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 pr-14 dark:border-zinc-800">
						<div className="flex min-w-0 items-center gap-3">
							<div className={cn("grid size-11 shrink-0 place-items-center rounded-md border border-zinc-200/80 dark:border-zinc-800", selectedProvider?.color ?? "bg-muted")}><SelectedProviderIcon className="size-6" /></div>
							<div className="min-w-0"><ProviderInspectorSheetTitle className="truncate text-base">{s("Add notifier")}</ProviderInspectorSheetTitle><ProviderInspectorSheetDescription className="mt-1">{s("Connect one or more channels to workspace alerts.")}</ProviderInspectorSheetDescription></div>
						</div>
					</ProviderInspectorSheetHeader>
					<ScrollArea className="min-h-0 flex-1 overscroll-contain" viewportClassName="pb-6 overscroll-contain">
					<div className="px-5 py-5">
						<div className="space-y-5">
							<div className="space-y-2"><Label htmlFor="destination-name">{t("notificationCopy.nameLabel")}</Label><Input className="rounded-md" id="destination-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("notificationCopy.namePlaceholder")} autoFocus /></div>
							<fieldset><legend className="mb-2 text-sm font-medium">{t("notificationCopy.channelsLabel")}</legend><div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{localizedProviders.map((item) => { const Icon = item.icon; const selected = selectedTypes.includes(item.type); return <label key={item.type} className={cn("flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50", selected && "border-foreground/30 bg-muted/70")}><span className={cn("grid size-9 shrink-0 place-items-center rounded-md border border-border/70", item.color)}><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{item.description}</span></span><Checkbox className="shrink-0" checked={selected} aria-label={`Select ${item.name}`} onCheckedChange={(checked) => setSelectedTypes((current) => checked ? [...current.filter((type) => type !== item.type), item.type] : current.filter((type) => type !== item.type))} /></label>; })}</div></fieldset>
							<div>{selectedTypes.map((type, index) => { const item = providerByType.get(type)!; const Icon = item.icon; return <section key={type} className={cn("space-y-3 py-4", index > 0 && "border-t")}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={cn("grid size-7 place-items-center rounded-md", item.color)}><Icon className="size-4" /></span><h3 className="text-sm font-medium">{item.name}</h3></div><Button className="rounded-md" type="button" size="sm" variant="outline" disabled={!isTypeConfigured(type)} onClick={() => sendConfigurationTest(type)}>{s("Send test")}</Button></div>{type === "email" ? <div className="space-y-2"><div className="flex flex-wrap gap-1.5">{emails.map((email) => <span key={email} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">{email}<button type="button" className="rounded-md text-muted-foreground hover:text-foreground" aria-label={t("notificationCopy.removeEmail", { email })} onClick={() => setEmails((current) => current.filter((value) => value !== email))}><X className="size-3" /></button></span>)}</div><div className="flex gap-2"><Input className="rounded-md" type="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addEmail(); } }} placeholder="alerts@company.com" /><Button className="rounded-md" type="button" variant="outline" onClick={addEmail}>{t("notificationCopy.addEmail")}</Button></div></div> : type === "discord" ? <><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="discord-channel-id">{t("notificationCopy.channelId")}</Label><Input className="rounded-md" id="discord-channel-id" value={targets.discord ?? ""} onChange={(event) => setTargets((current) => ({ ...current, discord: event.target.value }))} placeholder="123456789012345678" /></div><div className="space-y-2"><Label htmlFor="discord-bot-token">{t("notificationCopy.botToken")}</Label><Input className="rounded-md" id="discord-bot-token" type="password" autoComplete="off" value={discordBotToken} onChange={(event) => setDiscordBotToken(event.target.value)} placeholder={t("notificationCopy.botTokenPlaceholder")} /></div></div>{discordMentionFields("discord")}</> : <><div className="space-y-2"><Label htmlFor={`target-${type}`}>{item.field}</Label><Input className="rounded-md" id={`target-${type}`} type="url" value={targets[type] ?? ""} onChange={(event) => setTargets((current) => ({ ...current, [type]: event.target.value }))} placeholder={item.placeholder} /></div>{type === "discord_webhook" ? discordMentionFields("discord_webhook") : type === "slack" ? slackMentionFields() : type === "microsoft_teams" ? teamsMentionFields() : null}</>}<p className="text-xs text-muted-foreground">{t("notificationCopy.credentialsEncrypted")}</p></section>; })}</div>
						</div>
					</div>
					</ScrollArea>
					<div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200/80 bg-background px-5 py-3 dark:border-zinc-800"><Button className="rounded-md" variant="outline" onClick={() => setOpen(false)}>{s("Cancel")}</Button><Button className="rounded-md" disabled={saving || !name.trim() || !configurationValid} onClick={() => void createDestination()}>{saving ? t("notificationCopy.creating" as never) : selectedTypes.length > 1 ? t("notificationCopy.createChannels" as never, { count: selectedTypes.length } as never) : t("notificationCopy.create" as never)}</Button></div>
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
		</>
	);
}
