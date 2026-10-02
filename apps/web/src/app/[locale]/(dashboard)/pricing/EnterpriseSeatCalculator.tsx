"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENTERPRISE_MAX_QUOTED_MEMBERS, ENTERPRISE_MAX_SELF_SERVE_MEMBERS, ENTERPRISE_MEMBER_OVERAGE_USD, ENTERPRISE_MIN_SELF_SERVE_MEMBERS, enterpriseTierForMembers } from "@/lib/billing/enterprisePricing";
import {
	useDisplayFormatters,
	useDisplayPreferences,
} from "@/components/providers/DisplayPreferencesProvider";

const features = [
	"sso",
	"scim",
	"departments",
	"audit",
	"priority",
] as const;

function memberRange(start: number, end: number, step: number) {
	const values: number[] = [];
	for (let value = start; value <= end; value += step) values.push(value);
	return values;
}

const MEMBER_STEPS = [
	ENTERPRISE_MIN_SELF_SERVE_MEMBERS,
	...memberRange(125, 1_000, 25),
	...memberRange(1_050, 2_500, 50),
	...memberRange(2_600, 5_000, 100),
	...memberRange(5_250, 10_000, 250),
	...memberRange(10_500, 25_000, 500),
	...memberRange(26_000, 50_000, 1_000),
	...memberRange(52_500, ENTERPRISE_MAX_SELF_SERVE_MEMBERS, 2_500),
] as const;

function closestMemberStepIndex(memberCount: number) {
	let closestIndex = 0;
	let smallestDistance = Number.POSITIVE_INFINITY;
	MEMBER_STEPS.forEach((value, index) => {
		const distance = Math.abs(value - memberCount);
		if (distance < smallestDistance) {
			closestIndex = index;
			smallestDistance = distance;
		}
	});
	return closestIndex;
}

function tickPosition(memberCount: number) {
	return `${(closestMemberStepIndex(memberCount) / (MEMBER_STEPS.length - 1)) * 100}%`;
}

function Included() {
	const t = useTranslations("Site.pricing");
	return <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />{t("included")}</span>;
}

export function EnterpriseSeatCalculator() {
	const t = useTranslations("Site.pricing");
	const translate = t as unknown as (key: string, values?: Record<string, unknown>) => string;
	const format = useDisplayFormatters();
	const { formattingPreferences } = useDisplayPreferences();
	const formatNumber = (value: number) => format.number(value, { notation: "standard" });
	const formatUsd = (value: number) => format.number(value, { style: "currency", currency: "USD", maximumFractionDigits: 2, notation: "standard" });
	const minimumCreditFee = format.number(1, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
	const [members, setMembers] = useState(100);
	const pricing = enterpriseTierForMembers(members);

	function updateMembers(value: number) {
		setMembers(Math.min(ENTERPRISE_MAX_QUOTED_MEMBERS, Math.max(ENTERPRISE_MIN_SELF_SERVE_MEMBERS, Math.round(value))));
	}

	const overageMembers = Math.max(0, members - ENTERPRISE_MAX_SELF_SERVE_MEMBERS);
	const estimatedMonthlyUsd = pricing.coreMonthlyUsd + overageMembers * ENTERPRISE_MEMBER_OVERAGE_USD;

	return (
		<div className="border-y border-border">
			<div className="grid gap-6 border-b border-border py-6 lg:grid-cols-[1fr_0.72fr] lg:items-end">
				<div>
					<div className="flex items-end justify-between gap-4">
						<label htmlFor="enterprise-members" className="text-sm font-semibold text-foreground">{t("activeMembers")}</label>
						<div className="relative w-44">
							<Input
								id="enterprise-members"
								type="text"
								inputMode="numeric"
								value={format.number(members, { notation: "standard" })}
								onChange={(event) => updateMembers(Number(event.target.value.replace(/\D/g, "")) || 1)}
								className="h-10 pr-12 text-right font-medium tabular-nums"
							/>
							<span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">{t("users")}</span>
						</div>
					</div>
					<Slider
						aria-label={t("activeMembers")}
						aria-valuetext={t("activeMembersValue", { count: members })}
						className="mt-5"
						min={0}
						max={MEMBER_STEPS.length - 1}
						step={1}
						value={Math.min(closestMemberStepIndex(members), MEMBER_STEPS.length - 1)}
						onValueChange={(value) => updateMembers(MEMBER_STEPS[value[0] ?? 0] ?? 1)}
					/>
					<div className="relative mt-1 h-4 text-[11px] tabular-nums text-muted-foreground">
						<span className="absolute left-0">{formatNumber(100)}</span>
						<span className="absolute -translate-x-1/2" style={{ left: tickPosition(1_000) }}>{formatNumber(1_000)}</span>
						<span className="absolute -translate-x-1/2" style={{ left: tickPosition(2_500) }}>{formatNumber(2_500)}</span>
						<span className="absolute -translate-x-1/2" style={{ left: tickPosition(10_000) }}>{formatNumber(10_000)}</span>
						<span className="absolute -translate-x-1/2" style={{ left: tickPosition(25_000) }}>{formatNumber(25_000)}</span>
						<span className="absolute right-0">{formatNumber(100_000)}</span>
					</div>
				</div>

				<div className="border-l border-border pl-6">
					<p className="text-xs font-medium text-muted-foreground">{t("enterpriseSubscription")}</p>
					<p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">$<NumberFlow value={estimatedMonthlyUsd} locales={formattingPreferences.locale} format={{ maximumFractionDigits: 2, notation: "standard" }} /><span className="text-sm font-normal text-muted-foreground">{t("monthEstimated")}</span></p>
					{overageMembers > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("memberOverageSummary", { base: formatUsd(1_999), count: formatNumber(overageMembers), rate: formatUsd(ENTERPRISE_MEMBER_OVERAGE_USD) })}</p> : null}
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-[62%] pl-0">{t("whatYouGet")}</TableHead>
						<TableHead>{t("selfServeEnterprise")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{features.map((feature) => (
						<TableRow key={feature}>
							<TableCell className="py-3 pl-0 font-medium text-foreground">{translate(`features.${feature}`)}</TableCell>
							<TableCell className="py-3"><Included /></TableCell>
						</TableRow>
					))}
					<TableRow>
						<TableCell className="py-3 pl-0 font-medium text-foreground">{t("membersAboveLimit", { limit: formatNumber(ENTERPRISE_MAX_SELF_SERVE_MEMBERS) })}</TableCell>
						<TableCell className="py-3">{t("overageRate", { rate: formatUsd(ENTERPRISE_MEMBER_OVERAGE_USD) })}</TableCell>
					</TableRow>
					<TableRow>
						<TableCell className="py-3 pl-0 font-medium text-foreground">{t("creditTopUpFee")}</TableCell>
						<TableCell className="py-3">
							{translate("matrix.enterpriseCreditPurchaseFee", { minimum: minimumCreditFee })}
						</TableCell>
					</TableRow>
					<TableRow>
						<TableCell className="py-3 pl-0 font-medium text-foreground">{t("modelUsageCredits")}</TableCell>
						<TableCell className="py-3 text-muted-foreground">{t("purchasedSeparately")}</TableCell>
					</TableRow>
					<TableRow>
						<TableCell className="py-3 pl-0 font-medium text-foreground">{t("committedModelSpend")}</TableCell>
						<TableCell className="py-3">{t("none")}</TableCell>
					</TableRow>
				</TableBody>
			</Table>
			<p className="py-5 text-xs leading-5 text-muted-foreground">{t("usdNote")}</p>
		</div>
	);
}
