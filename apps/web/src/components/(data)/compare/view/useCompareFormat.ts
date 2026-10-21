"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { formatUsd } from "./compareViewMath";
import type { CompareUsageWindow, CompareViewPriceRow } from "./types";

const MODALITY_KEYS: Record<string, string> = {
	text: "modalityText",
	image: "modalityImage",
	audio: "modalityAudio",
	speech: "modalitySpeech",
	video: "modalityVideo",
	music: "modalityMusic",
	embeddings: "modalityEmbeddings",
	embedding: "modalityEmbeddings",
	transcription: "modalityTranscription",
};

const STATUS_KEYS: Record<string, string> = {
	active: "statusAvailable",
	available: "statusAvailable",
	preview: "statusPreview",
	deprecated: "statusDeprecated",
	retired: "statusRetired",
	announced: "statusAnnounced",
	rumoured: "statusRumoured",
	limited_access: "statusLimitedAccess",
	withheld: "statusWithheld",
};

const UNITS = ["token", "request", "character", "image", "second", "minute", "hour", "page", "video"] as const;
type KnownUnit = (typeof UNITS)[number];
const KNOWN_UNITS = new Set<string>(UNITS);

function capitalise(value: string): string {
	const spaced = value.replace(/[_-]+/g, " ").trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Formatting shared by every compare section, so the same value always reads the same. */
export function useCompareFormat() {
	const tCompare = useTranslations("Catalogue.compare");
	const t = useTranslations("Catalogue.compareView");
	const format = useDisplayFormatters();
	return useMemo(() => {
		const known = (key: string | undefined, fallback: string) => (key ? tCompare(key as never) : fallback);
		return {
			usd: formatUsd,
			tokens: (value: number) => format.number(value, { maximumFractionDigits: 0 }),
			latency: (ms: number) => ms >= 1000
				? t("seconds", { value: format.number(ms / 1000, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) })
				: t("milliseconds", { value: format.number(ms, { maximumFractionDigits: 0 }) }),
			throughput: (value: number) => t("tokensPerSecond", { value: format.number(value, { maximumFractionDigits: 0 }) }),
			monthYear: (value: string) => format.dateParts(value, { month: "short", year: "numeric", timeZone: "UTC" }),
			date: (value: string) => format.dateParts(value, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
			modality: (type: string) => known(MODALITY_KEYS[type.toLowerCase()], capitalise(type)),
			modalities: (types: string[]) => types.map((type) => known(MODALITY_KEYS[type.toLowerCase()], capitalise(type))).join(", "),
			status: (status: string | null) => (status ? known(STATUS_KEYS[status.toLowerCase()], capitalise(status)) : ""),
			tier: (tier: string) => capitalise(tier),
			meter: (row: Pick<CompareViewPriceRow, "label" | "meter">) => row.label?.trim() || capitalise(row.meter),
			window: (window: CompareUsageWindow | null | undefined) =>
				window ? t(`window${window}`) : t("window5d"),
			/** "$10.00" for token prices (the section states per 1M), "$0.10 per 1K characters" otherwise. */
			price: (row: Pick<CompareViewPriceRow, "price" | "per" | "unit">, { tokenUnit = false } = {}) => {
				if (row.unit === "token" && !tokenUnit) return formatUsd((row.price / row.per) * 1_000_000);
				const quantity = row.unit === "token" ? 1_000_000 : row.per;
				const value = formatUsd((row.price / row.per) * quantity);
				return t("pricePer", {
					price: value,
					quantity: quantity === 1 ? "" : quantity >= 1_000_000 ? "1M" : quantity >= 1000 ? `${quantity / 1000}K` : String(quantity),
					unit: KNOWN_UNITS.has(row.unit)
						? t(`unit.${row.unit as KnownUnit}`, { count: quantity })
						: row.unit.replace(/[_-]+/g, " "),
				}).replace(/\s+/g, " ");
			},
		};
	}, [format, t, tCompare]);
}

export type CompareFormat = ReturnType<typeof useCompareFormat>;
