"use client";

import * as React from "react";
import Image from "next/image";
import { BellRing, ChevronDown, Globe2, Mail, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NotificationDestination, NotificationEventKind } from "@/lib/fetchers/internal/settingsTypes";
import { cn } from "@/lib/utils";
import NotificationRouteSelector from "./NotificationRouteSelector";

type DestinationType = NotificationDestination["type"];
type NotificationTestKind = "notification_test" | "model_deprecation";
type ProviderIconProps = { className?: string };
type Provider = { type: DestinationType; name: string; description: string; field: string; placeholder: string; icon: React.ComponentType<ProviderIconProps>; color: string };

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

const providers: Provider[] = [
	{ type: "email", name: "Email", description: "Send to an inbox or distribution list", field: "Email address", placeholder: "alerts@company.com", icon: Mail, color: "text-emerald-500 bg-emerald-500/10" },
	{ type: "discord", name: "Discord", description: "Deliver alerts to a Discord channel", field: "Channel URL", placeholder: "https://discord.com/channels/…", icon: DiscordIcon, color: "bg-[#5865F2]/10" },
	{ type: "discord_webhook", name: "Discord Webhook", description: "Post through a Discord webhook", field: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…", icon: DiscordIcon, color: "bg-[#5865F2]/10" },
	{ type: "slack", name: "Slack", description: "Post to a Slack channel", field: "Webhook URL", placeholder: "https://hooks.slack.com/services/…", icon: SlackIcon, color: "bg-background" },
	{ type: "microsoft_teams", name: "Microsoft Teams", description: "Post to a Teams channel", field: "Workflow URL", placeholder: "https://…webhook.office.com/…", icon: TeamsIcon, color: "bg-[#6264A7]/10" },
	{ type: "custom_webhook", name: "Custom Webhook", description: "Send JSON to any HTTPS endpoint", field: "Endpoint URL", placeholder: "https://api.company.com/phaseo", icon: Globe2, color: "text-cyan-500 bg-cyan-500/10" },
];

const providerByType = new Map(providers.map((provider) => [provider.type, provider]));

export default function NotificationDestinationsClient({ initialDestinations, initialModelDeprecationEnabled, initialNotificationRoutes }: { initialDestinations: NotificationDestination[]; initialModelDeprecationEnabled: boolean; initialNotificationRoutes: Partial<Record<NotificationEventKind, string[]>> }) {
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
	function discordMentionFields(type: "discord" | "discord_webhook") { return <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`${type}-user-ids`}>Ping user IDs <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="rounded-md" id={`${type}-user-ids`} value={discordMentions[type]?.userIds ?? ""} onChange={(event) => setDiscordMentions((current) => ({ ...current, [type]: { userIds: event.target.value, roleIds: current[type]?.roleIds ?? "" } }))} placeholder="123…, 456…" /></div><div className="space-y-2"><Label htmlFor={`${type}-role-ids`}>Ping role IDs <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="rounded-md" id={`${type}-role-ids`} value={discordMentions[type]?.roleIds ?? ""} onChange={(event) => setDiscordMentions((current) => ({ ...current, [type]: { userIds: current[type]?.userIds ?? "", roleIds: event.target.value } }))} placeholder="123…, 456…" /></div></div>; }
	function slackMentionFields() { return <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="slack-user-ids">Ping user IDs <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="rounded-md" id="slack-user-ids" value={slackMentions.userIds} onChange={(event) => setSlackMentions((current) => ({ ...current, userIds: event.target.value }))} placeholder="U012…, U034…" /></div><div className="space-y-2"><Label htmlFor="slack-user-group-ids">Ping user group IDs <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="rounded-md" id="slack-user-group-ids" value={slackMentions.userGroupIds} onChange={(event) => setSlackMentions((current) => ({ ...current, userGroupIds: event.target.value }))} placeholder="S012…, S034…" /></div></div>; }
	function teamsMentionFields() { return <div className="space-y-2"><Label htmlFor="teams-mention-ids">Ping users <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="rounded-md" id="teams-mention-ids" value={teamsMentionIds} onChange={(event) => setTeamsMentionIds(event.target.value)} placeholder="alex@company.com, Entra object ID…" /><p className="text-xs text-muted-foreground">Use Microsoft 365 email addresses or Entra object IDs. Teams webhooks cannot mention roles or everyone.</p></div>; }
	async function sendNotificationTest(action: () => Promise<{ ok: true; status?: number } | { ok: false; error: string }>, loadingMessage: string) {
		const toastId = toast.loading(loadingMessage);
		try {
			const result = await action();
			if (!result.ok) {
				toast.error(result.error, { id: toastId });
				return;
			}
			toast.success("Test notification sent", { id: toastId });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not send test", { id: toastId });
		}
	}

	function sendConfigurationTest(type: DestinationType) {
		void sendNotificationTest(() => testNotificationConfiguration({ type, target: targetForType(type) }), `Sending ${providerByType.get(type)?.name ?? "channel"} test…`);
	}
	function sendDestinationTest(destinationId: string, kind: NotificationTestKind) {
		const isModelDeprecation = kind === "model_deprecation";
		void sendNotificationTest(() => testNotificationDestination(destinationId, kind), isModelDeprecation ? "Sending model deprecation test…" : "Sending test…");
	}
	function addEmail() {
		const email = emailDraft.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (email) toast.error("Enter a valid email address"); return; }
		setEmails((current) => current.includes(email) ? current : [...current, email]); setEmailDraft("");
	}
	async function removeDestination(destinationId: string) {
		setSaving(true);
		try { await deleteNotificationDestination(destinationId); setDestinations((current) => current.filter((entry) => entry.id !== destinationId)); toast.success("Destination removed"); }
		catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove destination"); }
		finally { setSaving(false); }
	}
	async function createDestination() {
		if (!name.trim()) return;
		setSaving(true);
		try {
			const created = await Promise.all(selectedTypes.map((type) => createNotificationDestination({ name: name.trim(), type, target: targetForType(type) })));
			setDestinations((current) => [...created, ...current]); setOpen(false); resetSheet(); toast.success(created.length === 1 ? "Destination created" : `${created.length} destinations created`);
		} catch (error) { toast.error(error instanceof Error ? error.message : "Could not create destination"); }
		finally { setSaving(false); }
	}

	return (
		<>
			<section aria-labelledby="event-alerts-title" className="space-y-3">
				<h2 id="event-alerts-title" className="font-heading text-base font-medium">Product alerts</h2>
				<div className="rounded-xl border bg-background/40 px-4 py-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div><h3 className="text-sm font-medium">Model Deprecation Alerts</h3><p className="mt-0.5 text-sm text-muted-foreground">Get notice before a model your workspace uses is retired.</p></div>
						<div className="flex shrink-0 items-center gap-2 self-end sm:self-auto"><NotificationRouteSelector destinations={destinations} eventKind="model_deprecation" initialDestinationIds={initialNotificationRoutes.model_deprecation ?? []} /><Switch checked={modelDeprecationEnabled} aria-label="Enable model deprecation alerts" onCheckedChange={(checked) => {
							const next = Boolean(checked); setModelDeprecationEnabled(next);
							toast.promise(setBillingNotificationPreference({ preference: "modelDeprecationAlerts", enabled: next }), { loading: "Saving alert…", success: "Model deprecation alerts updated", error: "Could not save alert" });
						}} /></div>
					</div>
				</div>
			</section>

			<section aria-labelledby="destinations-title" className="space-y-3">
				<div className="flex items-end justify-between gap-4">
					<div><h2 id="destinations-title" className="font-heading text-base font-medium">Destinations</h2><p className="mt-1 text-sm text-muted-foreground">Create reusable channels, then choose them on each alert above.</p></div>
					<Button className="rounded-md" onClick={() => setOpen(true)}><Plus /> Add destination</Button>
				</div>
				<div className="overflow-hidden rounded-xl border bg-background/40">
					{destinations.length === 0 ? (
						<div className="flex flex-col items-center px-6 py-12 text-center"><div className="mb-4 rounded-md border bg-muted/40 p-3"><BellRing className="size-5 text-muted-foreground" /></div><h3 className="text-sm font-medium">No destinations yet</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Add a destination to route alerts to the tools your team already watches.</p><Button className="mt-5 rounded-md" variant="outline" onClick={() => setOpen(true)}><Plus /> Add destination</Button></div>
					) : destinations.map((destination, index) => {
						const item = providerByType.get(destination.type)!; const Icon = item.icon;
						return <div key={destination.id} className={cn("flex items-center gap-3 px-4 py-3.5", index > 0 && "border-t")}><div className={cn("grid size-9 place-items-center rounded-md", item.color)}><Icon className="size-4.5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{destination.name}</p><p className="truncate text-xs text-muted-foreground">{item.name} · {destination.targetPreview}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button className="rounded-md" variant="outline" size="sm" disabled={saving}>Send test <ChevronDown className="ml-1 size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => sendDestinationTest(destination.id, "notification_test")}>Connection test</DropdownMenuItem><DropdownMenuItem onClick={() => sendDestinationTest(destination.id, "model_deprecation")}>Model deprecation sample</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button className="rounded-md" variant="ghost" size="icon-sm" aria-label={`Delete ${destination.name}`} disabled={saving} onClick={() => void removeDestination(destination.id)}><Trash2 /></Button></div>;
					})}
				</div>
			</section>

			<ProviderInspectorSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetSheet(); }}>
				<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[50vw] lg:!w-[48vw] xl:!w-[44vw] 2xl:!w-[42vw] data-[side=right]:sm:max-w-none">
					<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 pr-14 dark:border-zinc-800">
						<div className="flex min-w-0 items-center gap-3">
							<div className={cn("grid size-11 shrink-0 place-items-center rounded-md border border-zinc-200/80 dark:border-zinc-800", selectedProvider?.color ?? "bg-muted")}><SelectedProviderIcon className="size-6" /></div>
							<div className="min-w-0"><ProviderInspectorSheetTitle className="truncate text-base">Add notifier</ProviderInspectorSheetTitle><ProviderInspectorSheetDescription className="mt-1">Connect one or more channels to workspace alerts.</ProviderInspectorSheetDescription></div>
						</div>
					</ProviderInspectorSheetHeader>
					<ScrollArea className="min-h-0 flex-1 overscroll-contain" viewportClassName="pb-6 overscroll-contain">
					<div className="px-5 py-5">
						<div className="space-y-5">
							<div className="space-y-2"><Label htmlFor="destination-name">Name</Label><Input className="rounded-md" id="destination-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Engineering alerts" autoFocus /></div>
							<fieldset><legend className="mb-2 text-sm font-medium">Channels</legend><div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{providers.map((item) => { const Icon = item.icon; const selected = selectedTypes.includes(item.type); return <label key={item.type} className={cn("flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/50", selected && "border-foreground/30 bg-muted/70")}><span className={cn("grid size-9 shrink-0 place-items-center rounded-md border border-border/70", item.color)}><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{item.description}</span></span><Checkbox className="shrink-0" checked={selected} aria-label={`Select ${item.name}`} onCheckedChange={(checked) => setSelectedTypes((current) => checked ? [...current.filter((type) => type !== item.type), item.type] : current.filter((type) => type !== item.type))} /></label>; })}</div></fieldset>
							<div>{selectedTypes.map((type, index) => { const item = providerByType.get(type)!; const Icon = item.icon; return <section key={type} className={cn("space-y-3 py-4", index > 0 && "border-t")}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={cn("grid size-7 place-items-center rounded-md", item.color)}><Icon className="size-4" /></span><h3 className="text-sm font-medium">{item.name}</h3></div><Button className="rounded-md" type="button" size="sm" variant="outline" disabled={!isTypeConfigured(type)} onClick={() => sendConfigurationTest(type)}>Send test</Button></div>{type === "email" ? <div className="space-y-2"><div className="flex flex-wrap gap-1.5">{emails.map((email) => <span key={email} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">{email}<button type="button" className="rounded-md text-muted-foreground hover:text-foreground" aria-label={`Remove ${email}`} onClick={() => setEmails((current) => current.filter((value) => value !== email))}><X className="size-3" /></button></span>)}</div><div className="flex gap-2"><Input className="rounded-md" type="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addEmail(); } }} placeholder="alerts@company.com" /><Button className="rounded-md" type="button" variant="outline" onClick={addEmail}>Add</Button></div></div> : type === "discord" ? <><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="discord-channel-id">Channel ID</Label><Input className="rounded-md" id="discord-channel-id" value={targets.discord ?? ""} onChange={(event) => setTargets((current) => ({ ...current, discord: event.target.value }))} placeholder="123456789012345678" /></div><div className="space-y-2"><Label htmlFor="discord-bot-token">Bot token</Label><Input className="rounded-md" id="discord-bot-token" type="password" autoComplete="off" value={discordBotToken} onChange={(event) => setDiscordBotToken(event.target.value)} placeholder="Discord bot token" /></div></div>{discordMentionFields("discord")}</> : <><div className="space-y-2"><Label htmlFor={`target-${type}`}>{item.field}</Label><Input className="rounded-md" id={`target-${type}`} type="url" value={targets[type] ?? ""} onChange={(event) => setTargets((current) => ({ ...current, [type]: event.target.value }))} placeholder={item.placeholder} /></div>{type === "discord_webhook" ? discordMentionFields("discord_webhook") : type === "slack" ? slackMentionFields() : type === "microsoft_teams" ? teamsMentionFields() : null}</>}<p className="text-xs text-muted-foreground">Credentials are encrypted before storage.</p></section>; })}</div>
						</div>
					</div>
					</ScrollArea>
					<div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200/80 bg-background px-5 py-3 dark:border-zinc-800"><Button className="rounded-md" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="rounded-md" disabled={saving || !name.trim() || !configurationValid} onClick={() => void createDestination()}>{saving ? "Creating…" : selectedTypes.length > 1 ? `Create ${selectedTypes.length} channels` : "Create"}</Button></div>
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
		</>
	);
}
