import { TimestampHoverCard } from "@/components/display/TimestampHoverCard";

type ResetWindowHoverProps = {
	iso: string;
	triggerText: string;
};

export default function ResetWindowHover({ iso, triggerText }: ResetWindowHoverProps) {
	return <TimestampHoverCard value={iso}>{triggerText}</TimestampHoverCard>;
}
