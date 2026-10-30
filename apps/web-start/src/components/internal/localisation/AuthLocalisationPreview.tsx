	"use client";

import { useState, type SyntheticEvent } from "react";
import { useTranslations } from "next-intl";
import { AuthErrorCard } from "@/components/(gateway)/auth/AuthErrorCard";
import { ForgotPasswordContent } from "@/components/(gateway)/auth/ForgotPasswordDialog";
import { Login } from "@/components/(gateway)/auth/Login";
import { SignUp } from "@/components/(gateway)/auth/sign-up/SignUp";
import { Button } from "@/components/ui/button";

const surfaces = [
	"sign-in",
	"sign-up",
	"reset",
	"reset-sent",
	"error",
] as const;
type PreviewSurface = (typeof surfaces)[number];

function preventPreviewAction(event: SyntheticEvent) {
	event.preventDefault();
	event.stopPropagation();
}

export function AuthLocalisationPreview() {
	const [surface, setSurface] = useState<PreviewSurface>("sign-in");
	const t = useTranslations("Product.internalTools.localisationPreview");
	const shared = useTranslations("Auth.shared");
	const error = useTranslations("Auth.error");

	return (
		<div className="space-y-6">
			<div
				className="flex flex-wrap gap-2"
				role="group"
				aria-label={t("surfaceGroup")}
			>
				{surfaces.map((candidate) => (
					<Button
						key={candidate}
						type="button"
						variant={surface === candidate ? "default" : "outline"}
						size="sm"
						aria-pressed={surface === candidate}
						onClick={() => setSurface(candidate)}
					>
						{t(`surfaces.${candidate}` as never)}
					</Button>
				))}
			</div>

			<p id="localisation-preview-readonly" className="text-sm text-muted-foreground">
				{t("readonlyNotice")}
			</p>

			<div
				role="region"
				aria-label={t("previewRegion")}
				aria-describedby="localisation-preview-readonly"
				onClickCapture={preventPreviewAction}
				onSubmitCapture={preventPreviewAction}
				className="mx-auto w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm"
			>
				{surface === "sign-in" ? (
					<Login
						signupNotice="check-email"
						authError="auth-failed"
						ssoEnabled
					/>
				) : null}
				{surface === "sign-up" ? <SignUp /> : null}
				{surface === "reset" ? (
					<ForgotPasswordContent
						email=""
						loading={false}
						success={false}
						readOnly
						onEmailChange={() => undefined}
						onCancel={() => undefined}
						onClose={() => undefined}
						onSubmit={preventPreviewAction}
					/>
				) : null}
				{surface === "reset-sent" ? (
					<ForgotPasswordContent
						email={shared("emailPlaceholder")}
						loading={false}
						success
						readOnly
						onEmailChange={() => undefined}
						onCancel={() => undefined}
						onClose={() => undefined}
						onSubmit={preventPreviewAction}
					/>
				) : null}
				{surface === "error" ? (
					<AuthErrorCard
						heading={error("heading")}
						message={error("workspaceSetup")}
						backToSignInLabel={error("backToSignIn")}
					/>
				) : null}
			</div>
		</div>
	);
}
