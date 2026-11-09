import { createFileRoute } from "@tanstack/react-router";
import { VerifyMfaPage } from "@/features/auth/verify-mfa/VerifyMfaPage";


export const Route = createFileRoute("/{-$locale}/_auth/auth/verify-mfa/")({
	component: VerifyMfaPage,
});
