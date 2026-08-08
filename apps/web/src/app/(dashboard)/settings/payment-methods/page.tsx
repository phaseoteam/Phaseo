import { Suspense } from "react";
import { connection } from "next/server";
import { StripePortalButton } from "./StripePortalButton";
import { PaymentMethodsManager } from "./PaymentMethodsManager";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { fetchSettingsPaymentMethodsInitialData } from "@/lib/fetchers/internal/fetchSettingsPaymentMethodsInitialData";

export const metadata = {
	title: "Payment Methods - Settings",
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Payment Methods</h1>
        <p className="text-sm text-muted-foreground">
          Manage the cards used for credits, auto top-ups, and invoices.
        </p>
      </div>
      <Suspense fallback={<SettingsSectionFallback />}>
        <PaymentMethodsContent />
      </Suspense>
    </div>
  );
}

async function PaymentMethodsContent() {
	await connection();
  const { customerId, initialData, obfuscateInfo } =
    await fetchSettingsPaymentMethodsInitialData();

  return (
    <div
      data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
      data-obfuscation-sync="true"
    >
      {!customerId ? (
        <p className="py-3 text-sm text-muted-foreground">
          Add a payment method from Credits to connect this workspace to Stripe.
        </p>
      ) : (
        <PaymentMethodsManager
          initialData={initialData}
          customerPortal={<StripePortalButton customerId={customerId} label="Customer Portal" />}
        />
      )}
    </div>
  );
}
