"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	SetUpAutoTopUp,
	DisableAutoTopUpServer,
} from "@/app/(dashboard)/settings/credits/actions";
import { toast } from "sonner";
import { CreditCard, Info, Loader2 } from "lucide-react";

interface PaymentMethodCard {
	brand?: string | null;
	last4?: string | null;
	exp_month?: number | null;
	exp_year?: number | null;
}

interface PaymentMethod {
	id: string;
	card?: PaymentMethodCard;
}

interface StripeInfo {
	paymentMethods?: PaymentMethod[];
	defaultPaymentMethodId?: string | null;
}

interface Wallet {
	stripe_customer_id?: string | null;
	balance_bigint?: number | null;
	auto_top_up_enabled: boolean | null;
	low_balance_threshold: number | null; // nanos
	auto_top_up_amount: number | null; // nanos
}

interface Props {
	wallet?: Wallet | null;
	stripeInfo?: StripeInfo | null;
	embedded?: boolean;
}

const fmtUSD = (v: number, locale: string) =>
	new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
	}).format(v);

const toNumber = (value: string, locale: string): number | "" => {
	if (value === "") return "";
	const numberFormat = new Intl.NumberFormat(locale, { useGrouping: true });
	const decimalSeparator = new Intl.NumberFormat(locale)
		.formatToParts(1.1)
		.find((part) => part.type === "decimal")?.value ?? ".";
	const groupSeparators = new Set(
		numberFormat.formatToParts(12345.6)
			.filter((part) => part.type === "group")
			.map((part) => part.value),
	);
	const digitFormat = new Intl.NumberFormat(locale, { useGrouping: false });
	let normalized = value;
	for (const [digit, localizedDigit] of Array.from({ length: 10 }, (_, digit) => [
		String(digit),
		digitFormat.format(digit),
	] as const)) {
		normalized = normalized.replaceAll(localizedDigit, digit);
	}
	for (const separator of groupSeparators) {
		normalized = normalized.replaceAll(separator, "");
	}
	normalized = normalized.replace(decimalSeparator, ".").replace(/[^0-9.]/g, "");
	const decimalIndex = normalized.indexOf(".");
	if (decimalIndex >= 0) {
		normalized = `${normalized.slice(0, decimalIndex + 1)}${normalized.slice(decimalIndex + 1).replaceAll(".", "")}`;
	}
	if (!normalized || normalized === ".") return "";
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : "";
};

const formatInputAmount = (value: number, locale: string) =>
	new Intl.NumberFormat(locale, {
		useGrouping: false,
		maximumFractionDigits: 2,
	}).format(value);

// --- helper to choose a sensible default PM ---
function getDefaultPmId(info?: StripeInfo | null): string | null {
	if (!info) return null;
	if (info.defaultPaymentMethodId) return info.defaultPaymentMethodId;
	const first = info.paymentMethods?.[0]?.id ?? null;
	return first ?? null;
}

export default function AutoTopUpClient({
	wallet,
	stripeInfo,
	embedded = false,
}: Props) {
	const locale = useLocale();
	const t = useTranslations("SettingsUI");
	const text = (key: string) => t(`credits.autoTopUpPanel.${key}` as never);
	const minimumTopUpText = text("minimumTopUp").replace("{amount}", fmtUSD(1, locale));
	// Compute current "best" default PM based on provided stripeInfo
	const initialDefaultPm = useMemo(
		() => getDefaultPmId(stripeInfo),
		[stripeInfo]
	);

	const [open, setOpen] = useState(false);
	const [enabled, setEnabled] = useState<boolean>(
		() => wallet?.auto_top_up_enabled === true
	);

	// Always start with the default (or first) payment method if available
	const [selectedPm, setSelectedPm] = useState<string | "new" | null>(
		() => initialDefaultPm
	);

	const [minBefore, setMinBefore] = useState<number | "">(() => {
		if (wallet?.auto_top_up_enabled !== true) return "";
                const v = wallet?.low_balance_threshold ?? null; // nanos
                return v == null ? "" : Math.round(v) / 1e9;
	});

	const [topUpAmount, setTopUpAmount] = useState<number | "">(() => {
		if (wallet?.auto_top_up_enabled !== true) return "";
                const v = wallet?.auto_top_up_amount ?? null; // nanos
                return v == null ? "" : Math.round(v) / 1e9;
	});

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasChanges, setHasChanges] = useState(false);

	const methods: PaymentMethod[] = stripeInfo?.paymentMethods ?? [];
	const methodIds = useMemo(
		() => new Set(methods.map((m) => m.id)),
		[methods]
	);

	// Keep selectedPm sane when dialog opens or stripeInfo changes
	useEffect(() => {
		if (!open) return; // only adjust on open to avoid surprising changes while closed
		const nextDefault = getDefaultPmId(stripeInfo);
		const selectedStillValid =
			selectedPm && selectedPm !== "new" && methodIds.has(selectedPm);
		if (!selectedStillValid) {
			setSelectedPm(nextDefault);
		}
		setHasChanges(false);
	}, [open, stripeInfo, methodIds, selectedPm]);

	async function handleDisable() {
		setError(null);
		setSaving(true);
		try {
			await toast.promise(DisableAutoTopUpServer(), {
				loading: text("disabling"),
				success: text("disabledToast"),
				error: text("disableFailed"),
			});
			setEnabled(false);
			setOpen(false);
			setHasChanges(false);
		} catch {
			setError(text("disableFailed"));
		} finally {
			setSaving(false);
		}
	}

	const canSubmit = useMemo(() => {
		if (!enabled) return true; // allow saving to disable
		if (!selectedPm || selectedPm === "new") return false;
		if (!methodIds.has(selectedPm)) return false;
		if (minBefore === "" || topUpAmount === "") return false;
		if (typeof minBefore !== "number" || typeof topUpAmount !== "number")
			return false;
		if (minBefore <= 0 || topUpAmount <= 0) return false;
		if (topUpAmount < 1) return false; // guardrail: minimum $1
		return true;
	}, [enabled, selectedPm, minBefore, topUpAmount, methodIds]);

	async function handleSave() {
		setError(null);
		setSaving(true);
		try {
			const payload = {
				enabled,
				min_balance_nanos:
					typeof minBefore === "number"
                                                ? Math.round(minBefore * 1e9)
                                                : null,
				top_up_amount_nanos:
					typeof topUpAmount === "number"
                                                ? Math.round(topUpAmount * 1e9)
                                                : null,
				auto_top_up_account_id:
					selectedPm && selectedPm !== "new" ? selectedPm : null,
			};

			await toast.promise(
				SetUpAutoTopUp({
					balanceThreshold: payload.min_balance_nanos ?? 0,
					topUpAmount: payload.top_up_amount_nanos ?? 0,
					paymentMethodId: payload.auto_top_up_account_id ?? null,
				}),
				{
					loading: text("saving"),
					success: text("enabledToast"),
					error: text("saveFailed"),
				}
			);

			setEnabled(true);
			setOpen(false);
			setHasChanges(false);
		} catch {
			setError(text("saveFailed"));
		} finally {
			setSaving(false);
		}
	}

	function PMTile({
		pm,
		active,
		onClick,
		isDefault,
	}: {
		pm: PaymentMethod;
		active: boolean;
		onClick: () => void;
		isDefault?: boolean;
	}) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"w-full text-left rounded-2xl p-3 transition-all",
					active
						? "border-indigo-600 shadow-md"
						: "border border-zinc-200 hover:shadow-sm hover:translate-y-[-1px] hover:scale-[1.001] hover:bg-white"
				)}
				aria-pressed={active}
			>
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="rounded-lg bg-zinc-50 p-2 flex items-center justify-center shadow-sm">
							<CreditCard className="h-5 w-5 text-zinc-700" />
						</div>

						<div className="leading-tight">
							<div className="text-sm text-zinc-800 font-medium capitalize">
								<span data-pii="true">****{pm.card?.last4 ?? ""}</span>
							</div>
							<div className="text-xs text-zinc-500 capitalize">
								{pm.card?.brand ?? text("card")}
							</div>
						</div>
					</div>

					{/* right-side check/default area */}
					<div className="flex items-center gap-2">
						{isDefault && (
							<span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">
														{text("default")}
							</span>
						)}

						{active ? (
							<span className="inline-flex items-center rounded-full bg-indigo-600 p-1">
								<Check className="h-3 w-3 text-white" />
							</span>
						) : (
							<span className="inline-flex items-center rounded-full bg-zinc-100 p-1">
								<Check className="h-3 w-3 text-transparent" />
							</span>
						)}
					</div>
				</div>
			</button>
		);
	}

	const Container = embedded ? "div" : Card;

	return (
		<Container className={embedded ? "space-y-3" : undefined}>
			<CardHeader
				className={cn(
					"flex flex-row items-center justify-between pb-0",
					embedded && "p-0"
				)}
			>
				<CardTitle
					className={cn(
						"flex items-center gap-2",
						embedded && "text-base font-semibold"
					)}
				>
					{text("title")}
					<Tooltip>
						<TooltipTrigger asChild>
							<Info className="h-4 w-4 text-zinc-500" />
						</TooltipTrigger>
						<TooltipContent>
							<p>{text("description")}</p>
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<Badge
					className={cn(
						"text-xs rounded-full transition-colors",
						enabled
							? "bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-900 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
							: "bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
					)}
				>
					{enabled ? text("enabled") : text("disabled")}
				</Badge>
			</CardHeader>

			{embedded ? null : <Separator className="my-4" />}

			<CardContent className={cn("space-y-3", embedded && "p-0")}>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button variant="outline" className="w-full">
							{enabled ? text("configure") : text("enable")}
						</Button>
					</DialogTrigger>

					<DialogContent className="sm:max-w-lg p-0 overflow-hidden">
						<div className="px-6 pt-6">
							<DialogHeader className="space-y-1">
								<DialogTitle className="text-xl">
									{text("configureTitle")}
								</DialogTitle>
							</DialogHeader>
						</div>

						<div className="px-6 py-4 space-y-4">
							{/* Info */}
							<div className="rounded-lg border p-3">
								<div>
									<div className="font-medium">
										{text("title")}
									</div>
									<p className="text-sm text-zinc-600">
																		{text("description")}
									</p>
								</div>
							</div>

							{/* Payment methods */}
							<section>
								<Label className="text-sm">
									{text("paymentMethod")}
								</Label>
								<div className="mt-2">
									{methods?.length ? (
										<div
											role="radiogroup"
												aria-label={text("selectPaymentMethod")}
											className="grid grid-cols-1 items-start gap-3"
										>
											{methods
												.slice(0, 2)
												.map((pm: PaymentMethod) => {
													const active =
														selectedPm === pm.id;
													const isDefault =
														stripeInfo?.defaultPaymentMethodId ===
														pm.id;
													return (
														<div key={pm.id}>
															<PMTile
																pm={pm}
																active={
																	!!active
																}
																onClick={() => {
																	setSelectedPm(
																		pm.id
																	);
																	setHasChanges(
																		true
																	);
																}}
																isDefault={
																	isDefault
																}
															/>
														</div>
													);
												})}

											{methods.length > 2 ? (
												<div className="flex items-center">
													<div className="relative">
														<button
															type="button"
																	className="rounded-2xl p-3 border border-zinc-200 hover:bg-zinc-50 w-12 h-12 grid place-items-center"
															aria-haspopup="menu"
															aria-label={text("morePaymentMethods")}
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																className="h-4 w-4"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
															>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	strokeWidth="2"
																	d="M6 9l6 6 6-6"
																/>
															</svg>
														</button>

														<div className="absolute left-0 mt-2 w-72 rounded-md border bg-white shadow-lg z-10">
															<div className="p-2">
																{methods
																	.slice(2)
																	.map(
																		(
																			pm: PaymentMethod
																		) => (
																			<button
																				key={
																					pm.id
																				}
																				type="button"
																				onClick={() => {
																					setSelectedPm(
																						pm.id
																					);
																					setHasChanges(
																						true
																					);
																				}}
																				className="w-full text-left rounded-md p-2 hover:bg-zinc-50 flex items-center justify-between"
																			>
																				<div className="leading-tight">
																					<div className="text-sm font-medium">
																						<span className="text-zinc-700" data-pii="true">
																							****{pm.card?.last4}
																						</span>
																						<div className="text-xs text-zinc-500 capitalize">
																							{pm
																								.card
																								?.brand ??
																								text("card")}
																						</div>
																					</div>
																				</div>
																				{stripeInfo?.defaultPaymentMethodId ===
																					pm.id && (
																					<Badge
																						variant="secondary"
																						className="text-[10px]"
																					>
																						{text("default")}
																					</Badge>
																				)}
																			</button>
																		)
																	)}
															</div>
														</div>
													</div>
													<div className="text-xs text-zinc-500 ml-2">
														+{new Intl.NumberFormat(locale).format(methods.length - 2)}
													</div>
												</div>
											) : null}
										</div>
									) : (
										<div className="rounded-lg border p-4 text-sm text-zinc-600">
											{text("noPaymentMethods")}
										</div>
									)}
								</div>
							</section>

							{/* Thresholds */}
							<section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<Label
										htmlFor="min-before"
										className="mb-2"
									>
										{text("thresholdLabel")}
									</Label>
									<Input
										id="min-before"
										inputMode="decimal"
										placeholder={text("thresholdPlaceholder")}
										value={
											minBefore === ""
																			? ""
																				: formatInputAmount(minBefore, locale)
										}
										onChange={(e) => {
												setMinBefore(
													toNumber(e.target.value, locale)
											);
											setHasChanges(true);
										}}
									/>
									<p className="mt-1 text-xs text-zinc-500">
										{text("thresholdHint")}
									</p>
								</div>
								<div>
									<Label
										htmlFor="topup-amount"
										className="mb-2"
									>
										{text("amountLabel")}
									</Label>
									<Input
										id="topup-amount"
										inputMode="decimal"
										placeholder={text("amountPlaceholder")}
										value={
											topUpAmount === ""
													? ""
														: formatInputAmount(topUpAmount, locale)
										}
										onChange={(e) => {
												setTopUpAmount(
													toNumber(e.target.value, locale)
											);
											setHasChanges(true);
										}}
									/>
									<p className="mt-1 text-xs text-zinc-500">
										{minimumTopUpText}
									</p>
								</div>
							</section>

							{error && (
								<div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md p-2">
									{error}
								</div>
							)}
						</div>

						{/* Sticky footer */}
						<div className="sticky bottom-0 w-full border-t bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
							<div className="px-6 py-3 flex items-center justify-between gap-3">
								<DialogClose asChild>
									<Button
										variant="secondary"
										disabled={saving}
									>
										{text("cancel")}
									</Button>
								</DialogClose>
								{enabled && hasChanges ? (
									<Button
										onClick={handleSave}
										className="min-w-[10rem]"
										disabled={!canSubmit || saving}
									>
										{saving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												{text("savingShort")}
											</>
										) : (
											text("saveChanges")
										)}
									</Button>
								) : enabled ? (
									<Button
										variant="destructive"
										onClick={handleDisable}
										className="min-w-[10rem]"
										disabled={saving}
									>
										{saving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												{text("disablingShort")}
											</>
										) : (
											text("disable")
										)}
									</Button>
								) : (
									<Button
										onClick={handleSave}
										className="min-w-[10rem]"
										disabled={!canSubmit || saving}
									>
										{saving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												{text("savingShort")}
											</>
										) : (
											text("saveAndEnable")
										)}
									</Button>
								)}
							</div>
						</div>
					</DialogContent>
				</Dialog>

				{/* Summary row */}
				<div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<div className="rounded-lg border p-2.5">
						<div className="text-xs text-zinc-500">{text("triggersAt")}</div>
						<div className="font-medium">
							{minBefore === "" ? "—" : fmtUSD(Number(minBefore), locale)}
						</div>
					</div>
					<div className="rounded-lg border p-2.5">
						<div className="text-xs text-zinc-500">
							{text("amountLabelSummary")}
						</div>
						<div className="font-medium">
							{topUpAmount === ""
								? "—"
								: fmtUSD(Number(topUpAmount), locale)}
						</div>
					</div>
				</div>
			</CardContent>
		</Container>
	);
}
