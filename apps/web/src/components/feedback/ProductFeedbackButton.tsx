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

const CATEGORIES: Array<{ value: ProductFeedbackCategory; label: string }> = [
	{ value: "issue", label: "Issue" },
	{ value: "idea", label: "Idea" },
	{ value: "other", label: "Other" },
];

const REASONS: Array<{ value: ProductFeedbackReason; label: string }> = [
	{ value: "usability", label: "Confusing or difficult to use" },
	{ value: "missing_capability", label: "Missing feature or workflow" },
	{ value: "incorrect_data", label: "Incorrect or missing data" },
	{ value: "reliability", label: "Bug or unexpected behaviour" },
	{ value: "performance", label: "Slow or unresponsive" },
	{ value: "documentation", label: "Documentation or guidance" },
	{ value: "other", label: "Something else" },
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
			toast.error(message.trim() ? "Enable analytics cookies to send feedback." : "Add a little detail before sending.");
			return;
		}

		toast.success(props.successMessage ?? "Feedback sent — thank you.");
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
					<DialogTitle>{props.title ?? "Share Feedback"}</DialogTitle>
					<DialogDescription>
						{props.prompt ?? "Tell us what would make this part of Phaseo work better for you."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="grid grid-cols-3 gap-2" aria-label="Feedback category">
						{CATEGORIES.map((option) => (
							<Button
								key={option.value}
								type="button"
								variant={category === option.value ? "secondary" : "outline"}
								aria-pressed={category === option.value}
								className="rounded-md"
								onClick={() => setCategory(option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="product-feedback-reason">Reason</Label>
						<Select value={reason} onValueChange={(value) => setReason(value as ProductFeedbackReason)}>
							<SelectTrigger id="product-feedback-reason" className="w-full rounded-md">
								<span>{REASONS.find((option) => option.value === reason)?.label}</span>
							</SelectTrigger>
							<SelectContent>
								{REASONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="product-feedback-message">Details</Label>
					<Textarea
						id="product-feedback-message"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						placeholder="What should we improve?"
						maxLength={4_000}
						className="min-h-28 max-h-56 resize-y overflow-y-auto rounded-md"
					/>
					</div>
					<p className="text-xs text-muted-foreground">
						Please do not include API keys, credentials, or other sensitive information.
					</p>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" className="rounded-md" onClick={() => changeOpen(false)}>
						Cancel
					</Button>
					<Button type="button" className="rounded-md" disabled={!message.trim()} onClick={submit}>
						<SendHorizontal className="size-4" />
						{props.submitLabel ?? "Send Feedback"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ProductFeedbackButton(props: ProductFeedbackProps) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button variant="outline" className="rounded-md" onClick={() => setOpen(true)}>
				<MessageSquareMore className="size-4" />
				{props.label ?? "Feedback"}
			</Button>
			<ProductFeedbackDialog {...props} open={open} onOpenChange={setOpen} />
		</>
	);
}
