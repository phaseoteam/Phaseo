"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
	canAddValue,
	emptyDimension,
	emptyValue,
	keyFromName,
	moveItem,
	type DraftDimension,
	type DraftValue,
} from "./classifierForm";
import { MAX_DIMENSIONS, MAX_VALUES_PER_DIMENSION } from "./requestClassifiers";

type Problem = { dimension: number | null; value: number | null };

function OrderButtons({ index, count, onMove, upLabel, downLabel }: { index: number; count: number; onMove: (to: number) => void; upLabel: string; downLabel: string }) {
	return (
		<>
			<Button type="button" size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={upLabel}><ArrowUp className="size-4" /></Button>
			<Button type="button" size="icon-sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={downLabel}><ArrowDown className="size-4" /></Button>
		</>
	);
}

/** Add, remove and reorder dimensions and their values. */
export function DimensionsEditor({ dimensions, onChange, problem, disabled }: {
	dimensions: DraftDimension[];
	onChange: (dimensions: DraftDimension[]) => void;
	problem?: Problem | null;
	disabled?: boolean;
}) {
	const t = useTranslations("SettingsUI.classifiers.dimensions");
	const update = (index: number, patch: Partial<DraftDimension>) => onChange(dimensions.map((dimension, itemIndex) => itemIndex === index ? { ...dimension, ...patch } : dimension));
	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">{t("help", { max: MAX_DIMENSIONS, values: MAX_VALUES_PER_DIMENSION })}</p>
			<ol className="divide-y rounded-md border">
				{dimensions.map((dimension, index) => (
					<DimensionRow
						key={dimension.uid}
						dimension={dimension}
						index={index}
						count={dimensions.length}
						problem={problem?.dimension === index ? problem : null}
						disabled={disabled}
						onChange={(patch) => update(index, patch)}
						onMove={(to) => onChange(moveItem(dimensions, index, to))}
						onRemove={() => onChange(dimensions.filter((_, itemIndex) => itemIndex !== index))}
					/>
				))}
			</ol>
			<Button type="button" variant="outline" size="sm" disabled={disabled || dimensions.length >= MAX_DIMENSIONS} onClick={() => onChange([...dimensions, emptyDimension()])}>
				<Plus className="size-4" />{t("addDimension")}
			</Button>
		</div>
	);
}

function DimensionRow({ dimension, index, count, problem, disabled, onChange, onMove, onRemove }: {
	dimension: DraftDimension;
	index: number;
	count: number;
	problem: Problem | null;
	disabled?: boolean;
	onChange: (patch: Partial<DraftDimension>) => void;
	onMove: (to: number) => void;
	onRemove: () => void;
}) {
	const t = useTranslations("SettingsUI.classifiers.dimensions");
	const id = `dimension-${dimension.uid}`;
	const updateValue = (valueIndex: number, patch: Partial<DraftValue>) => onChange({ values: dimension.values.map((entry, itemIndex) => itemIndex === valueIndex ? { ...entry, ...patch } : entry) });
	const dimensionInvalid = problem != null && problem.value == null;
	return (
		<li className="space-y-4 p-4" aria-labelledby={`${id}-title`}>
			<div className="flex items-center justify-between gap-2">
				<p id={`${id}-title`} className="text-sm font-semibold">{dimension.name.trim() || dimension.key.trim() || t("dimensionTitle", { index: index + 1 })}</p>
				<div className="flex items-center">
					<OrderButtons index={index} count={count} onMove={onMove} upLabel={t("moveDimensionUp", { index: index + 1 })} downLabel={t("moveDimensionDown", { index: index + 1 })} />
					<Button type="button" size="icon-sm" variant="ghost" disabled={disabled || count === 1} onClick={onRemove} aria-label={t("removeDimension", { index: index + 1 })}><Trash2 className="size-4" /></Button>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-name`}>{t("name")}</Label>
					<Input id={`${id}-name`} value={dimension.name} disabled={disabled} maxLength={100} placeholder={t("namePlaceholder")} onChange={(event) => {
						const name = event.target.value;
						// Keep the key following the name until someone edits the key.
						const follows = !dimension.key || dimension.key === keyFromName(dimension.name);
						onChange(follows ? { name, key: keyFromName(name) } : { name });
					}} />
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={`${id}-key`}>{t("key")}</Label>
					<Input id={`${id}-key`} value={dimension.key} disabled={disabled} maxLength={64} className="font-mono" aria-invalid={dimensionInvalid || undefined} aria-describedby={`${id}-key-help`} onChange={(event) => onChange({ key: event.target.value })} />
					<p id={`${id}-key-help`} className="text-xs text-muted-foreground">{t("keyHelp")}</p>
				</div>
				<div className="space-y-1.5 sm:col-span-2">
					<Label htmlFor={`${id}-description`}>{t("description")}</Label>
					<Input id={`${id}-description`} value={dimension.description} disabled={disabled} maxLength={500} placeholder={t("descriptionPlaceholder")} onChange={(event) => onChange({ description: event.target.value })} />
				</div>
			</div>
			<div className="flex flex-wrap gap-x-6 gap-y-2">
				<label className="flex items-center gap-2 text-sm"><Switch checked={dimension.multiple} disabled={disabled} onCheckedChange={(multiple) => onChange({ multiple })} />{t("multiple")}</label>
				<label className="flex items-center gap-2 text-sm"><Switch checked={dimension.allowOther} disabled={disabled} onCheckedChange={(allowOther) => onChange({ allowOther })} />{t("allowOther")}</label>
			</div>
			<div className="space-y-2">
				<div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_96px] gap-2 text-xs font-medium text-muted-foreground sm:grid">
					<span>{t("value")}</span><span>{t("valueDescription")}</span><span className="sr-only">{t("valueActions")}</span>
				</div>
				<ul className="space-y-2">
					{dimension.values.map((entry, valueIndex) => (
						<li key={entry.uid} className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_96px]">
							<Input value={entry.value} disabled={disabled} maxLength={64} className={cn("font-mono", problem?.value === valueIndex && "border-destructive")} aria-invalid={problem?.value === valueIndex || undefined} aria-label={t("valueAt", { index: valueIndex + 1 })} placeholder={t("valuePlaceholder")} onChange={(event) => updateValue(valueIndex, { value: event.target.value })} />
							<div className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto">
								<Input value={entry.description} disabled={disabled} maxLength={300} aria-label={t("valueDescriptionAt", { index: valueIndex + 1 })} placeholder={t("valueDescriptionPlaceholder")} onChange={(event) => updateValue(valueIndex, { description: event.target.value })} />
							</div>
							<div className="col-start-2 row-start-1 flex items-center justify-end sm:col-start-auto sm:row-start-auto">
								<OrderButtons index={valueIndex} count={dimension.values.length} onMove={(to) => onChange({ values: moveItem(dimension.values, valueIndex, to) })} upLabel={t("moveValueUp", { index: valueIndex + 1 })} downLabel={t("moveValueDown", { index: valueIndex + 1 })} />
								<Button type="button" size="icon-sm" variant="ghost" disabled={disabled || dimension.values.length <= 1} onClick={() => onChange({ values: dimension.values.filter((_, itemIndex) => itemIndex !== valueIndex) })} aria-label={t("removeValue", { index: valueIndex + 1 })}><Trash2 className="size-4" /></Button>
							</div>
						</li>
					))}
				</ul>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Button type="button" variant="ghost" size="sm" disabled={disabled || !canAddValue(dimension)} onClick={() => onChange({ values: [...dimension.values, emptyValue()] })}>
						<Plus className="size-4" />{t("addValue")}
					</Button>
					{dimension.allowOther ? <p className="text-xs text-muted-foreground">{t("otherAutomatic")}</p> : null}
				</div>
			</div>
		</li>
	);
}
