import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/features/auth/reset-password/ResetPasswordPage";


export const Route = createFileRoute("/{-$locale}/_auth/auth/reset-password/")({
	component: ResetPasswordPage,
});
