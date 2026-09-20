"use client";

import * as React from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { updateDisplayPreferences } from "@/app/(dashboard)/settings/preferences/actions";
import { useDisplayPreferences } from "@/components/providers/DisplayPreferencesProvider";
import { ThemeSelector } from "@/components/theme-toggle";
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

const PALETTE_LABELS = {
	phaseo: "Phaseo",
	paper: "Paper",
	warm: "Warm",
	slate: "Slate",
	midnight: "Midnight",
} as const;

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
	name: string;
	lightPalette: DisplayLightPalette;
	darkPalette: DisplayDarkPalette;
	lightAccent: string;
	darkAccent: string;
};

const THEME_PRESETS: readonly ThemePreset[] = [
	{
		id: "phaseo",
		name: "Phaseo",
		lightPalette: "phaseo",
		darkPalette: "phaseo",
		lightAccent: "#0069a8",
		darkAccent: "#0078b8",
	},
	{
		id: "carbon",
		name: "Carbon",
		lightPalette: "paper",
		darkPalette: "slate",
		lightAccent: "#334155",
		darkAccent: "#60a5fa",
	},
	{
		id: "midnight",
		name: "Midnight",
		lightPalette: "paper",
		darkPalette: "midnight",
		lightAccent: "#4f46e5",
		darkAccent: "#818cf8",
	},
	{
		id: "forest",
		name: "Forest",
		lightPalette: "warm",
		darkPalette: "slate",
		lightAccent: "#15803d",
		darkAccent: "#4ade80",
	},
	{
		id: "ember",
		name: "Ember",
		lightPalette: "warm",
		darkPalette: "midnight",
		lightAccent: "#c2410c",
		darkAccent: "#fb923c",
	},
	{
		id: "orchid",
		name: "Orchid",
		lightPalette: "paper",
		darkPalette: "midnight",
		lightAccent: "#7c3aed",
		darkAccent: "#c084fc",
	},
];

const PREVIEW_DATE = new Date("2026-09-19T16:35:00.000Z");
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
		return intl.supportedValuesOf?.("timeZone") ?? FALLBACK_TIME_ZONES;
	} catch {
		return FALLBACK_TIME_ZONES;
	}
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
	return (
		<div className="grid gap-4 border-t border-border/60 py-5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:items-start">
			<div className="max-w-xl md:pt-1.5">
				<p className="text-sm font-medium">{title}</p>
				<p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<div className="w-full space-y-2 md:justify-self-end">
				{children}
				{preview ? (
					<div className="flex items-baseline justify-between gap-4 px-1 text-xs">
						<span className="font-medium uppercase tracking-[0.12em] text-muted-foreground/70">Preview</span>
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
		<section aria-labelledby={id} className="border-t border-border/70 pt-7 first:border-t-0 first:pt-0">
			<div className="pb-4">
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
			<SelectTrigger aria-label={ariaLabel} className="h-11 w-full">
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
							{PALETTE_LABELS[option as keyof typeof PALETTE_LABELS]}
						</span>
						{active ? <Check className="absolute right-1.5 top-1.5 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" /> : null}
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
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label={ariaLabel}
					className="h-11 w-full justify-between px-3 font-normal"
				>
					<span className="flex min-w-0 items-center gap-2.5">
						<span
							aria-hidden="true"
							className="size-5 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15"
							style={{ backgroundColor: value }}
						/>
						<span className="font-mono text-xs uppercase text-foreground">{value}</span>
					</span>
					<span className="text-xs text-muted-foreground">Edit</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 gap-3 p-3">
				<PopoverHeader>
					<PopoverTitle className="text-sm">Accent colour</PopoverTitle>
					<PopoverDescription className="text-xs">
						Drag across the field or enter an exact value.
					</PopoverDescription>
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
	const activePreset = THEME_PRESETS.find((preset) => presetMatches(preferences, preset));

	return (
		<div className="border-t border-border/60 py-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-sm font-medium">Preset</p>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						Apply a coordinated light and dark theme in one click.
					</p>
				</div>
				<span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
					{activePreset?.name ?? "Custom"}
				</span>
			</div>
			<div role="radiogroup" aria-label="Theme preset" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
							<span className="mt-2 block truncate text-xs font-medium">{preset.name}</span>
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
	const timeZoneOptions = React.useMemo(
		() => [
			{
				value: "system",
				label: `System default (${systemTimeZone.replaceAll("_", " ")})`,
			},
			...timeZones.map((timeZone) => ({
				value: timeZone,
				label: timeZone.replaceAll("_", " "),
			})),
		],
		[systemTimeZone, timeZones],
	);
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
				toast.success("Display preferences saved");
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "Could not save display preferences");
			}
		});
	}

	return (
		<div className="space-y-12 pb-2">
			<SettingsSection
				id="date-time-heading"
				title="Date and time"
				description="Control how dates and times are presented throughout the product. UTC-only diagnostics stay unchanged."
			>
				<PreferenceRow
					title="Locale"
					description="Controls month names, ordering, punctuation, and digit grouping."
					preview={`${formatDisplayDate(PREVIEW_DATE, preferences)} · ${formatDisplayNumber(1_234_567.89, preferences, { maximumFractionDigits: 2 })}`}
				>
					<PreferenceSelect
						ariaLabel="Display locale"
						value={preferences.locale}
						onChange={(value) => update("locale", value)}
						options={[
							{ value: "system", label: "System default" },
							{ value: "en-GB", label: "English (United Kingdom)" },
							{ value: "en-US", label: "English (United States)" },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title="Date format"
					description="Use a familiar regional style or an unambiguous ISO date."
					preview={formatDisplayDate(PREVIEW_DATE, preferences)}
				>
					<PreferenceSelect
						ariaLabel="Date format"
						value={preferences.dateStyle}
						onChange={(value) => update("dateStyle", value)}
						options={[
							{ value: "short", label: "Short" },
							{ value: "medium", label: "Medium" },
							{ value: "long", label: "Long" },
							{ value: "iso", label: "ISO (YYYY-MM-DD)" },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title="Time zone"
					description={`System default currently uses ${systemTimeZone.replaceAll("_", " ")}. Search by city or region.`}
					preview={formatDisplayDateTime(PREVIEW_DATE, preferences)}
				>
					<SearchableSelect
						label="Time zone"
						value={preferences.timeZone}
						onValueChange={(value) => update("timeZone", value)}
						options={timeZoneOptions}
						placeholder="Choose a time zone"
					/>
				</PreferenceRow>
				<PreferenceRow
					title="Clock"
					description="Choose a 12-hour or 24-hour clock."
					preview={formatDisplayTime(PREVIEW_DATE, preferences)}
				>
					<PreferenceSelect
						ariaLabel="Clock format"
						value={preferences.hourCycle}
						onChange={(value) => update("hourCycle", value)}
						options={[
							{ value: "system", label: "System default" },
							{ value: "12h", label: "12-hour" },
							{ value: "24h", label: "24-hour" },
						]}
					/>
				</PreferenceRow>
				<PreferenceRow
					title="Recent times"
					description="Contextual uses relative labels for events within the last day."
					preview={formatDisplayTimestamp("2026-09-19T15:35:00.000Z", preferences, PREVIEW_DATE)}
				>
					<PreferenceSelect
						ariaLabel="Recent timestamp style"
						value={preferences.relativeTime}
						onChange={(value) => update("relativeTime", value)}
						options={[
							{ value: "contextual", label: "Contextual" },
							{ value: "relative", label: "Always relative" },
							{ value: "absolute", label: "Always absolute" },
						]}
					/>
				</PreferenceRow>
			</SettingsSection>

			<SettingsSection
				id="numbers-heading"
				title="Numbers"
				description="Choose the density used for large values in dashboards and summaries."
			>
				<PreferenceRow
					title="Number format"
					description="Compact notation shortens large dashboard values, for example 1.2M."
					preview={formatDisplayNumber(1_234_567.89, preferences, { maximumFractionDigits: 2 })}
				>
					<PreferenceSelect
						ariaLabel="Number format"
						value={preferences.numberNotation}
						onChange={(value) => update("numberNotation", value)}
						options={[
							{ value: "standard", label: "Standard" },
							{ value: "compact", label: "Compact" },
						]}
					/>
				</PreferenceRow>
			</SettingsSection>

			<SettingsSection
				id="appearance-heading"
				title="Appearance"
				description="Build a coordinated light and dark theme. Palette and accent changes update this page immediately."
			>
				<PreferenceRow title="Mode" description="System, light, or dark mode stays specific to this browser.">
					<div className="flex h-11 items-center justify-end rounded-md border border-border px-2">
						<ThemeSelector />
					</div>
				</PreferenceRow>
				<ThemePresetPicker preferences={preferences} onChange={applyThemePreset} />
				<PreferenceRow title="Light theme" description="Used whenever Phaseo is in light mode.">
					<PalettePicker
						ariaLabel="Light theme palette"
						value={preferences.lightPalette}
						onChange={(value) => update("lightPalette", value)}
						options={DISPLAY_LIGHT_PALETTES}
						palette="light"
					/>
				</PreferenceRow>
				<PreferenceRow title="Light accent" description="Used for actions, focus, highlights, and charts in light mode.">
					<AccentPicker
						ariaLabel="Light mode accent colour"
						value={preferences.lightAccent}
						onChange={(value) => update("lightAccent", value)}
					/>
				</PreferenceRow>
				<PreferenceRow title="Dark theme" description="Used whenever Phaseo is in dark mode.">
					<PalettePicker
						ariaLabel="Dark theme palette"
						value={preferences.darkPalette}
						onChange={(value) => update("darkPalette", value)}
						options={DISPLAY_DARK_PALETTES}
						palette="dark"
					/>
				</PreferenceRow>
				<PreferenceRow title="Dark accent" description="Used for actions, focus, highlights, and charts in dark mode.">
					<AccentPicker
						ariaLabel="Dark mode accent colour"
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
					<RotateCcw /> Reset defaults
				</Button>
				<Button type="button" onClick={save} disabled={!dirty || isSaving}>
					{isSaving ? <Loader2 className="animate-spin" /> : <Check />}
					Save preferences
				</Button>
			</div>
		</div>
	);
}
