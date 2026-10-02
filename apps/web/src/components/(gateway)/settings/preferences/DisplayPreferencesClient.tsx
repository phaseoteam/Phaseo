"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { updateDisplayPreferences } from "@/app/(dashboard)/settings/preferences/actions";
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	DEFAULT_DISPLAY_PREFERENCES,
	DISPLAY_DARK_PALETTES,
	DISPLAY_LIGHT_PALETTES,
	formatDisplayDate,
	formatDisplayDateTime,
	formatDisplayNumber,
	formatDisplayTime,
	formatDisplayTimestamp,
	normalizeDisplayPreferences,
	readableForegroundForAccent,
	type DisplayPreferences,
	type DisplayDarkPalette,
	type DisplayLightPalette,
} from "@/lib/displayPreferences";

const PALETTE_SWATCHES = {
	light: {
		phaseo: ["#ffffff", "#f5f5f5", "#171717"],
		paper: ["#f8fafc", "#ffffff", "#29313d"],
		warm: ["#fcfaf4", "#fffdf8", "#3b3025"],
	},
	dark: {
		phaseo: ["#171717", "#262626", "#fafafa"],
		slate: ["#17202b", "#202c39", "#e8edf3"],
		midnight: ["#0b0d1b", "#15182b", "#eeeff8"],
	},
} as const;

type ThemePreset = {
	id: string;
	nameKey: "phaseo" | "carbon" | "midnight" | "forest" | "ember" | "orchid";
	lightPalette: DisplayLightPalette;
	darkPalette: DisplayDarkPalette;
	lightAccent: string;
	darkAccent: string;
};

const THEME_PRESETS: readonly ThemePreset[] = [
	{
		id: "phaseo",
		nameKey: "phaseo",
		lightPalette: "phaseo",
		darkPalette: "phaseo",
		lightAccent: "#0069a8",
		darkAccent: "#0078b8",
	},
	{
		id: "carbon",
		nameKey: "carbon",
		lightPalette: "paper",
		darkPalette: "slate",
		lightAccent: "#334155",
		darkAccent: "#60a5fa",
	},
	{
		id: "midnight",
		nameKey: "midnight",
		lightPalette: "paper",
		darkPalette: "midnight",
		lightAccent: "#4f46e5",
		darkAccent: "#818cf8",
	},
	{
		id: "forest",
		nameKey: "forest",
		lightPalette: "warm",
		darkPalette: "slate",
		lightAccent: "#15803d",
		darkAccent: "#4ade80",
	},
	{
		id: "ember",
		nameKey: "ember",
		lightPalette: "warm",
		darkPalette: "midnight",
		lightAccent: "#c2410c",
		darkAccent: "#fb923c",
	},
	{
		id: "orchid",
		nameKey: "orchid",
		lightPalette: "paper",
		darkPalette: "midnight",
		lightAccent: "#7c3aed",
		darkAccent: "#c084fc",
	},
];

const PREVIEW_DATE = new Date("2026-09-19T16:35:00.000Z");
const APPEARANCE_MODES = [
	{ value: "system", labelKey: "system", icon: Monitor },
	{ value: "light", labelKey: "light", icon: Sun },
	{ value: "dark", labelKey: "dark", icon: Moon },
] as const;
const FALLBACK_TIME_ZONES = [
	"UTC",
	"Europe/London",
	"Europe/Paris",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Asia/Singapore",
	"Asia/Tokyo",
	"Australia/Sydney",
];

function supportedTimeZones() {
	const intl = Intl as typeof Intl & {
		supportedValuesOf?: (key: "timeZone") => string[];
	};
	try {
		return Array.from(new Set(["UTC", ...(intl.supportedValuesOf?.("timeZone") ?? FALLBACK_TIME_ZONES)]));
	} catch {
		return FALLBACK_TIME_ZONES;
	}
}

function timeZoneOffsetMinutes(timeZone: string, date: Date) {
	try {
		const offset = new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "shortOffset",
			hour: "2-digit",
		})
			.formatToParts(date)
			.find((part) => part.type === "timeZoneName")?.value;
		if (!offset || offset === "GMT" || offset === "UTC") return 0;
		const match = offset.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
		if (!match) return 0;
		const sign = match[1] === "-" ? -1 : 1;
		return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
	} catch {
		return 0;
	}
}

function formatTimeZoneOffset(offsetMinutes: number) {
	const sign = offsetMinutes < 0 ? "-" : "+";
	const absoluteMinutes = Math.abs(offsetMinutes);
	const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, "0");
	const minutes = (absoluteMinutes % 60).toString().padStart(2, "0");
	return `UTC${sign}${hours}:${minutes}`;
}

function PreferenceRow({
	title,
	description,
	preview,
	children,
}: {
	title: string;
	description: string;
	preview?: React.ReactNode;
	children: React.ReactNode;
}) {
	const t = useTranslations("SettingsUI");
	return (
		<div data-slot="preference-row" className="grid gap-3 border-t border-border/60 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:items-start">
			<div className="max-w-xl md:pt-1">
				<p className="text-sm font-medium">{title}</p>
				<p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<div className="w-full space-y-1.5 md:justify-self-end">
				{children}
				{preview ? (
					<div className="flex items-baseline justify-between gap-4 px-1 text-xs">
						<span className="font-medium text-muted-foreground/70">{t("preferencesCopy.preview")}</span>
						<span className="truncate text-right font-medium tabular-nums text-foreground/80">{preview}</span>
					</div>
				) : null}
			</div>
		</div>
	);
}

function SettingsSection({
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="border-t border-border/70 pt-6 first:border-t-0 first:pt-0">
			<div className="pb-2">
				<h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
				<p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<div>{children}</div>
		</section>
	);
}

function PreferenceSelect<T extends string>({
	ariaLabel,
	value,
	onChange,
	options,
}: {
	ariaLabel: string;
	value: T;
	onChange: (value: T) => void;
	options: Array<{ value: T; label: string }>;
}) {
	return (
		<Select value={value} onValueChange={(next) => onChange(next as T)}>
			<SelectTrigger aria-label={ariaLabel} className="h-10 w-full">
				<SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function PalettePicker<T extends string>({
	ariaLabel,
	value,
	onChange,
	options,
	palette,
}: {
	ariaLabel: string;
	value: T;
	onChange: (value: T) => void;
	options: readonly T[];
	palette: "light" | "dark";
}) {
	const t = useTranslations("SettingsUI");
	return (
		<div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-3 gap-2 sm:w-80">
			{options.map((option) => {
				const active = option === value;
				const swatches = (
					PALETTE_SWATCHES[palette] as Record<string, readonly [string, string, string]>
				)[option] ?? PALETTE_SWATCHES.light.phaseo;
				return (
					<button
						key={option}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onChange(option)}
						className={`relative rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/50"}`}
					>
						<span className="mb-2 flex h-8 overflow-hidden rounded border border-black/10" aria-hidden="true">
							<span className="flex-1" style={{ backgroundColor: swatches[0] }} />
							<span className="flex-1" style={{ backgroundColor: swatches[1] }} />
							<span className="w-2" style={{ backgroundColor: swatches[2] }} />
						</span>
						<span className="block truncate text-xs font-medium">
							{option === "phaseo" ? "Phaseo" : t(`preferencesCopy.${option as "paper" | "warm" | "slate" | "midnight"}`)}
						</span>
						{active ? <Check className="absolute right-1.5 top-1.5 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" /> : null}
					</button>
				);
			})}
		</div>
	);
}

function AppearanceModePicker() {
	const t = useTranslations("SettingsUI");
	const { theme, setTheme } = useTheme();
	const selected = APPEARANCE_MODES.find((mode) => mode.value === theme)?.value ?? "system";

	return (
		<div role="radiogroup" aria-label={t("preferencesCopy.appearanceMode")} className="grid grid-cols-3 gap-2">
			{APPEARANCE_MODES.map((mode) => {
				const Icon = mode.icon;
				const active = selected === mode.value;
				return (
					<button
						key={mode.value}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => setTheme(mode.value)}
						className={`flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary/70 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"}`}
					>
						<Icon className="size-3.5 shrink-0" aria-hidden="true" />
						<span className="truncate">{t(`preferencesCopy.${mode.labelKey}`)}</span>
					</button>
				);
			})}
		</div>
	);
}

function AccentPicker({
	ariaLabel,
	value,
	onChange,
}: {
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const t = useTranslations("SettingsUI");
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label={ariaLabel}
					className="h-10 w-full justify-between px-3 font-normal"
				>
					<span className="flex min-w-0 items-center gap-2.5">
						<span
							aria-hidden="true"
							className="size-5 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15"
							style={{ backgroundColor: value }}
						/>
						<span className="font-mono text-xs uppercase text-foreground">{value}</span>
					</span>
					<span className="text-xs text-muted-foreground">{t("preferencesCopy.edit")}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 gap-3 p-3">
				<PopoverHeader>
					<PopoverTitle className="text-sm">{t("preferencesCopy.accentColour")}</PopoverTitle>
					<PopoverDescription className="text-xs">
						{t("preferencesCopy.colourHelp")}</PopoverDescription>
				</PopoverHeader>
				<ColorPicker value={value} onChange={(next) => onChange(next.toLowerCase())} />
			</PopoverContent>
		</Popover>
	);
}

function presetMatches(preferences: DisplayPreferences, preset: ThemePreset) {
	return preferences.lightPalette === preset.lightPalette &&
		preferences.darkPalette === preset.darkPalette &&
		preferences.lightAccent === preset.lightAccent &&
		preferences.darkAccent === preset.darkAccent;
}

function applyAppearanceToRoot(preferences: DisplayPreferences) {
	const root = document.documentElement;
	root.dataset.lightPalette = preferences.lightPalette;
	root.dataset.darkPalette = preferences.darkPalette;
	root.dataset.density = preferences.density;
	root.dataset.obfuscatePii = preferences.maskSensitiveData ? "true" : "false";
	root.style.setProperty("--light-user-accent", preferences.lightAccent);
	root.style.setProperty(
		"--light-user-accent-foreground",
		readableForegroundForAccent(preferences.lightAccent),
	);
	root.style.setProperty("--dark-user-accent", preferences.darkAccent);
	root.style.setProperty(
		"--dark-user-accent-foreground",
		readableForegroundForAccent(preferences.darkAccent),
	);
}

function ThemePresetPicker({
	preferences,
	onChange,
}: {
	preferences: DisplayPreferences;
	onChange: (preset: ThemePreset) => void;
}) {
	const t = useTranslations("SettingsUI");
	const activePreset = THEME_PRESETS.find((preset) => presetMatches(preferences, preset));

	return (
		<div className="border-t border-border/60 py-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-sm font-medium">{t("preferencesCopy.preset")}</p>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{t("preferencesCopy.presetHelp")}</p>
				</div>
				<span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
					{activePreset ? activePreset.nameKey === "phaseo" ? "Phaseo" : t(`preferencesCopy.${activePreset.nameKey}`) : t("preferencesCopy.custom")}
				</span>
			</div>
			<div role="radiogroup" aria-label={t("preferencesCopy.themePreset")} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
				{THEME_PRESETS.map((preset) => {
					const active = activePreset?.id === preset.id;
					const light = PALETTE_SWATCHES.light[preset.lightPalette];
					const dark = PALETTE_SWATCHES.dark[preset.darkPalette];

					return (
						<button
							key={preset.id}
							type="button"
							role="radio"
							aria-checked={active}
							onClick={() => onChange(preset)}
							className={`group relative rounded-xl border p-2 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}
						>
							<span className="flex h-10 overflow-hidden rounded-md border border-black/10" aria-hidden="true">
								<span className="relative flex-1" style={{ backgroundColor: light[0] }}>
									<span className="absolute bottom-1 left-1 size-2 rounded-full ring-1 ring-black/10" style={{ backgroundColor: preset.lightAccent }} />
								</span>
								<span className="relative flex-1" style={{ backgroundColor: dark[0] }}>
									<span className="absolute bottom-1 right-1 size-2 rounded-full ring-1 ring-white/20" style={{ backgroundColor: preset.darkAccent }} />
								</span>
							</span>
							<span className="mt-2 block truncate text-xs font-medium">{preset.nameKey === "phaseo" ? "Phaseo" : t(`preferencesCopy.${preset.nameKey}`)}</span>
							{active ? <Check className="absolute right-1.5 top-1.5 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" /> : null}
						</button>
					);
				})}
			</div>
		</div>
	);
}

export default function DisplayPreferencesClient({
	initialPreferences,
}: {
	initialPreferences: DisplayPreferences;
}) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const {
		isHydrated: displayPreferencesHydrated,
		setPreferences: applyPreferences,
	} = useDisplayPreferences();
	const normalizedInitial = React.useMemo(
		() => normalizeDisplayPreferences(initialPreferences),
		[initialPreferences],
	);
	const [preferences, setPreferences] = React.useState(normalizedInitial);
	const [savedPreferences, setSavedPreferences] = React.useState(normalizedInitial);
	const [isSaving, startSaving] = React.useTransition();
	const timeZones = React.useMemo(() => supportedTimeZones(), []);
	const systemTimeZone = React.useMemo(
		() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
		[],
	);
	const timeZoneOffsetDate = React.useMemo(() => new Date(), []);
	const timeZoneOptions = React.useMemo(
		() => {
			const options = timeZones
				.map((timeZone) => {
					const offsetMinutes = timeZoneOffsetMinutes(timeZone, timeZoneOffsetDate);
					return {
						value: timeZone,
						label: `${timeZone.replaceAll("_", " ")} (${formatTimeZoneOffset(offsetMinutes)})`,
						offsetMinutes,
					};
				})
				.sort(
					(first, second) =>
						first.offsetMinutes - second.offsetMinutes ||
						first.value.localeCompare(second.value),
				);
			const systemOffset = formatTimeZoneOffset(
				timeZoneOffsetMinutes(systemTimeZone, timeZoneOffsetDate),
			);
			return [
				{
					value: "system",
					label: t("preferencesCopy.systemTimeZone", { timeZone: systemTimeZone.replaceAll("_", " "), offset: systemOffset }),
				},
				...options,
			];
		},
		[systemTimeZone, timeZoneOffsetDate, timeZones, t],
	);
	const previewPreferences = { ...preferences, locale: preferences.locale === "system" ? locale : preferences.locale };
	const dirty = JSON.stringify(preferences) !== JSON.stringify(savedPreferences);

	React.useEffect(() => {
		if (displayPreferencesHydrated) applyPreferences(normalizedInitial);
	}, [applyPreferences, displayPreferencesHydrated, normalizedInitial]);

	React.useEffect(() => {
		if (!displayPreferencesHydrated) return;
		applyAppearanceToRoot(preferences);
		return () => applyAppearanceToRoot(savedPreferences);
	}, [displayPreferencesHydrated, preferences, savedPreferences]);

	function update<K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) {
		setPreferences((current) => ({ ...current, [key]: value }));
	}

	function applyThemePreset(preset: ThemePreset) {
		setPreferences((current) => ({
			...current,
			lightPalette: preset.lightPalette,
			darkPalette: preset.darkPalette,
			lightAccent: preset.lightAccent,
			darkAccent: preset.darkAccent,
		}));
	}

	function save() {
		startSaving(async () => {
			try {
				const result = await updateDisplayPreferences(preferences);
				setPreferences(result.preferences);
				setSavedPreferences(result.preferences);
				applyPreferences(result.preferences);
				toast.success(t("preferencesCopy.saved"));
			} catch {
				toast.error(t("preferencesCopy.saveFailed"));
			}
		});
	}

	return (
		<div className="space-y-9 pb-2">
			<SettingsSection
				id="experience-heading"
				title={t("preferencesCopy.experience")}
				description={t("preferencesCopy.experienceHelp")}
			>
				<PreferenceRow
					title={t("preferencesCopy.density")}
					description={t("preferencesCopy.densityHelp")}
					preview={preferences.density === "compact" ? t("preferencesCopy.compactSpacing") : t("preferencesCopy.comfortableSpacing")}
				>
					<div role="radiogroup" aria-label={t("preferencesCopy.density")} className="grid grid-cols-2 gap-2">
						{([
							{ value: "comfortable", label: t("preferencesCopy.comfortable") },
							{ value: "compact", label: t("preferencesCopy.compact") },
						] as const).map((option) => {
							const active = preferences.density === option.value;
							return (
								<button
									key={option.value}
									type="button"
									role="radio"
									aria-checked={active}
									onClick={() => update("density", option.value)}
									className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary/70 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
								>
									{option.label}
								</button>
							);
						})}
					</div>
				</PreferenceRow>
				<PreferenceRow
					title={t("preferencesCopy.codeLanguage")}
					description={t("preferencesCopy.codeLanguageHelp")}
					preview={{
						typescript: "const response = await phaseo.generateText(…)",
						python: "response = phaseo.generate_text(…)",
						curl: "curl https://api.phaseo.app/v1/…",
					}[preferences.codeLanguage]}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.defaultCodeLanguage")}
						value={preferences.codeLanguage}
						onChange={(value) => update("codeLanguage", value)}
						options={[
							{ value: "typescript", label: "TypeScript" },
							{ value: "python", label: "Python" },
							{ value: "curl", label: "cURL" },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title={t("preferencesCopy.landingPage")}
					description={t("preferencesCopy.landingPageHelp")}
					preview={{ home: "/", models: "/models", chat: "/chat", monitor: "/monitor" }[preferences.landingPage]}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.defaultLandingPage")}
						value={preferences.landingPage}
						onChange={(value) => update("landingPage", value)}
						options={[
							{ value: "home", label: t("preferencesCopy.home") },
							{ value: "models", label: t("preferencesCopy.models") },
							{ value: "chat", label: t("preferencesCopy.chat") },
							{ value: "monitor", label: t("preferencesCopy.monitor") },
						]}
					/>
				</PreferenceRow>
			</SettingsSection>

			<SettingsSection
				id="date-time-heading"
				title={t("preferencesCopy.dateTime")}
				description={t("preferencesCopy.dateTimeHelp")}
			>
				<PreferenceRow
					title={t("preferencesCopy.locale")}
					description={t("preferencesCopy.localeHelp")}
					preview={`${formatDisplayDate(PREVIEW_DATE, previewPreferences)} · ${formatDisplayNumber(1_234_567.89, previewPreferences, { maximumFractionDigits: 2 })}`}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.displayLocale")}
						value={preferences.locale}
						onChange={(value) => update("locale", value)}
						options={[
							{ value: "system", label: t("preferencesCopy.system") },
							{ value: "en-GB", label: t("preferencesCopy.englishUK") },
							{ value: "en-US", label: t("preferencesCopy.englishUS") },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title={t("preferencesCopy.dateFormat")}
					description={t("preferencesCopy.dateFormatHelp")}
					preview={formatDisplayDate(PREVIEW_DATE, previewPreferences)}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.dateFormat")}
						value={preferences.dateStyle}
						onChange={(value) => update("dateStyle", value)}
						options={[
							{ value: "short", label: t("preferencesCopy.short") },
							{ value: "medium", label: t("preferencesCopy.medium") },
							{ value: "long", label: t("preferencesCopy.long") },
							{ value: "iso", label: "ISO (YYYY-MM-DD)" },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title={t("preferencesCopy.timeZone")}
					description={t("preferencesCopy.timeZoneHelp", { timeZone: systemTimeZone.replaceAll("_", " ") })}
					preview={formatDisplayDateTime(PREVIEW_DATE, previewPreferences)}
				>
					<SearchableSelect
						label={t("preferencesCopy.timeZone")}
						value={preferences.timeZone}
						onValueChange={(value) => update("timeZone", value)}
						options={timeZoneOptions}
						placeholder={t("preferencesCopy.chooseTimeZone")}
						showScrollbar
						triggerClassName="h-10 min-h-10"
					/>
				</PreferenceRow>
				<PreferenceRow
					title={t("preferencesCopy.clock")}
					description={t("preferencesCopy.clockHelp")}
					preview={formatDisplayTime(PREVIEW_DATE, previewPreferences)}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.clockFormat")}
						value={preferences.hourCycle}
						onChange={(value) => update("hourCycle", value)}
						options={[
							{ value: "system", label: t("preferencesCopy.system") },
							{ value: "12h", label: t("preferencesCopy.12h") },
							{ value: "24h", label: t("preferencesCopy.24h") },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title={t("preferencesCopy.recentTimes")}
					description={t("preferencesCopy.recentTimesHelp")}
					preview={formatDisplayTimestamp("2026-09-19T15:35:00.000Z", previewPreferences, PREVIEW_DATE)}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.recentTimestampStyle")}
						value={preferences.relativeTime}
						onChange={(value) => update("relativeTime", value)}
						options={[
							{ value: "contextual", label: t("preferencesCopy.contextual") },
							{ value: "relative", label: t("preferencesCopy.relative") },
							{ value: "absolute", label: t("preferencesCopy.absolute") },
						]}
					/>
				</PreferenceRow>
			</SettingsSection>

			<SettingsSection
				id="privacy-heading"
				title={t("preferencesCopy.privacy")}
				description={t("preferencesCopy.privacyHelp")}
			>
				<PreferenceRow
					title={t("preferencesCopy.maskSensitiveData")}
					description={t("preferencesCopy.maskSensitiveDataHelp")}
					preview={preferences.maskSensitiveData ? "dan•••@example.com" : "daniel@example.com"}
				>
					<div className="flex h-10 items-center justify-between rounded-md border border-border px-3">
						<span className="text-sm text-muted-foreground">
							{preferences.maskSensitiveData ? t("preferencesCopy.masked") : t("preferencesCopy.shown")}
						</span>
						<Switch
							checked={preferences.maskSensitiveData}
							onCheckedChange={(checked) => update("maskSensitiveData", Boolean(checked))}
							aria-label={t("preferencesCopy.maskSensitiveData")}
						/>
					</div>
				</PreferenceRow>
			</SettingsSection>

			<SettingsSection
				id="numbers-heading"
				title={t("preferencesCopy.numbers")}
				description={t("preferencesCopy.numbersHelp")}
			>
				<PreferenceRow
					title={t("preferencesCopy.numberFormat")}
					description={t("preferencesCopy.numberFormatHelp")}
					preview={formatDisplayNumber(1_234_567.89, previewPreferences, { maximumFractionDigits: 2 })}
				>
					<PreferenceSelect
						ariaLabel={t("preferencesCopy.numberFormat")}
						value={preferences.numberNotation}
						onChange={(value) => update("numberNotation", value)}
						options={[
							{ value: "standard", label: t("preferencesCopy.standard") },
							{ value: "compact", label: t("preferencesCopy.compact") },
						]}
					/>
				</PreferenceRow>
			</SettingsSection>

			<SettingsSection
				id="appearance-heading"
				title={t("preferencesCopy.appearance")}
				description={t("preferencesCopy.appearanceHelp")}
			>
				<PreferenceRow title={t("preferencesCopy.mode")} description={t("preferencesCopy.modeHelp")}>
					<AppearanceModePicker />
				</PreferenceRow>
				<ThemePresetPicker preferences={preferences} onChange={applyThemePreset} />
				<PreferenceRow title={t("preferencesCopy.lightTheme")} description={t("preferencesCopy.lightThemeHelp")}>
					<PalettePicker
						ariaLabel={t("preferencesCopy.lightPalette")}
						value={preferences.lightPalette}
						onChange={(value) => update("lightPalette", value)}
						options={DISPLAY_LIGHT_PALETTES}
						palette="light"
					/>
				</PreferenceRow>
				<PreferenceRow title={t("preferencesCopy.lightAccent")} description={t("preferencesCopy.lightAccentHelp")}>
					<AccentPicker
						ariaLabel={t("preferencesCopy.lightAccentColour")}
						value={preferences.lightAccent}
						onChange={(value) => update("lightAccent", value)}
					/>
				</PreferenceRow>
				<PreferenceRow title={t("preferencesCopy.darkTheme")} description={t("preferencesCopy.darkThemeHelp")}>
					<PalettePicker
						ariaLabel={t("preferencesCopy.darkPalette")}
						value={preferences.darkPalette}
						onChange={(value) => update("darkPalette", value)}
						options={DISPLAY_DARK_PALETTES}
						palette="dark"
					/>
				</PreferenceRow>
				<PreferenceRow title={t("preferencesCopy.darkAccent")} description={t("preferencesCopy.darkAccentHelp")}>
					<AccentPicker
						ariaLabel={t("preferencesCopy.darkAccentColour")}
						value={preferences.darkAccent}
						onChange={(value) => update("darkAccent", value)}
					/>
				</PreferenceRow>
			</SettingsSection>

			<div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-end">
				<Button
					type="button"
					variant="ghost"
					onClick={() => setPreferences(DEFAULT_DISPLAY_PREFERENCES)}
					disabled={isSaving || JSON.stringify(preferences) === JSON.stringify(DEFAULT_DISPLAY_PREFERENCES)}
				>
					<RotateCcw /> {t("preferencesCopy.resetDefaults")}</Button>
				<Button type="button" onClick={save} disabled={!dirty || isSaving}>
					{isSaving ? <Loader2 className="animate-spin" /> : <Check />}
					{t("preferencesCopy.savePreferences")}</Button>
			</div>
		</div>
	);
}
