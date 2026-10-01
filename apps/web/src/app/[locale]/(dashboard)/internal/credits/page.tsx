import { fetchAdminCreditGrants } from "@/lib/fetchers/internal/fetchAdminCreditGrants";
import { getLocale, getTranslations } from "next-intl/server";
import { createCreditGrantAction } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import ExpiryDateTimeField from "./ExpiryDateTimeField";
import CreditGrantEditDialog from "./CreditGrantEditDialog";

export async function generateMetadata() {
	const t = await getTranslations("Product.internalTools.promoCredits");
	return { title: t("title"), description: t("description") };
}

const BIGINT_ZERO = BigInt(0);
const NANOS_PER_USD = BigInt(1_000_000_000);

function formatUsdFromNanos(nanos: number | null | undefined, locale: string): string {
	const value = Number(nanos ?? 0);
	const formatter = new Intl.NumberFormat(locale, {
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

function formatUsdFromNanosBigInt(nanos: bigint, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Number(nanos) / Number(NANOS_PER_USD));
}

function formatDate(value: string | null | undefined, locale: string): string {
	if (!value) return "-";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "-";
	return date.toLocaleString(locale);
}

export default async function InternalCreditsPage() {
	const locale = await getLocale();
	const t = await getTranslations("Product.internalTools.promoCredits");
	const grants = await fetchAdminCreditGrants();

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
					<form action={createCreditGrantAction} className="grid gap-4 md:grid-cols-2">
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
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left">
								<th className="py-2 pr-4">{t("tableCode")}</th>
								<th className="py-2 pr-4">{t("tableAmount")}</th>
								<th className="py-2 pr-4">{t("tableUsage")}</th>
								<th className="py-2 pr-4">{t("tableExpires")}</th>
								<th className="py-2 pr-4">{t("tableStatus")}</th>
								<th className="py-2 pr-4">{t("tableCreated")}</th>
								<th className="py-2 pr-4">{t("tableNote")}</th>
								<th className="py-2">{t("tableActions")}</th>
							</tr>
						</thead>
						<tbody>
							{(grants ?? []).map((grant: any) => {
								const isActive = Boolean(grant?.is_active);
								return (
									<tr key={String(grant.id)} className="border-b align-top">
										<td className="py-2 pr-4 font-medium">{String(grant.code ?? "-")}</td>
									<td className="py-2 pr-4">{formatUsdFromNanos(Number(grant.amount_nanos ?? 0), locale)}</td>
										<td className="py-2 pr-4">
											{Number(grant.redemptions_count ?? 0)} / {Number(grant.max_redemptions ?? 0)}
										</td>
									<td className="py-2 pr-4">{formatDate(grant.expires_at, locale)}</td>
									<td className="py-2 pr-4">{isActive ? t("active") : t("inactive")}</td>
									<td className="py-2 pr-4">{formatDate(grant.created_at, locale)}</td>
										<td className="py-2 pr-4">{String(grant.note ?? "-")}</td>
										<td className="py-2">
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
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</CardContent>
			</Card>
		</main>
	);
}
