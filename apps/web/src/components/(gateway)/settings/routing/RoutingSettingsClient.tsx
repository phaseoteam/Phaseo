import { useRef, useState } from "react";
import { useTranslations } from "@/i18n/react";
import { localizedSettingsError } from "@/i18n/error-messages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";
import { WorkspacePolicyForm } from "../WorkspacePolicyForm";
import { updateRoutingSettings, type RoutingMode } from "@/features/settings/routing/actions";

const ROUTING_OPTION_COPY = [
	{ value: "balanced", labelKey: "credits.Balanced", descriptionKey: "routingModeDescriptions.balanced" },
	{ value: "price", labelKey: "credits.Lowest cost", descriptionKey: "routingModeDescriptions.price" },
	{ value: "latency", labelKey: "credits.Lowest latency", descriptionKey: "routingModeDescriptions.latency" },
	{ value: "throughput", labelKey: "credits.Highest throughput", descriptionKey: "routingModeDescriptions.throughput" },
] as const;

const RESPONSE_HEALING_OPTION_COPY = [
	{ value: "safe", labelKey: "strings.Safe" },
	{ value: "strict", labelKey: "strings.Strict" },
] as const;


type Props = {
	workspaceId: string;
	canManage: boolean;
	initialMode?: RoutingMode | null;
	initialBetaChannelEnabled?: boolean;
	initialAlphaChannelEnabled?: boolean;
	initialResponseHealingEnabled?: boolean;
	initialResponseHealingLocked?: boolean;
	initialResponseHealingMode?: "safe" | "strict";
	teamName?: string | null;
};

export default function RoutingSettingsClient({ workspaceId, canManage, initialMode, initialBetaChannelEnabled, initialAlphaChannelEnabled, initialResponseHealingEnabled, initialResponseHealingLocked, initialResponseHealingMode, teamName }: Props) {
	const t = useTranslations("SettingsUI");
	const tAuditCopy = useTranslations();
	const routingOptions = ROUTING_OPTION_COPY.map((option) => ({ value: option.value, label: t(option.labelKey as never), description: t(option.descriptionKey as never) }));
	const responseHealingOptions = RESPONSE_HEALING_OPTION_COPY.map((option) => ({ value: option.value, label: t(option.labelKey as never) }));
	const invalidateSettings = useInvalidatePrivateSettings();
	const [saved, setSaved] = useState(() => ({
		mode: initialMode ?? "balanced",
		betaChannelEnabled: Boolean(initialBetaChannelEnabled),
		alphaChannelEnabled: Boolean(initialBetaChannelEnabled && initialAlphaChannelEnabled),
		responseHealingEnabled: Boolean(initialResponseHealingEnabled),
		responseHealingLocked: Boolean(initialResponseHealingLocked),
		responseHealingMode: initialResponseHealingMode === "strict" ? "strict" as const : "safe" as const,
	}));
	const [draft, setDraft] = useState(saved);
	const [saving, setSaving] = useState(false);
	const savingRef = useRef(false);
	const editingDisabled = !canManage || saving;
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const { mode, betaChannelEnabled, alphaChannelEnabled, responseHealingEnabled, responseHealingLocked, responseHealingMode } = draft;
	const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
	const activeOption = routingOptions.find((option) => option.value === mode);
	function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
		setDraft((current) => ({ ...current, [key]: value }));
	}
	function cancel() { setDraft(saved); setError(null); setNotice(null); }
	async function save() {
		if (!canManage || !isDirty || savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const result = await updateRoutingSettings({ data: { ...draft, expectedWorkspaceId: workspaceId } });
			if (!result.ok) throw new Error(result.error);
			setSaved(draft);
			setNotice(t(result.gatewayCacheInvalidated ? "credits.Routing policy updated" : "credits.Routing policy updated; gateway cache refresh pending"));
			void invalidateSettings();
		} catch (cause) {
			setError(localizedSettingsError(cause, t, "Failed to update routing policy", t("credits.Failed to update routing policy")));
		} finally { savingRef.current = false; setSaving(false); }
	}

	return (
		<WorkspacePolicyForm canManage={canManage} dirty={isDirty} saving={saving} error={error} notice={notice} onSave={save} onCancel={cancel}>
			<section className="space-y-1">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-base font-semibold">{t("strings.Provider Routing" as never)}</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("credits.Choose how the Gateway prioritizes providers" as never)}
							{tAuditCopy("Common.ui.auditCopy.workspaceSuffix", { named: teamName ? "yes" : "no", workspace: teamName ?? "" })}.
						</p>
					</div>
				</div>

				<div>
					<div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-center sm:gap-8">
						<div>
							<label htmlFor="routing-mode" className="text-sm font-medium">
								{t("credits.Routing Preference" as never)}
							</label>
							<p className="mt-1 text-sm text-muted-foreground">
								{activeOption?.description}
							</p>
						</div>
					<Select disabled={editingDisabled}
						value={mode}
						items={routingOptions}
						onValueChange={(value) => update("mode", value as RoutingMode)}
					>
						<SelectTrigger id="routing-mode" className="w-full rounded-md">
							<SelectValue placeholder={t("credits.Select a routing mode" as never)} />
						</SelectTrigger>
						<SelectContent>
							{routingOptions.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									label={option.label}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					</div>
					<Separator />
					<div className="flex items-center justify-between gap-6 py-5">
						<div>
						<label htmlFor="beta-channel" className="text-sm font-medium">{t("credits.Beta Channel" as never)}</label>
						<p className="mt-1 text-sm text-muted-foreground">{t("strings.phraseIncludeBetaProvidersInASmallShareOfProductionTraffic" as never)}</p>
						</div>
						<Switch disabled={editingDisabled}
							id="beta-channel"
							checked={betaChannelEnabled}
							onCheckedChange={(enabled) => setDraft((current) => ({ ...current, betaChannelEnabled: enabled, alphaChannelEnabled: enabled && current.alphaChannelEnabled }))}
							aria-label={t("credits.Enable beta channel" as never)}
						/>
					</div>

				{betaChannelEnabled ? (
					<>
						<Separator />
						<div className="ms-4 flex items-center justify-between gap-6 border-s-2 ps-4 py-4">
							<div>
							<label htmlFor="alpha-channel" className="text-sm font-medium">{t("credits.Alpha Channel" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">{t("strings.phraseIncludeAlphaProvidersWithinBetaCanaryTraffic" as never)}</p>
							</div>
							<Switch disabled={editingDisabled}
								id="alpha-channel"
								checked={alphaChannelEnabled}
								onCheckedChange={(enabled) => update("alphaChannelEnabled", enabled)}
								aria-label={t("credits.Enable alpha channel" as never)}
							/>
						</div>
					</>
				) : null}
				</div>
			</section>

			<section className="space-y-1 border-t pt-8">
				<div>
					<h2 className="text-base font-semibold">{t("strings.Response Healing" as never)}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("strings.phraseSetTheWorkspaceDefaultForRepairingStructuredModelOutput" as never)}</p>
				</div>
				<div>
					<div className="flex items-center justify-between gap-6 py-5">
						<div>
							<label htmlFor="response-healing" className="text-sm font-medium">{t("credits.Enable by Default" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">{t("strings.phraseRepairCompatibleStructuredOutputResponsesForThisWorkspace" as never)}</p>
						</div>
						<Switch disabled={editingDisabled}
							id="response-healing"
							checked={responseHealingEnabled}
							onCheckedChange={(enabled) => update("responseHealingEnabled", enabled)}
							aria-label={t("credits.Enable default response healing" as never)}
						/>
					</div>
					<Separator />
					<div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-center sm:gap-8">
						<div>
							<label htmlFor="response-healing-mode" className="text-sm font-medium">{t("strings.Healing Mode" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">
								{responseHealingMode === "strict"
									? t("strings.phraseOnlyUnwrapAlreadyValidJSONFromFencesOrSurroundingText" as never)
									: t("strings.phraseApplyBoundedRepairsSuchAsTrailingCommaCleanupAndSafeCloserRecovery" as never)}
							</p>
						</div>
						<Select disabled={editingDisabled}
							value={responseHealingMode}
							items={responseHealingOptions}
							onValueChange={(value) =>
								update("responseHealingMode", value as "safe" | "strict")
							}
						>
							<SelectTrigger id="response-healing-mode" className="w-full rounded-md">
							<SelectValue placeholder={t("credits.Select a healing mode" as never)} />
							</SelectTrigger>
							<SelectContent>
								{responseHealingOptions.map((option) => (
									<SelectItem
										key={option.value}
										value={option.value}
										label={option.label}
									>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Separator />
					<div className="flex items-center justify-between gap-6 py-5">
						<div>
							<label htmlFor="response-healing-lock" className="text-sm font-medium">{t("credits.Lock Workspace Policy" as never)}</label>
							<p className="mt-1 text-sm text-muted-foreground">{t("strings.phrasePreventPresetsAndRequestsFromOverridingThisDefault" as never)}</p>
						</div>
						<Switch disabled={editingDisabled}
							id="response-healing-lock"
							checked={responseHealingLocked}
							onCheckedChange={(locked) => update("responseHealingLocked", locked)}
							aria-label={t("credits.Lock default response healing policy" as never)}
						/>
					</div>
				</div>
			</section>

		</WorkspacePolicyForm>
	);
}
