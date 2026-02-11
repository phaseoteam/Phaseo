import type Stripe from "stripe";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { getStripe } from "@/lib/stripe";
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
  const supabase = await createClient();
  const teamId = await getTeamIdFromCookie();
  const stripe = getStripe();

  let customerId: string | null = null;
  let customer: Stripe.Customer | null = null;
  let paymentMethods: Stripe.PaymentMethod[] = [];
  let defaultPaymentMethodId: string | null = null;

  if (teamId) {
    try {
      const { data, error } = await supabase
        .from("wallets")
        .select("stripe_customer_id")
        .eq("team_id", teamId)
        .maybeSingle();
      if (error) {
        console.log("[WARN] wallets fetch (payment methods):", String(error));
      } else {
        customerId = data?.stripe_customer_id ?? null;
      }
    } catch (err) {
      console.log("[ERROR] wallets fetch (payment methods):", String(err));
    }
  }

  if (customerId) {
    try {
      const customerResp = await stripe.customers.retrieve(customerId);
      if ("deleted" in customerResp && customerResp.deleted) {
        customer = null;
        defaultPaymentMethodId = null;
      } else {
        customer = customerResp as Stripe.Customer;
        defaultPaymentMethodId = (customer.invoice_settings?.default_payment_method ?? null) as string | null;
      }

      const list = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });
      paymentMethods = list.data ?? [];
    } catch (err) {
      console.log("[ERROR] stripe payment methods fetch:", String(err));
      paymentMethods = [];
    }
  }

  const initialData = {
    customer: {
      id: customerId ?? "",
      email: customer?.email ?? null,
    },
    defaultPaymentMethodId,
    paymentMethods: (paymentMethods ?? []).map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
      funding: pm.card?.funding ?? null,
      created: pm.created ?? null,
    })),
  };

  return (
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Saved payment methods</CardTitle>
            <CardDescription>
              {customerId ? (
                <span>
                  Linked Stripe customer: <code className="font-mono text-xs">{customerId}</code>
                  {customer?.email ? ` (${customer.email})` : ""}
                </span>
              ) : (
                "No Stripe customer is linked to this team yet."
              )}
            </CardDescription>
          </div>
          {customerId ? (
            <StripePortalButton customerId={customerId} />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!customerId ? (
            <p className="text-sm text-muted-foreground">
              Add a payment method on the Credits page to link this team to a Stripe customer.
            </p>
          ) : (
            <PaymentMethodsManager initialData={initialData} />
          )}

          {customerId && <Separator className="my-4" />}
        </CardContent>
      </Card>
  );
}
