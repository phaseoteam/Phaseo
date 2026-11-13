import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import { creditGrantsQuery } from "../internalAdmin.functions";
import { createCreditGrantAction } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExpiryDateTimeField from "./ExpiryDateTimeField";
import CreditGrantEditDialog from "./CreditGrantEditDialog";
import { DisplayDateTime } from "@/components/display/DisplayValue";
import { MONEY_LOCALE } from "@/lib/displayPreferences";

export async function getInternalCreditsMetadata() {
	const t = await getTranslations("Product.internalTools.promoCredits");
	return { title: t("title"), description: t("description") };
}

const BIGINT_ZERO = BigInt(0);
const NANOS_PER_USD = BigInt(1_000_000_000);

function formatUsdFromNanos(nanos: number | null | undefined, _locale: string): string {
	const value = Number(nanos ?? 0);
	const formatter = new Intl.NumberFormat(MONEY_LOCALE, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return formatter.format(Number.isFinite(value) ? value / 1_000_000_000 : 0);
}

function parseNanos(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return BigInt(Math.trunc(value));
	}
	if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
		return BigInt(value.trim());
	}
	return BIGINT_ZERO;
}

function formatUsdFromNanosBigInt(nanos: bigint, _locale: string): string {
	return new Intl.NumberFormat(MONEY_LOCALE, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Number(nanos) / Number(NANOS_PER_USD));
}

// The admin gate runs in the credits layout route's beforeLoad; the server
// function re-checks it before returning grants.
export default function InternalCreditsPage() {
	const locale = useLocale();
	const t = useTranslations("Product.internalTools.promoCredits");
	const { data: grants } = useSuspenseQuery(creditGrantsQuery());

	const now = Date.now();
	let outstandingNanos = BIGINT_ZERO;
	for (const grant of grants ?? []) {
		const isActive = Boolean(grant?.is_active);
		if (!isActive) continue;

		const expiresAtRaw = grant?.expires_at ? String(grant.expires_at) : null;
		if (expiresAtRaw) {
			const expiresAtMs = new Date(expiresAtRaw).getTime();
			if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) continue;
		}

		const maxRedemptions = Number(grant?.max_redemptions ?? 0);
		const redemptionsCount = Number(grant?.redemptions_count ?? 0);
		const remainingRedemptions = Math.max(
			0,
			Math.trunc(maxRedemptions) - Math.trunc(redemptionsCount)
		);
		if (remainingRedemptions <= 0) continue;

		const amountNanos = parseNanos(grant?.amount_nanos);
		if (amountNanos <= BIGINT_ZERO) continue;
		outstandingNanos += amountNanos * BigInt(remainingRedemptions);
	}

	return (
		<main className="container mx-auto px-4 py-8 space-y-6">
			<div>
				<h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
				<p className="text-muted-foreground">
					{t("description")}
				</p>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle>{t("createTitle")}</CardTitle>
				</CardHeader>
				<CardContent>
					<form action={(formData) => createCreditGrantAction({ data: formData })} className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="promo-code">{t("code")}</Label>
							<Input
								id="promo-code"
								name="code"
								placeholder="ERRORS"
								required
								autoCapitalize="characters"
								autoCorrect="off"
								spellCheck={false}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="promo-amount-usd">{t("amountUsd")}</Label>
							<Input
								id="promo-amount-usd"
								name="amount_usd"
								type="number"
								min="0.01"
								step="0.01"
								defaultValue="5.00"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="promo-max-redemptions">{t("maxRedemptions")}</Label>
							<Input
								id="promo-max-redemptions"
								name="max_redemptions"
								type="number"
								min="1"
								step="1"
								defaultValue="1"
								required
							/>
						</div>
						<ExpiryDateTimeField />
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="promo-note">{t("internalNoteOptional")}</Label>
							<Input
								id="promo-note"
								name="note"
								placeholder={t("notePlaceholder")}
							/>
						</div>
						<div className="md:col-span-2 flex justify-end">
							<Button type="submit">{t("createCode")}</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<CardTitle>{t("existingTitle")}</CardTitle>
						<div className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
							<p className="uppercase tracking-wide">{t("outstanding")}</p>
							<p className="text-sm font-semibold text-foreground">
								{formatUsdFromNanosBigInt(outstandingNanos, locale)}
							</p>
						</div>
					</div>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<Table wrapInContainer={false}>
						<TableHeader>
							<TableRow className="text-left hover:bg-transparent dark:hover:bg-transparent">
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableCode")}</TableHead>
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableAmount")}</TableHead>
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableUsage")}</TableHead>
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableExpires")}</TableHead>
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableStatus")}</TableHead>
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableCreated")}</TableHead>
								<TableHead className="h-auto py-2 pr-4 pl-0 font-bold text-foreground dark:text-foreground">{t("tableNote")}</TableHead>
								<TableHead className="h-auto py-2 px-0 font-bold text-foreground dark:text-foreground">{t("tableActions")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(grants ?? []).map((grant: any) => {
								const isActive = Boolean(grant?.is_active);
								return (
									<TableRow key={String(grant.id)} className="align-top [&>td]:align-top">
										<TableCell className="py-2 pr-4 pl-0 font-medium">{String(grant.code ?? "-")}</TableCell>
									<TableCell className="py-2 pr-4 pl-0">{formatUsdFromNanos(Number(grant.amount_nanos ?? 0), locale)}</TableCell>
										<TableCell className="py-2 pr-4 pl-0">
											{Number(grant.redemptions_count ?? 0)} / {Number(grant.max_redemptions ?? 0)}
										</TableCell>
										<TableCell className="py-2 pr-4 pl-0"><DisplayDateTime value={grant.expires_at} /></TableCell>
										<TableCell className="py-2 pr-4 pl-0">{isActive ? t("active") : t("inactive")}</TableCell>
										<TableCell className="py-2 pr-4 pl-0"><DisplayDateTime value={grant.created_at} /></TableCell>
										<TableCell className="py-2 pr-4 pl-0">{String(grant.note ?? "-")}</TableCell>
										<TableCell className="px-0 py-2">
											<CreditGrantEditDialog
												grantId={String(grant.id)}
												code={String(grant.code ?? "-")}
												maxRedemptions={Number(grant.max_redemptions ?? 1)}
												redemptionsCount={Number(grant.redemptions_count ?? 0)}
												expiresAt={
													grant.expires_at ? String(grant.expires_at) : null
												}
												isActive={isActive}
												note={grant.note ? String(grant.note) : null}
											/>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</main>
	);
}
