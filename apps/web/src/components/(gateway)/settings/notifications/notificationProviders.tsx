import type * as React from "react";
import Image from "next/image";
import { Globe2, Mail } from "lucide-react";
import type { NotificationDestination } from "@/lib/fetchers/internal/settingsTypes";

type DestinationType = NotificationDestination["type"];
type ProviderIconProps = { className?: string };
type Provider = { type: DestinationType; name: string; description: string; field: string; placeholder: string; icon: React.ComponentType<ProviderIconProps>; color: string };

function DiscordIcon({ className }: ProviderIconProps) {
	return <Image src="/social/discord.svg" alt="" width={24} height={19} className={`object-contain ${className ?? ""}`} />;
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
	return <Image src="/logos/microsoft-teams.svg" alt="" width={24} height={25} className={`object-contain ${className ?? ""}`} />;
}

export const providers: Provider[] = [
	{ type: "email", name: "Email", description: "Send to an inbox or distribution list", field: "Email address", placeholder: "alerts@company.com", icon: Mail, color: "text-emerald-500 bg-emerald-500/10" },
	{ type: "discord", name: "Discord", description: "Deliver alerts to a Discord channel", field: "Channel URL", placeholder: "https://discord.com/channels/…", icon: DiscordIcon, color: "bg-[#5865F2]/10" },
	{ type: "discord_webhook", name: "Discord Webhook", description: "Post through a Discord webhook", field: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…", icon: DiscordIcon, color: "bg-[#5865F2]/10" },
	{ type: "slack", name: "Slack", description: "Post to a Slack channel", field: "Webhook URL", placeholder: "https://hooks.slack.com/services/…", icon: SlackIcon, color: "bg-background" },
	{ type: "microsoft_teams", name: "Microsoft Teams", description: "Post to a Teams channel", field: "Workflow URL", placeholder: "https://…webhook.office.com/…", icon: TeamsIcon, color: "bg-[#6264A7]/10" },
	{ type: "custom_webhook", name: "Custom Webhook", description: "Send JSON to any HTTPS endpoint", field: "Endpoint URL", placeholder: "https://api.company.com/phaseo", icon: Globe2, color: "text-cyan-500 bg-cyan-500/10" },
];

export const providerByType = new Map(providers.map((provider) => [provider.type, provider]));

export function NotificationDestinationIcon({ type, className }: { type: DestinationType; className?: string }) {
	const Icon = providerByType.get(type)?.icon ?? Globe2;
	return <Icon className={className} />;
}
