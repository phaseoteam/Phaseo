"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	buildExpirySelectionPreview,
	buildExpiryUtcIso,
	getBrowserTimeZone,
} from "@/lib/credits/expiryDateTime";

type Props = {
	defaultTime?: string;
};

export default function ExpiryDateTimeField({
	defaultTime = "23:59",
}: Props) {
	const locale = useLocale();
	const t = useTranslations("Product.internalTools.promoCredits");
	const [dateValue, setDateValue] = useState("");
	const [timeValue, setTimeValue] = useState(defaultTime);

	const hiddenExpiresAt = useMemo(() => {
		return buildExpiryUtcIso(dateValue, timeValue, defaultTime);
	}, [dateValue, timeValue, defaultTime]);
	const expiryPreview = useMemo(() => {
		return buildExpirySelectionPreview(dateValue, timeValue, defaultTime, locale);
	}, [dateValue, timeValue, defaultTime, locale]);
	const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);

	return (
		<div className="space-y-2">
			<Label htmlFor="promo-expires-at-time">{t("expiresAtOptional")}</Label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<DatePickerInput
					value={dateValue}
					onChange={setDateValue}
					placeholder={t("pickExpiryDate")}
					className="w-full"
				/>
				<Input
					id="promo-expires-at-time"
					type="time"
					value={timeValue}
					onChange={(event) => setTimeValue(event.target.value)}
					className="w-full sm:w-32"
				/>
			</div>
			{expiryPreview ? (
				<div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
					<p>
						{t("timeZone")}:{" "}
						<span className="font-medium text-foreground">
							{expiryPreview.timezoneDisplay}
						</span>
					</p>
				<p>{t("localExpiry")}: {expiryPreview.localDisplay}</p>
					<p>
						{t("storedUtc")}:{" "}
						<span className="font-mono text-foreground">
							{expiryPreview.utcDisplay}
						</span>
					</p>
				</div>
			) : (
				<p className="text-xs text-muted-foreground">
					{t("timeZoneHelp", { timezone: browserTimeZone })}
				</p>
			)}
			<input type="hidden" name="expires_at" value={hiddenExpiresAt} />
		</div>
	);
}
