"use client";

import { useMemo, useState } from "react";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildExpiryUtcIso } from "@/lib/credits/expiryDateTime";

type Props = {
	defaultTime?: string;
};

export default function ExpiryDateTimeField({
	defaultTime = "23:59",
}: Props) {
	const [dateValue, setDateValue] = useState("");
	const [timeValue, setTimeValue] = useState(defaultTime);

	const hiddenExpiresAt = useMemo(() => {
		return buildExpiryUtcIso(dateValue, timeValue, defaultTime);
	}, [dateValue, timeValue, defaultTime]);

	return (
		<div className="space-y-2">
			<Label htmlFor="promo-expires-at-time">Expires At (optional)</Label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<DatePickerInput
					value={dateValue}
					onChange={setDateValue}
					placeholder="Pick expiry date"
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
			<input type="hidden" name="expires_at" value={hiddenExpiresAt} />
		</div>
	);
}
