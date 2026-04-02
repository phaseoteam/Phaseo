import { createClient } from "@/utils/supabase/server";
import { createCreditGrantAction } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import ExpiryDateTimeField from "./ExpiryDateTimeField";
import CreditGrantEditDialog from "./CreditGrantEditDialog";

export const metadata = {
	title: "Internal Credits",
	description: "Admin controls for promo credit grants.",
};

const BIGINT_ZERO = BigInt(0);
const NANOS_PER_USD = BigInt(1_000_000_000);
const NANOS_PER_CENT = BigInt(10_000_000);

function formatUsdFromNanos(nanos: number | null | undefined): string {
	const value = Number(nanos ?? 0);
	if (!Number.isFinite(value)) return "$0.00";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value / 1_000_000_000);
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

function formatUsdFromNanosBigInt(nanos: bigint): string {
	const isNegative = nanos < BIGINT_ZERO;
	const absolute = isNegative ? -nanos : nanos;
	const dollars = absolute / NANOS_PER_USD;
	const cents = (absolute % NANOS_PER_USD) / NANOS_PER_CENT;
	const sign = isNegative ? "-" : "";
	return `${sign}$${dollars.toLocaleString("en-US")}.${cents
		.toString()
		.padStart(2, "0")}`;
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "-";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "-";
	return date.toLocaleString();
}

export default async function InternalCreditsPage() {
	const supabase = await createClient();
	const { data: grants, error } = await supabase
		.from("credit_grants")
		.select(
			"id, code, amount_nanos, max_redemptions, redemptions_count, expires_at, is_active, created_at, disabled_at, note"
		)
		.order("created_at", { ascending: false })
		.limit(250);

	if (error) {
		throw new Error(error.message);
	}

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
				<h1 className="text-3xl font-bold mb-2">Promo Credit Grants</h1>
				<p className="text-muted-foreground">
					Create, disable, and edit friendly promo code grants.
				</p>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle>Create Promo Code</CardTitle>
				</CardHeader>
				<CardContent>
					<form action={createCreditGrantAction} className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="promo-code">Code</Label>
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
							<Label htmlFor="promo-amount-usd">Amount (USD)</Label>
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
							<Label htmlFor="promo-max-redemptions">Max Redemptions</Label>
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
							<Label htmlFor="promo-note">Internal Note (optional)</Label>
							<Input
								id="promo-note"
								name="note"
								placeholder="Apology credit for incident on 2026-03-22"
							/>
						</div>
						<div className="md:col-span-2 flex justify-end">
							<Button type="submit">Create Code</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<CardTitle>Existing Promo Codes</CardTitle>
						<div className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
							<p className="uppercase tracking-wide">Outstanding (active + unexpired)</p>
							<p className="text-sm font-semibold text-foreground">
								{formatUsdFromNanosBigInt(outstandingNanos)}
							</p>
						</div>
					</div>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-left">
								<th className="py-2 pr-4">Code</th>
								<th className="py-2 pr-4">Amount</th>
								<th className="py-2 pr-4">Usage</th>
								<th className="py-2 pr-4">Expires</th>
								<th className="py-2 pr-4">Status</th>
								<th className="py-2 pr-4">Created</th>
								<th className="py-2 pr-4">Note</th>
								<th className="py-2">Actions</th>
							</tr>
						</thead>
						<tbody>
							{(grants ?? []).map((grant: any) => {
								const isActive = Boolean(grant?.is_active);
								return (
									<tr key={String(grant.id)} className="border-b align-top">
										<td className="py-2 pr-4 font-medium">{String(grant.code ?? "-")}</td>
										<td className="py-2 pr-4">{formatUsdFromNanos(Number(grant.amount_nanos ?? 0))}</td>
										<td className="py-2 pr-4">
											{Number(grant.redemptions_count ?? 0)} / {Number(grant.max_redemptions ?? 0)}
										</td>
										<td className="py-2 pr-4">{formatDate(grant.expires_at)}</td>
										<td className="py-2 pr-4">{isActive ? "Active" : "Inactive"}</td>
										<td className="py-2 pr-4">{formatDate(grant.created_at)}</td>
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
