import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { StripePortalButton } from "./StripePortalButton";
import { PaymentMethodsManager } from "./PaymentMethodsManager";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { paymentMethodsInitialDataQuery } from "./paymentMethods.functions";
import { getPaymentMethodsMessages } from "@/i18n/payment-methods";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { getTranslations } from "@/i18n/server";

export async function getPaymentMethodsMetadata({ params }: RouteMetadataInput) {
	const { locale } = params;
	const publicLocale = (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale;
	const [messages, t] = await Promise.all([
		Promise.resolve(getPaymentMethodsMessages(publicLocale)),
		getTranslations({ locale: publicLocale, namespace: "SettingsUI" }),
	]);
	return { title: `${messages.title} - ${t("headers.settings" as never)}` };
}

export default function PaymentMethodsPage() {
	const { locale } = useParams({ strict: false });
	const messages = getPaymentMethodsMessages((locale && isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
		<h1 className="text-2xl font-bold">{messages.title}</h1>
        <p className="text-sm text-muted-foreground">
			{messages.description}
        </p>
      </div>
      <Suspense fallback={<SettingsSectionFallback />}>
		<PaymentMethodsContent messages={messages} />
      </Suspense>
    </div>
  );
}

function PaymentMethodsContent({ messages }: { messages: ReturnType<typeof getPaymentMethodsMessages> }) {
  const { data: { customerId, initialData, obfuscateInfo } } =
    useSuspenseQuery(paymentMethodsInitialDataQuery());

  return (
    <div
      data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
      data-obfuscation-sync="true"
    >
      {!customerId ? (
        <p className="py-3 text-sm text-muted-foreground">
			{messages.noCustomer}
        </p>
      ) : (
        <PaymentMethodsManager
          initialData={initialData}
			customerPortal={<StripePortalButton customerId={customerId} label={messages.portal} />}
        />
      )}
    </div>
  );
}
