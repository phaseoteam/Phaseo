import { useState } from "react";
import { useTranslations } from "@/i18n/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	LICENSE_GROUPS,
	licenseGroup,
	toggleLicense,
	toggleLicenseGroup,
	type LicenseGroup,
	type LicenseSelection,
	type ModelWeights,
} from "@/lib/models/licenseFilter";
import type { OptionCount } from "./modelsDisplay.types";

const GROUP_LABEL_KEYS = {
	permissive: "licensePermissive",
	restricted: "licenseRestricted",
	proprietary: "licenseProprietary",
} as const satisfies Record<LicenseGroup, string>;

export function useLicenseGroupLabel() {
	const tFilters = useTranslations("Catalogue.models.filtersUi");
	return (group: string) =>
		group in GROUP_LABEL_KEYS ? tFilters(GROUP_LABEL_KEYS[group as LicenseGroup]) : group;
}

const WEIGHTS_LABEL_KEYS = {
	open: "weightsOpen",
	closed: "weightsClosed",
} as const satisfies Record<ModelWeights, string>;

export function useWeightsLabel() {
	const tFilters = useTranslations("Catalogue.models.filtersUi");
	return (value: string) =>
		value in WEIGHTS_LABEL_KEYS ? tFilters(WEIGHTS_LABEL_KEYS[value as ModelWeights]) : value;
}

function FilterRow({
	label,
	count,
	checked,
	partial = false,
	nested = false,
	onToggle,
}: {
	label: string;
	count: number;
	checked: boolean;
	partial?: boolean;
	nested?: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={cn(
				"group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
				nested && "pl-4",
				checked
					? "bg-muted/45 text-foreground hover:bg-muted/55"
					: "hover:bg-muted/50",
			)}
			aria-pressed={checked ? true : partial ? "mixed" : false}
		>
			<span className="flex min-w-0 items-center gap-2">
				<span className={cn("text-sm truncate", partial && "font-medium")}>{label}</span>
			</span>
			<span
				className={cn(
					"inline-flex min-w-5 shrink-0 justify-center text-[11px] tabular-nums",
					checked || partial ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{count}
			</span>
		</button>
	);
}

// Permissive / Restricted / Proprietary rows, each expanding to the licences in that group.
export function LicenseFilterList({
	options,
	selection,
	onChange,
}: {
	options: OptionCount[];
	selection: LicenseSelection;
	onChange: (selection: LicenseSelection) => void;
}) {
	const tFilters = useTranslations("Catalogue.models.filtersUi");
	const groupLabel = useLicenseGroupLabel();
	const [expanded, setExpanded] = useState<LicenseGroup[]>(() =>
		LICENSE_GROUPS.filter((group) =>
			selection.licenses.some((license) => licenseGroup(license) === group),
		),
	);
	const allLicenses = options.map((option) => option.value);
	const groups = LICENSE_GROUPS.map((group) => ({
		group,
		options: options.filter((option) => licenseGroup(option.value) === group),
	})).filter((entry) => entry.options.length > 0);

	if (groups.length === 0) {
		return <div className="px-2 text-xs text-muted-foreground">{tFilters("noOptions")}</div>;
	}

	return (
		<div className="space-y-1.5">
			{groups.map(({ group, options: groupOptions }) => {
				const groupChecked = selection.groups.includes(group);
				const partial =
					!groupChecked &&
					groupOptions.some((option) => selection.licenses.includes(option.value));
				// A group with one licence (Proprietary) has nothing to expand. Inside a
				// group, licences with no models under the other filters are hidden
				// unless selected.
				const expandable = groupOptions.length > 1;
				const listedOptions = groupOptions.filter(
					(option) => option.count > 0 || selection.licenses.includes(option.value),
				);
				const isExpanded = expandable && expanded.includes(group);
				const label = groupLabel(group);
				return (
					<div key={group} className="space-y-1">
						<div className="flex items-center gap-1">
							<FilterRow
								label={label}
								count={groupOptions.reduce((sum, option) => sum + option.count, 0)}
								checked={groupChecked}
								partial={partial}
								onToggle={() => onChange(toggleLicenseGroup(selection, group))}
							/>
							{expandable ? (
								<button
									type="button"
									onClick={() =>
										setExpanded((current) =>
											current.includes(group)
												? current.filter((value) => value !== group)
												: [...current, group],
										)
									}
									className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
									aria-expanded={isExpanded}
									aria-label={tFilters(isExpanded ? "hideLicenses" : "showLicenses", {
										group: label,
									})}
								>
									<ChevronDown
										className={cn(
											"h-3.5 w-3.5 transition-transform",
											isExpanded && "rotate-180",
										)}
									/>
								</button>
							) : (
								// Keeps the counts lined up with the expandable rows.
								<span aria-hidden className="h-7 w-7 shrink-0" />
							)}
						</div>
						{isExpanded ? (
							<div className="ml-2 space-y-1 border-l border-border/60 pr-8">
								{listedOptions.map((option) => (
									<div key={option.value} className="flex">
										<FilterRow
											label={option.value}
											count={option.count}
											checked={groupChecked || selection.licenses.includes(option.value)}
											nested
											onToggle={() =>
												onChange(toggleLicense(selection, option.value, allLicenses))
											}
										/>
									</div>
								))}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
