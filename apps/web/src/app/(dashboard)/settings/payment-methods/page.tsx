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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StripePortalButton } from "./StripePortalButton";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

function formatCardBrand(brand: string | null | undefined) {
  if (!brand) return "Unknown";
  return brand.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatExpiry(expMonth: number | null | undefined, expYear: number | null | undefined) {
  if (!expMonth || !expYear) return "-";
  const padded = String(expMonth).padStart(2, "0");
  return `${padded}/${String(expYear).slice(-2)}`;
}

function formatDate(unixSeconds: number | null | undefined) {
  if (!unixSeconds) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
      new Date(unixSeconds * 1000),
    );
  } catch {
    return "-";
  }
}

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
          ) : paymentMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No card payment methods found. Add one during your next credit purchase.
            </p>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((pm) => {
                const card = pm.card;
                const isDefault = pm.id === defaultPaymentMethodId;
                return (
                  <div
                    key={pm.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {formatCardBrand(card?.brand)} ending {card?.last4 ?? "****"}
                        </span>
                        {isDefault && (
                          <Badge variant="secondary" className="text-[11px]">
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Expires {formatExpiry(card?.exp_month ?? null, card?.exp_year ?? null)}
                      </div>
                      {card?.funding && (
                        <div className="text-xs text-muted-foreground uppercase">
                          {card.funding}
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Added {formatDate(pm.created)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {customerId && (
            <>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground">
                Use the button above to open the Stripe customer portal for updates or removals; changes sync with Stripe instantly.
              </p>
            </>
          )}
        </CardContent>
      </Card>
  );
}
