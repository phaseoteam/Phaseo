import { Suspense } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
          Review saved cards and identify the default payment method used for auto top-ups and invoices.
        </p>
      </div>
      <Suspense fallback={<SettingsSectionFallback />}>
        <PaymentMethodsContent />
      </Suspense>
    </div>
  );
}

async function PaymentMethodsContent() {
  const { customerId, initialData, obfuscateInfo } =
    await fetchSettingsPaymentMethodsInitialData();

  return (
    <div
      data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
      data-obfuscation-sync="true"
    >
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Saved payment methods</CardTitle>
            <CardDescription>
              Review cards and identify the default payment method used for auto top-ups and invoices.
            </CardDescription>
          </div>
          {customerId ? (
            <StripePortalButton customerId={customerId} />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!customerId ? (
            <p className="text-sm text-muted-foreground">
              Add a payment method on the Credits page to link this workspace to a Stripe customer.
            </p>
          ) : (
            <PaymentMethodsManager initialData={initialData} />
          )}

          {customerId && <Separator className="my-4" />}
        </CardContent>
      </Card>
    </div>
  );
}
