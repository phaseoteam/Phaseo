"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ForgotPasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (email: string) => Promise<{ success: boolean }>;
}

interface ForgotPasswordContentProps {
	email: string;
	loading: boolean;
	success: boolean;
	readOnly?: boolean;
	autoFocus?: boolean;
	titleId?: string;
	descriptionId?: string;
	onEmailChange: (email: string) => void;
	onCancel: () => void;
	onClose: () => void;
	onSubmit: React.FormEventHandler<HTMLFormElement>;
}

export function ForgotPasswordContent({
	email,
	loading,
	success,
	readOnly = false,
	autoFocus = false,
	titleId,
	descriptionId,
	onEmailChange,
	onCancel,
	onClose,
	onSubmit,
}: ForgotPasswordContentProps) {
	const t = useTranslations("Auth.forgotPassword");
	const generatedTitleId = React.useId();
	const generatedDescriptionId = React.useId();
	const resolvedTitleId = titleId ?? generatedTitleId;
	const resolvedDescriptionId = descriptionId ?? generatedDescriptionId;

	return !success ? (
		<>
			<DialogHeader>
				<h2
					id={resolvedTitleId}
					className="flex items-center gap-2 font-heading text-base font-medium leading-none"
				>
					<Mail className="h-5 w-5" />
					{t("title")}
				</h2>
				<p
					id={resolvedDescriptionId}
					className="text-sm text-muted-foreground"
				>
					{t("description")}
				</p>
			</DialogHeader>

			<form onSubmit={onSubmit} className="space-y-4">
				<div className="grid gap-2">
					<Label htmlFor="reset-email">{t("emailLabel")}</Label>
					<Input
						id="reset-email"
						type="email"
						dir="ltr"
						autoComplete="email"
						autoCapitalize="none"
						spellCheck={false}
						placeholder={t("emailPlaceholder")}
						value={email}
						onChange={(event) => onEmailChange(event.target.value)}
						autoFocus={autoFocus}
						readOnly={readOnly}
						disabled={loading}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={loading || readOnly}
					>
						{t("cancel")}
					</Button>
					<Button
						type="submit"
						disabled={!email || loading || readOnly}
					>
						{loading ? (
							<>
								<Loader2 className="me-2 h-4 w-4 animate-spin" />
								{t("sending")}
							</>
						) : (
							t("send")
						)}
					</Button>
				</div>
			</form>
		</>
	) : (
		<>
			<DialogHeader>
				<h2
					id={resolvedTitleId}
					className="flex items-center gap-2 font-heading text-base font-medium leading-none"
				>
					<CheckCircle2 className="h-5 w-5 text-green-600" />
					{t("successTitle")}
				</h2>
				<p
					id={resolvedDescriptionId}
					className="text-sm text-muted-foreground"
				>
					{t("successDescription", { email })}
				</p>
			</DialogHeader>

			<div className="space-y-4 py-4">
				<div className="rounded-lg border bg-muted/50 p-4">
					<p className="text-sm text-muted-foreground">
						<strong>{t("notReceived")}</strong>
						<br />
						{t("expiryHelp", { hours: 1 })}
					</p>
				</div>

				<div className="flex justify-end">
					<Button onClick={onClose} disabled={readOnly}>
						{t("close")}
					</Button>
				</div>
			</div>
		</>
	);
}

export function ForgotPasswordDialog({
	open,
	onOpenChange,
	onSubmit,
}: ForgotPasswordDialogProps) {
	const t = useTranslations("Auth.forgotPassword");
	const [email, setEmail] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [success, setSuccess] = React.useState(false);
	const titleId = React.useId();
	const descriptionId = React.useId();

	React.useEffect(() => {
		if (!open) {
			const timeout = window.setTimeout(() => {
				setEmail("");
				setLoading(false);
				setSuccess(false);
			}, 300);

			return () => window.clearTimeout(timeout);
		}
	}, [open]);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();

		if (!email || !email.includes("@")) {
			toast.error(t("invalidEmail"));
			return;
		}

		setLoading(true);
		try {
			await onSubmit(email);
			setSuccess(true);
		} catch {
			toast.error(t("sendFailed"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				showCloseButton={false}
			>
				<ForgotPasswordContent
					email={email}
					loading={loading}
					success={success}
					autoFocus
					titleId={titleId}
					descriptionId={descriptionId}
					onEmailChange={setEmail}
					onCancel={() => onOpenChange(false)}
					onClose={() => onOpenChange(false)}
					onSubmit={handleSubmit}
				/>
			</DialogContent>
		</Dialog>
	);
}
