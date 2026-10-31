import { BellRing, ChevronDown } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotificationDestinationIcon } from "@/components/(gateway)/settings/notifications/notificationProviders";
import type { NotificationDestination } from "@/lib/fetchers/internal/settingsTypes";

/**
 * The rule's own destinations, chosen in the editor and saved with the rule. It looks like the
 * route selector on the alert rows above, but holds the choice in the form instead of saving
 * each click. With none chosen, the workspace's Spend Alerts routes apply.
 */
export function SpendRuleDestinationPicker({ id, destinations, value, onChange, disabled }: {
	id?: string;
	destinations: NotificationDestination[];
	value: string[];
	onChange: (ids: string[]) => void;
	disabled?: boolean;
}) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const available = new Set(destinations.map((destination) => destination.id));
	const selected = value.filter((destinationId) => available.has(destinationId));
	const chosen = destinations.filter((destination) => selected.includes(destination.id));
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button id={id} type="button" variant="outline" size="sm" className="w-full justify-between rounded-md sm:w-auto sm:min-w-56" disabled={disabled || destinations.length === 0}>
					<span className="flex min-w-0 items-center gap-1.5">
						{chosen.length === 0 ? <BellRing className="size-3.5" /> : (
							<span className="flex items-center gap-1" aria-hidden="true">
								{chosen.slice(0, 3).map((destination) => <NotificationDestinationIcon key={destination.id} type={destination.type} className="size-4 shrink-0" />)}
							</span>
						)}
						<span className="truncate">{chosen.length === 0 ? t("editor.destinationsRoutes") : t("editor.destinationsCount", { count: chosen.length })}</span>
					</span>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{t("editor.destinationsMenu")}</DropdownMenuLabel>
					{destinations.map((destination) => (
						<DropdownMenuCheckboxItem
							key={destination.id}
							checked={selected.includes(destination.id)}
							disabled={destination.status !== "active" && !selected.includes(destination.id)}
							onCheckedChange={(checked) => onChange(checked ? [...selected.filter((entry) => entry !== destination.id), destination.id] : selected.filter((entry) => entry !== destination.id))}
							onSelect={(event) => event.preventDefault()}
						>
							<NotificationDestinationIcon type={destination.type} className="size-4 shrink-0" />
							<span className="min-w-0">
								<span className="block truncate text-sm">{destination.name}</span>
								<span className="block truncate text-xs text-muted-foreground">{destination.status === "active" ? destination.targetPreview : t("editor.destinationPaused")}</span>
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
