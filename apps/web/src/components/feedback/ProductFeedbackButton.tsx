"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareMore, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
	captureProductFeedback,
	captureProductFeedbackDismissed,
	captureProductFeedbackShown,
	type ProductFeedbackCategory,
	type ProductFeedbackReason,
} from "@/lib/productFeedback";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useTranslations } from "next-intl";

function reasonTranslationKey(reason: ProductFeedbackReason): string {
	return reason === "missing_capability"
		? "reasons.missingCapability"
		: reason === "incorrect_data"
			? "reasons.incorrectData"
			: `reasons.${reason}`;
}

const CATEGORIES: ProductFeedbackCategory[] = [
	"issue",
	"idea",
	"other",
];

const REASONS: ProductFeedbackReason[] = [
	"usability",
	"missing_capability",
	"incorrect_data",
	"reliability",
	"performance",
	"documentation",
	"other",
];

type ProductFeedbackProps = {
	surface: string;
	label?: string;
	prompt?: string;
	title?: string;
	submitLabel?: string;
	successMessage?: string;
	defaultCategory?: ProductFeedbackCategory;
	defaultReason?: ProductFeedbackReason;
	context?: Record<string, string | number | boolean | null>;
};

export function ProductFeedbackDialog(props: ProductFeedbackProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("Product.feedback");
	const defaultCategory = props.defaultCategory ?? "idea";
	const defaultReason = props.defaultReason ?? "missing_capability";
	const [category, setCategory] = useState<ProductFeedbackCategory>(defaultCategory);
	const [reason, setReason] = useState<ProductFeedbackReason>(defaultReason);
	const [message, setMessage] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const wasOpen = useRef(false);

	useEffect(() => {
		if (props.open && !wasOpen.current) {
			setCategory(defaultCategory);
			setReason(defaultReason);
			setMessage("");
			setSubmitted(false);
			captureProductFeedbackShown({ surface: props.surface, context: props.context });
		} else if (!props.open && wasOpen.current && !submitted) {
			captureProductFeedbackDismissed({ surface: props.surface, context: props.context });
		}
		wasOpen.current = props.open;
	}, [defaultCategory, defaultReason, props.open, props.surface, props.context, submitted]);

	function changeOpen(next: boolean) {
		props.onOpenChange(next);
	}

	function submit() {
		const captured = captureProductFeedback({
			surface: props.surface,
			category,
			reason,
			message,
			context: props.context,
		});
		if (!captured) {
			toast.error(message.trim() ? t("enableAnalytics") : t("addDetail"));
			return;
		}

		toast.success(props.successMessage ?? t("sent"));
		setSubmitted(true);
		setMessage("");
		setCategory(defaultCategory);
		setReason(defaultReason);
		props.onOpenChange(false);
	}

	return (
		<Dialog open={props.open} onOpenChange={changeOpen}>
			<DialogContent className="gap-5 rounded-md sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{props.title ?? t("share")}</DialogTitle>
					<DialogDescription>
						{props.prompt ?? t("defaultPrompt")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="grid grid-cols-3 gap-2" aria-label={t("category")}>
						{CATEGORIES.map((value) => (
							<Button
								key={value}
								type="button"
								variant={category === value ? "secondary" : "outline"}
								aria-pressed={category === value}
								className="rounded-md"
								onClick={() => setCategory(value)}
							>
								{t(`categories.${value}`)}
							</Button>
						))}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="product-feedback-reason">{t("reason")}</Label>
						<Select value={reason} onValueChange={(value) => setReason(value as ProductFeedbackReason)}>
							<SelectTrigger id="product-feedback-reason" className="w-full rounded-md">
								<span>{t(reasonTranslationKey(reason) as never)}</span>
							</SelectTrigger>
							<SelectContent>
								{REASONS.map((value) => <SelectItem key={value} value={value}>{t(reasonTranslationKey(value) as never)}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="product-feedback-message">{t("details")}</Label>
					<Textarea
						id="product-feedback-message"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						placeholder={t("placeholder")}
						maxLength={4_000}
						className="min-h-28 max-h-56 resize-y overflow-y-auto rounded-md"
					/>
					</div>
					<p className="text-xs text-muted-foreground">
						{t("privacyNotice")}
					</p>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" className="rounded-md" onClick={() => changeOpen(false)}>
						{t("cancel")}
					</Button>
					<Button type="button" className="rounded-md" disabled={!message.trim()} onClick={submit}>
						<SendHorizontal className="size-4" />
						{props.submitLabel ?? t("send")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ProductFeedbackButton(props: ProductFeedbackProps) {
	const t = useTranslations("Product.feedback");
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button variant="outline" className="rounded-md" onClick={() => setOpen(true)}>
				<MessageSquareMore className="size-4" />
				{props.label ?? t("send")}
			</Button>
			<ProductFeedbackDialog {...props} open={open} onOpenChange={setOpen} />
		</>
	);
}
