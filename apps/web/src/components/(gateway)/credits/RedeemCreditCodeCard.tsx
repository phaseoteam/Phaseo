"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Callout } from "@/components/ui/callout";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { redeemCreditCodeAction } from "@/app/(dashboard)/settings/credits/actions";
import { normalizePromoCodeInput } from "@/lib/credits/promoCodes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

type TeamOption = {
	id: string;
	name: string;
};

type ButtonState = "idle" | "submitting" | "success" | "error";
type ResultTone = "success" | "error";

type Props = {
	teams: TeamOption[];
	invoiceTeamIds?: string[];
	defaultWorkspaceId?: string | null;
	disabled?: boolean;
	disabledReason?: string | null;
	title?: string;
	description?: string;
	submitLabel?: string;
	showTeamSelector?: boolean;
	showDisclaimer?: boolean;
	disclaimerText?: string;
	className?: string;
	initialCode?: string;
};

export default function RedeemCreditCodeCard(props: Props) {
	const t = useTranslations("SettingsUI.credits");
	const format = useDisplayFormatters();
	const {
		teams,
		invoiceTeamIds = [],
		defaultWorkspaceId = null,
		disabled = false,
		disabledReason = null,
		title,
		description,
		submitLabel,
		showTeamSelector = true,
		showDisclaimer = false,
		disclaimerText,
		className,
		initialCode = "",
	} = props;
	const resolvedTitle = title ?? t("redeemCreditCode");
	const resolvedDescription = description ?? t("redeemCreditDescription");
	const resolvedSubmitLabel = submitLabel ?? t("redeemCode");
	const resolvedDisclaimerText = disclaimerText ?? t("promoDisclaimer");
	const [code, setCode] = useState(initialCode);
	const [selectedTeamId, setSelectedTeamId] = useState<string>(
		defaultWorkspaceId ?? teams[0]?.id ?? ""
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [buttonState, setButtonState] = useState<ButtonState>("idle");
	const [resultMessage, setResultMessage] = useState<string | null>(null);
	const [resultTone, setResultTone] = useState<ResultTone | null>(null);

	const teamOptions = useMemo(() => {
		const map = new Map<string, string>();
		for (const team of teams) {
			if (!team?.id) continue;
			map.set(String(team.id), String(team.name ?? t("team")));
		}
		return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
	}, [teams, t]);
	// The select shows the chosen item's label, not its id.
	const teamItems = useMemo(
		() => teamOptions.map((team) => ({ value: team.id, label: team.name })),
		[teamOptions]
	);
	const invoiceTeamIdSet = useMemo(() => {
		const set = new Set<string>();
		for (const workspaceId of invoiceTeamIds) {
			const safeTeamId = String(workspaceId ?? "").trim();
			if (safeTeamId) set.add(safeTeamId);
		}
		return set;
	}, [invoiceTeamIds]);
	const selectedTeamIsInvoice =
		selectedTeamId.length > 0 && invoiceTeamIdSet.has(selectedTeamId);
	const effectiveDisabledReason = selectedTeamIsInvoice
		? t("creditCodesInvoiceDisabled")
		: disabledReason;

	useEffect(() => {
		if (defaultWorkspaceId && teamOptions.some((team) => team.id === defaultWorkspaceId)) {
			setSelectedTeamId(defaultWorkspaceId);
			return;
		}
		if (teamOptions.length > 0 && !teamOptions.some((team) => team.id === selectedTeamId)) {
			setSelectedTeamId(teamOptions[0].id);
		}
	}, [defaultWorkspaceId, teamOptions, selectedTeamId]);

	async function onRedeem() {
		if (isSubmitting) return;

		const normalizedCode = normalizePromoCodeInput(code);
		if (!normalizedCode) {
			toast.error(t("enterCreditCode"));
			return;
		}
		if (!selectedTeamId) {
			toast.error(t("selectTeamError"));
			return;
		}
		if (selectedTeamIsInvoice) {
			const message = t("creditCodesInvoiceDisabled");
			setButtonState("error");
			setResultMessage(message);
			setResultTone("error");
			toast.error(message);
			return;
		}

		setIsSubmitting(true);
		setButtonState("submitting");
		setResultMessage(null);
		setResultTone(null);

		const startedAt = Date.now();
		try {
			const result = await redeemCreditCodeAction({ data: {
				code: normalizedCode,
				workspaceId: selectedTeamId,
			} });
			const elapsedMs = Date.now() - startedAt;
			if (elapsedMs < 400) {
				await new Promise((resolve) => setTimeout(resolve, 400 - elapsedMs));
			}

			if (!result.ok) {
				setButtonState("error");
				setResultMessage(result.message);
				setResultTone("error");
				toast.error(result.message);
				return;
			}

			const applied = Number(result.amountNanos ?? 0);
			const appliedAmountText =
				Number.isFinite(applied) && applied > 0
					? `+${format.number(applied / 1_000_000_000, {
							style: "currency",
							currency: "USD",
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
							notation: "standard",
						})}`
					: null;
				const targetTeam =
					teamOptions.find((team) => team.id === selectedTeamId)?.name ?? t("selectedTeam");
			const successMessage = appliedAmountText
				? `${result.message} ${appliedAmountText} applied to ${targetTeam}.`
				: result.message;
			setButtonState("success");
			setResultMessage(successMessage);
			setResultTone("success");
			const appliedLabel =
				Number.isFinite(applied) && applied > 0
					? ` (+${format.number(applied / 1_000_000_000, {
							style: "currency",
							currency: "USD",
							minimumFractionDigits: 2,
							maximumFractionDigits: 2,
							notation: "standard",
						})})`
					: "";
			toast.success(`${result.message}${appliedLabel}`);
		} finally {
			setIsSubmitting(false);
		}
	}

	const buttonCopy =
		buttonState === "submitting"
			? t("redeeming")
			: buttonState === "success"
				? t("redeemed")
				: buttonState === "error"
					? t("redeemAgain")
					: resolvedSubmitLabel;
	const ButtonIcon =
		buttonState === "success"
			? CheckCircle2
			: buttonState === "error"
				? AlertTriangle
				: Sparkles;

	return (
		<Card className={className}>
			<CardHeader className="pb-2">
			<CardTitle>{resolvedTitle}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{effectiveDisabledReason ? (
					<p className="text-sm text-muted-foreground">{effectiveDisabledReason}</p>
				) : (
					<p className="text-sm text-muted-foreground">{resolvedDescription}</p>
				)}

				<div
					className={cn(
						"grid gap-4",
						showTeamSelector ? "md:grid-cols-2" : "grid-cols-1"
					)}
				>
					<div className="space-y-2">
						<Label htmlFor="redeem-credit-code">{t("code")}</Label>
						<Input
							id="redeem-credit-code"
							value={code}
							onChange={(event) => setCode(event.target.value)}
							onBlur={() => setCode((prev) => normalizePromoCodeInput(prev))}
							placeholder="ERRORS"
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
							disabled={disabled || isSubmitting}
						/>
					</div>
					{showTeamSelector ? (
						<div className="space-y-2">
							<Label htmlFor="redeem-credit-team">{t("team")}</Label>
							<Select
								value={selectedTeamId}
								items={teamItems}
								onValueChange={setSelectedTeamId}
								disabled={disabled || isSubmitting || teamOptions.length === 0}
							>
								<SelectTrigger id="redeem-credit-team">
									<SelectValue placeholder={t("selectTeam")} />
								</SelectTrigger>
								<SelectContent>
									{teamOptions.map((team) => (
										<SelectItem key={team.id} value={team.id}>
											{team.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</div>

				<div className="flex w-full">
					<Button
						type="button"
						onClick={onRedeem}
						disabled={
							disabled ||
							isSubmitting ||
							!selectedTeamId ||
							selectedTeamIsInvoice
						}
						className={cn(
							"h-11 w-full text-base font-semibold shadow-sm transition-all duration-200",
							buttonState === "success" &&
								"border border-emerald-200 !bg-emerald-50 !text-emerald-900 hover:!bg-emerald-100 dark:border-emerald-900/60 dark:!bg-emerald-950/30 dark:!text-emerald-100 dark:hover:!bg-emerald-950/50",
							buttonState === "error" &&
								"border border-red-200 !bg-red-50 !text-red-900 hover:!bg-red-100 dark:border-red-900/60 dark:!bg-red-950/30 dark:!text-red-100 dark:hover:!bg-red-950/50"
						)}
					>
						{buttonState === "submitting" ? (
							<Spinner className="mr-2 h-5 w-5" />
						) : (
							<ButtonIcon className="mr-2 h-5 w-5" />
						)}
						{buttonCopy}
					</Button>
				</div>

				{resultMessage ? (
					<Callout
						tone={resultTone === "error" ? "critical" : "success"}
						icon={resultTone === "error" ? AlertTriangle : CheckCircle2}
						role={resultTone === "error" ? "alert" : "status"}
					>
						<p>{resultMessage}</p>
					</Callout>
				) : null}

				{showDisclaimer ? (
					<Alert className="bg-muted/40 text-xs">
						<Info className="h-4 w-4" />
						<AlertDescription>
							<p>{resolvedDisclaimerText}</p>
						</AlertDescription>
					</Alert>
				) : null}
			</CardContent>
		</Card>
	);
}
