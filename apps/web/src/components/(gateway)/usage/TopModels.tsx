"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { DisplayNumber } from "@/components/display/DisplayValue";

type BreakdownRow = {
	id: string;
	label: string;
	subtitle?: string | null;
	spendUsd: number;
	requests: number;
	tokens: number;
	avgLatencyMs: number | null;
};

type TopModelsProps = {
	rows: BreakdownRow[];
	variant?: "model" | "key";
};

const VARIANT_META: Record<
	Required<TopModelsProps>["variant"],
	{ titleKey: string; columnKey: string }
> = {
	model: { titleKey: "Top Models (by spend)", columnKey: "Model" },
	key: { titleKey: "Top API Keys (by spend)", columnKey: "API Key" },
};

export default function TopModels({
	rows,
	variant = "model",
}: TopModelsProps) {
	const t = useTranslations("SettingsUI");
	const meta = VARIANT_META[variant];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t(settingsStringKey(meta.titleKey) as never)}</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t(settingsStringKey(meta.columnKey) as never)}</TableHead>
							<TableHead className="text-right">{t("strings.Spend" as never)}</TableHead>
							<TableHead className="text-right">
								{t("strings.Requests" as never)}
							</TableHead>
							<TableHead className="text-right">{t("strings.Tokens" as never)}</TableHead>
							<TableHead className="text-right">
								{t("strings.Avg Latency (ms)" as never)}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell className="font-medium">
									<div className="flex flex-col">
										<span>{row.label}</span>
										{row.subtitle ? (
											<span className="text-xs text-muted-foreground">
												{row.subtitle}
											</span>
										) : null}
									</div>
								</TableCell>
								<TableCell className="text-right">
									${row.spendUsd.toFixed(5)}
								</TableCell>
								<TableCell className="text-right">
									<DisplayNumber value={row.requests} />
								</TableCell>
								<TableCell className="text-right">
									<DisplayNumber value={row.tokens} />
								</TableCell>
								<TableCell className="text-right">
									{row.avgLatencyMs != null
										? Math.round(row.avgLatencyMs)
										: "-"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
